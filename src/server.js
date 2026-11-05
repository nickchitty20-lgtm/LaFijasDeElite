import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {db} from './db.js';
import {initializeDatabase} from './init-db.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
const app = express();
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'","data:"],objectSrc:["'none'"]}}}));
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',') || false}));
app.use(express.json({limit:'16kb'}));
const authLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
app.use('/api/auth',authLimit);
app.get('/health',async(req,res)=>{try{await db.query('SELECT 1');res.json({status:'ok',database:'connected'});}catch{res.status(503).json({status:'unavailable'});}});

const loginSchema=z.object({email:z.string().email().max(254),password:z.string().min(1).max(256)}).strict();
const setupSchema=loginSchema.extend({setupToken:z.string().min(32).max(512),password:z.string().min(12).max(128)}).strict();
const emailKey=e=>e.trim().toLowerCase();
const equalSecret=(a,b)=>{const aa=crypto.createHash('sha256').update(a).digest();const bb=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(aa,bb);};

app.get('/api/setup/status',async(req,res)=>{
 try{const [[r]]=await db.query("SELECT COUNT(*) AS n FROM admins WHERE role='owner'");res.json({setupAvailable:r.n===0 && Boolean(process.env.OWNER_SETUP_TOKEN)});}catch{res.status(503).json({error:'Unavailable'});}
});
app.post('/api/auth/setup-owner',async(req,res)=>{
 const p=setupSchema.safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Revisa el correo, la contraseña (mínimo 12 caracteres) y el token'});
 const secret=process.env.OWNER_SETUP_TOKEN;
 if(!secret || secret.length<32 || !equalSecret(p.data.setupToken,secret))return res.status(403).json({error:'Configuración no autorizada'});
 const conn=await db.getConnection();let locked=false;
 try{
  const [[lock]]=await conn.query("SELECT GET_LOCK('fijas_owner_setup_v1', 5) AS acquired");
  if(lock.acquired!==1)return res.status(503).json({error:'Intenta de nuevo'});
  locked=true;
  await conn.beginTransaction();
  const [[count]]=await conn.query("SELECT COUNT(*) AS n FROM admins WHERE role='owner'");
  if(count.n!==0){await conn.rollback();return res.status(409).json({error:'Ya existe una cuenta de dueño'});}
  const hash=await bcrypt.hash(p.data.password,12);
  const [result]=await conn.execute("INSERT INTO admins(email,password_hash,role,is_active) VALUES (?,?,'owner',1)",[emailKey(p.data.email),hash]);
  await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id) VALUES (?,'owner_created','admin',?)",[result.insertId,String(result.insertId)]);
  await conn.commit();
  return res.status(201).json({ok:true,message:'Dueño creado. Borra OWNER_SETUP_TOKEN de Railway y entra con tu cuenta.'});
 }catch(e){try{await conn.rollback();}catch{}console.error('owner setup error',e.code||e.message);return res.status(e.code==='ER_DUP_ENTRY'?409:500).json({error:'No se pudo crear la cuenta'});}
 finally{if(locked)try{await conn.query("SELECT RELEASE_LOCK('fijas_owner_setup_v1')");}catch{}conn.release();}
});
app.post('/api/auth/login',async(req,res)=>{
 const p=loginSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Datos inválidos'});
 try{
  const [rows]=await db.execute('SELECT id,email,password_hash,role,is_active FROM admins WHERE email=? LIMIT 1',[emailKey(p.data.email)]);
  const admin=rows[0];
  // Compare against a dummy hash to reduce account enumeration timing.
  const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const valid=await bcrypt.compare(p.data.password,admin?.password_hash||dummy);
  if(!admin || !admin.is_active || !valid)return res.status(401).json({error:'Credenciales incorrectas'});
  const token=jwt.sign({sub:String(admin.id)},process.env.JWT_SECRET,{expiresIn:'20m',issuer:'fijas-de-elite',audience:'admin'});
  res.json({token,admin:{id:admin.id,email:admin.email,role:admin.role},mfaRequiredForProduction:true});
 }catch(e){console.error('login error',e.code||e.message);res.status(500).json({error:'Error interno'});}
});
async function authenticate(req,res,next){
 const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Sin autorización'});
 try{
  const payload=jwt.verify(h.slice(7),process.env.JWT_SECRET,{issuer:'fijas-de-elite',audience:'admin'});
  const [rows]=await db.execute('SELECT id,email,role,is_active FROM admins WHERE id=? LIMIT 1',[payload.sub]);
  if(!rows[0]?.is_active)return res.status(403).json({error:'Acceso denegado'});
  req.admin=rows[0];next();
 }catch{return res.status(401).json({error:'Sesión inválida o vencida'});}
}
app.get('/api/admin/me',authenticate,(req,res)=>res.json(req.admin));
app.get('/api/admin/overview',authenticate,async(req,res)=>{
 try{
  const [rows]=await db.query(`SELECT
   (SELECT COUNT(*) FROM users) AS users,
   (SELECT COUNT(*) FROM memberships WHERE status='active' AND ends_at > NOW()) AS active_memberships,
   (SELECT COUNT(*) FROM payments WHERE status='pending') AS pending_payments,
   (SELECT COUNT(*) FROM predictions) AS predictions`);
  res.json({stats:rows[0],role:req.admin.role});
 }catch(e){console.error('overview error',e.code||e.message);res.status(500).json({error:'Error interno'});}
});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
app.use(express.static(root,{index:'index.html',dotfiles:'ignore'}));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((req,res)=>res.status(404).send('Not Found'));
const port=Number(process.env.PORT||3000);
try{await initializeDatabase();app.listen(port,'0.0.0.0',()=>console.log(`Fijas de Elite API listening on ${port}`));}
catch(e){console.error('Database initialization failed:',e);process.exitCode=1;await db.end();}
