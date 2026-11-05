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
// Pronósticos: la publicación web se guarda primero; Telegram se intenta después.
const predictionSchema=z.object({title:z.string().trim().min(5).max(200),analysis:z.string().trim().min(10).max(8000),visibility:z.enum(['free','vip']),match_date:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),league:z.string().trim().min(2).max(120),market:z.string().trim().min(2).max(120),selection:z.string().trim().min(1).max(160),odds:z.coerce.number().min(1.01).max(1000)}).strict();
const outcomeSchema=z.object({outcome:z.enum(['pending','won','lost','void'])}).strict();
const allowedToPublish=(a)=>['owner','general_admin','analyst'].includes(a.role);
function escapeHtml(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function sendTelegram(row){
 const bot=process.env.TELEGRAM_BOT_TOKEN;
 const channel=row.visibility==='vip'?process.env.TELEGRAM_VIP_CHAT_ID:process.env.TELEGRAM_FREE_CHAT_ID;
 if(!bot||!channel)return {state:'not_configured'};
 const label=row.visibility==='vip'?'🔒 VIP':'⚽ GRATIS';
 const message=`${label} | <b>${escapeHtml(row.title)}</b>\n🏆 ${escapeHtml(row.league)}\n📅 ${escapeHtml(row.match_date)} (UTC)\n🎯 ${escapeHtml(row.market)}: ${escapeHtml(row.selection)}\n📊 Cuota: ${Number(row.odds).toFixed(2)}\n\n${escapeHtml(row.analysis)}\n\nPronóstico, no garantía de resultado.`;
 const response=await fetch(`https://api.telegram.org/bot${bot}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:channel,text:message,parse_mode:'HTML',disable_web_page_preview:true}),signal:AbortSignal.timeout(12000)});
 const result=await response.json();if(!response.ok||!result.ok)throw new Error('Telegram rejected message');
 return {state:'sent'};
}
app.get('/api/admin/predictions',authenticate,async(req,res)=>{
 try{const [rows]=await db.query('SELECT id,title,analysis,visibility,outcome,published_at,league,match_date,market,selection,odds,telegram_status FROM predictions ORDER BY id DESC LIMIT 100');res.json({predictions:rows});}
 catch(e){console.error('list predictions',e.code||e.message);res.status(500).json({error:'No se pudo listar'});}
});
app.post('/api/admin/predictions',authenticate,async(req,res)=>{
 if(!allowedToPublish(req.admin))return res.status(403).json({error:'Sin permisos para publicar'});
 const parsed=predictionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Datos inválidos: revisa todos los campos'});
 const p=parsed.data;
 try{
  const [r]=await db.execute(`INSERT INTO predictions (title,analysis,visibility,outcome,published_at,author_id,league,match_date,market,selection,odds,telegram_status) VALUES (?,?,?,'pending',UTC_TIMESTAMP(),?,?,?,?,?,?,'pending')`,[p.title,p.analysis,p.visibility,req.admin.id,p.league,p.match_date.replace('T',' ')+':00',p.market,p.selection,p.odds]);
  await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id) VALUES (?,'prediction_created','prediction',?)",[req.admin.id,String(r.insertId)]);
  const row={...p,id:r.insertId};let telegram='not_configured';
  try{telegram=(await sendTelegram(row)).state;}catch(e){telegram='failed';console.error('Telegram delivery failed for prediction',r.insertId,e.message);}
  await db.execute('UPDATE predictions SET telegram_status=? WHERE id=?',[telegram,r.insertId]);
  res.status(201).json({id:r.insertId,web:'published',telegram});
 }catch(e){console.error('create prediction',e.code||e.message);res.status(500).json({error:'No se pudo publicar'});}
});
app.patch('/api/admin/predictions/:id/outcome',authenticate,async(req,res)=>{
 if(!allowedToPublish(req.admin))return res.status(403).json({error:'Sin permisos'});
 if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({error:'ID inválido'});
 const p=outcomeSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Resultado inválido'});
 try{const [r]=await db.execute('UPDATE predictions SET outcome=? WHERE id=?',[p.data.outcome,req.params.id]);if(!r.affectedRows)return res.status(404).json({error:'No existe'});
 await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'prediction_outcome_updated','prediction',?,JSON_OBJECT('outcome',?))",[req.admin.id,req.params.id,p.data.outcome]);res.json({ok:true});}
 catch(e){console.error('outcome update',e.code||e.message);res.status(500).json({error:'No se pudo actualizar'});}
});
// Solo contenido gratuito es público. VIP necesita autenticación de clientes, pendiente.
app.get('/api/predictions/free',async(req,res)=>{
 try{const [rows]=await db.query("SELECT id,title,analysis,league,match_date,market,selection,odds,outcome,published_at FROM predictions WHERE visibility='free' AND published_at IS NOT NULL ORDER BY id DESC LIMIT 50");res.json({predictions:rows});}
 catch{res.status(500).json({error:'No disponible'});}
});

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
app.use(express.static(root,{index:'index.html',dotfiles:'ignore'}));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((req,res)=>res.status(404).send('Not Found'));
const port=Number(process.env.PORT||3000);
try{await initializeDatabase();app.listen(port,'0.0.0.0',()=>console.log(`Fijas de Elite API listening on ${port}`));}
catch(e){console.error('Database initialization failed:',e);process.exitCode=1;await db.end();}
