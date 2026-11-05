import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
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
// Unified sign-in: admins use their existing account and are routed to admin dashboard.
// No role or authorization level is accepted from the browser.
const unifiedLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/login',unifiedLimit,async(req,res)=>{
 const p=loginSchema.safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Datos inválidos'});
 const email=emailKey(p.data.email);
 try{
  const [[admin]]=await db.execute('SELECT id,password_hash,is_active FROM admins WHERE email=? LIMIT 1',[email]);
  const [[customer]]=await db.execute('SELECT id,password_hash FROM users WHERE email=? LIMIT 1',[email]);
  const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const [adminValid,customerValid]=await Promise.all([
   bcrypt.compare(p.data.password,(customer && admin?.is_active ? customer.password_hash : admin?.password_hash)||dummy),
   bcrypt.compare(p.data.password,customer?.password_hash||dummy)
  ]);
  if(admin?.is_active && adminValid){
   return res.json({accountType:'admin',token:jwt.sign({sub:String(admin.id)},process.env.JWT_SECRET,{expiresIn:'20m',issuer:'fijas-de-elite',audience:'admin'})});
  }
  if(customer && customerValid){
   return res.json({accountType:'customer',token:jwt.sign({sub:String(customer.id)},process.env.JWT_SECRET,{expiresIn:'30m',issuer:'fijas-de-elite',audience:'customer'})});
  }
  return res.status(401).json({error:'Credenciales incorrectas'});
 }catch(e){console.error('unified login',e.code||e.message);return res.status(500).json({error:'No se pudo iniciar sesión'});}
});
app.post('/api/auth/login',async(req,res)=>{
 const p=loginSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Datos inválidos'});
 try{
  const [rows]=await db.execute('SELECT id,email,password_hash,role,is_active FROM admins WHERE email=? LIMIT 1',[emailKey(p.data.email)]);
  const admin=rows[0];
  // Compare against a dummy hash to reduce account enumeration timing.
  const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const [[linkedUser]]=await db.execute('SELECT password_hash FROM users WHERE email=? LIMIT 1',[emailKey(p.data.email)]);const valid=await bcrypt.compare(p.data.password,(linkedUser && admin?.is_active ? linkedUser.password_hash : admin?.password_hash)||dummy);
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
// Public teasers contain no picks, odds, selections or analysis.
app.get('/api/predictions/teasers',async(req,res)=>{
 try{const [rows]=await db.query("SELECT id,title,league,match_date,visibility FROM predictions WHERE published_at IS NOT NULL ORDER BY id DESC LIMIT 12");res.json({predictions:rows});}
 catch(e){console.error('teasers',e.code||e.message);res.status(500).json({error:'No disponible'});}
});
// Legacy endpoint must never expose free predictions anonymously.
app.get('/api/predictions/free',(req,res)=>res.status(401).json({error:'Inicia sesión para ver pronósticos gratuitos'}));

// V0.4: catálogo, clientes y solicitudes manuales. No se procesan cargos reales.
const registerLimit=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
const customerRegister=z.object({email:z.string().email().max(254),password:z.string().min(12).max(128),display_name:z.string().trim().min(2).max(120)}).strict();
const planSchema=z.object({name:z.string().trim().min(3).max(100),duration_days:z.coerce.number().int().min(1).max(365),price_pen:z.coerce.number().min(0).max(100000)}).strict();
const paymentRequest=z.object({plan_id:z.coerce.number().int().positive(),method:z.enum(['yape','plin','direct']),reference:z.string().trim().min(4).max(190)}).strict();
const canManagePayments=a=>['owner','general_admin','payments_admin'].includes(a.role);
app.get('/api/plans',async(req,res)=>{try{const [plans]=await db.query('SELECT id,name,duration_days,price_pen FROM plans WHERE active=1 ORDER BY price_pen,id');res.json({plans});}catch{res.status(500).json({error:'No se pudieron consultar los planes'});}});
app.post('/api/customers/register',registerLimit,async(req,res)=>{
 const p=customerRegister.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Revisa los datos y utiliza una contraseña de 12 caracteres como mínimo'});
 try{const [[existingAdmin]]=await db.execute('SELECT id FROM admins WHERE email=? LIMIT 1',[emailKey(p.data.email)]);if(existingAdmin)return res.status(409).json({error:'Correo ya registrado'});const hash=await bcrypt.hash(p.data.password,12);const [r]=await db.execute('INSERT INTO users(email,display_name,password_hash) VALUES (?,?,?)',[emailKey(p.data.email),p.data.display_name,hash]);res.status(201).json({ok:true,user_id:r.insertId});}
 catch(e){res.status(e.code==='ER_DUP_ENTRY'?409:500).json({error:e.code==='ER_DUP_ENTRY'?'Correo ya registrado':'No se pudo registrar'});}
});
app.post('/api/customers/login',registerLimit,async(req,res)=>{
 const p=loginSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Datos inválidos'});
 try{const [[u]]=await db.execute('SELECT id,password_hash FROM users WHERE email=?',[emailKey(p.data.email)]);const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';const ok=await bcrypt.compare(p.data.password,u?.password_hash||dummy);if(!u||!ok)return res.status(401).json({error:'Credenciales incorrectas'});res.json({token:jwt.sign({sub:String(u.id)},process.env.JWT_SECRET,{expiresIn:'30m',issuer:'fijas-de-elite',audience:'customer'})});}
 catch{res.status(500).json({error:'No se pudo iniciar sesión'});}
});
// Password recovery: hashed, single-use, expiring tokens; no account enumeration.
const resetLimit=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
const resetRequestSchema=z.object({email:z.string().email().max(254)}).strict();
const resetFinishSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(12).max(128)}).strict();
const resetHash=t=>crypto.createHash('sha256').update(t).digest('hex');
app.post('/api/customers/forgot-password',resetLimit,async(req,res)=>{
 const p=resetRequestSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Correo inválido'});
 const generic={message:'Si el correo existe, recibirás instrucciones para recuperar tu contraseña.'};
 try{
  const [[u]]=await db.execute('SELECT id,email FROM users WHERE email=? LIMIT 1',[emailKey(p.data.email)]);
  if(!u)return res.json(generic);
  const keys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','PUBLIC_BASE_URL'];
  if(keys.some(k=>!process.env[k])){console.error('Password recovery SMTP is not configured');return res.status(503).json({error:'Recuperación temporalmente no disponible. Contacta con soporte.'});}
  const raw=crypto.randomBytes(32).toString('hex');
  const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
  const url=new URL('/clientes.html',process.env.PUBLIC_BASE_URL);url.searchParams.set('reset_token',raw);
  await db.execute('DELETE FROM customer_password_resets WHERE user_id=?',[u.id]);
  await db.execute('INSERT INTO customer_password_resets(user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 20 MINUTE))',[u.id,resetHash(raw)]);
  await transporter.sendMail({from:process.env.SMTP_FROM,to:u.email,subject:'Fijas de Élite · Recuperar contraseña',text:`Para restablecer tu contraseña abre este enlace (válido 20 minutos):\n${url.toString()}\nSi no lo solicitaste, ignora este mensaje.`});
  res.json(generic);
 }catch(e){console.error('Password recovery failed',e.code||e.message);res.status(503).json({error:'No se pudo enviar el correo. Intenta más tarde.'});}
});
app.post('/api/customers/reset-password',resetLimit,async(req,res)=>{
 const p=resetFinishSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Enlace o contraseña inválidos'});
 const conn=await db.getConnection();try{
  await conn.beginTransaction();
  const [[row]]=await conn.execute('SELECT user_id FROM customer_password_resets WHERE token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[resetHash(p.data.token)]);
  if(!row){await conn.rollback();return res.status(400).json({error:'Enlace vencido o utilizado'});}
  const hash=await bcrypt.hash(p.data.password,12);
  await conn.execute('UPDATE users SET password_hash=? WHERE id=?',[hash,row.user_id]);
  await conn.execute('DELETE FROM customer_password_resets WHERE user_id=?',[row.user_id]);
  await conn.commit();res.json({ok:true});
 }catch(e){await conn.rollback();console.error('reset password failed',e.code||e.message);res.status(500).json({error:'No se pudo actualizar la contraseña'});}finally{conn.release();}
});
async function customerAuth(req,res,next){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Inicia sesión'});try{const t=jwt.verify(h.slice(7),process.env.JWT_SECRET,{issuer:'fijas-de-elite',audience:'customer'});const [[u]]=await db.execute('SELECT id,email,display_name FROM users WHERE id=?',[t.sub]);if(!u)return res.status(401).json({error:'Cuenta no disponible'});req.customer=u;next();}catch{return res.status(401).json({error:'Sesión inválida'});}}
// Always authorize content on the server; never send VIP selections to non-VIP users.
app.get('/api/customers/predictions',customerAuth,async(req,res)=>{
 try{
  const [[active]]=await db.execute("SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND status='active' AND starts_at<=UTC_TIMESTAMP() AND ends_at>UTC_TIMESTAMP()) AS has_vip",[req.customer.id]);
  const vip=Boolean(active.has_vip);
  const [rows]=await db.query("SELECT id,title,league,match_date,visibility,analysis,market,selection,odds,outcome FROM predictions WHERE published_at IS NOT NULL ORDER BY id DESC LIMIT 50");
  res.set('Cache-Control','private, no-store');
  res.json({has_vip:vip,predictions:rows.map(p=>p.visibility==='vip'&&!vip?{id:p.id,title:p.title,league:p.league,match_date:p.match_date,visibility:'vip',locked:true}:{...p,locked:false})});
 }catch(e){console.error('customer predictions',e.code||e.message);res.status(500).json({error:'No se pudieron cargar los pronósticos'});}
});
app.get('/api/customers/me',customerAuth,async(req,res)=>{const [memberships]=await db.execute('SELECT m.id,m.status,m.starts_at,m.ends_at,p.name AS plan FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.user_id=? ORDER BY m.id DESC LIMIT 20',[req.customer.id]);res.json({user:req.customer,memberships});});
app.post('/api/customers/payment-requests',customerAuth,async(req,res)=>{
 const p=paymentRequest.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Datos de solicitud inválidos'});
 const conn=await db.getConnection();try{await conn.beginTransaction();const [[plan]]=await conn.execute('SELECT id,price_pen FROM plans WHERE id=? AND active=1',[p.data.plan_id]);if(!plan){await conn.rollback();return res.status(404).json({error:'Plan no disponible'});}
 const [m]=await conn.execute("INSERT INTO memberships(user_id,plan_id,status) VALUES (?,?,'pending')",[req.customer.id,plan.id]);const [pay]=await conn.execute("INSERT INTO payments(user_id,membership_id,method,amount_pen,status,external_reference) VALUES (?,?,?,?, 'pending',?)",[req.customer.id,m.insertId,p.data.method,plan.price_pen,p.data.reference]);await conn.commit();res.status(201).json({payment_id:pay.insertId,status:'pending',message:'Solicitud recibida. No implica que el pago esté confirmado.'});}
 catch(e){await conn.rollback();console.error('payment request',e.code||e.message);res.status(500).json({error:'No se pudo guardar la solicitud'});}finally{conn.release();}
});
app.get('/api/admin/plans',authenticate,async(req,res)=>{const [plans]=await db.query('SELECT id,name,duration_days,price_pen,active FROM plans ORDER BY id DESC LIMIT 100');res.json({plans});});
app.post('/api/admin/plans',authenticate,async(req,res)=>{if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});const p=planSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Plan inválido'});try{const [r]=await db.execute('INSERT INTO plans(name,duration_days,price_pen,active) VALUES (?,?,?,1)',[p.data.name,p.data.duration_days,p.data.price_pen]);await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id) VALUES (?,'plan_created','plan',?)",[req.admin.id,String(r.insertId)]);res.status(201).json({id:r.insertId});}catch{res.status(500).json({error:'No se pudo crear el plan'});}});
app.get('/api/admin/customers',authenticate,async(req,res)=>{if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});const [users]=await db.query('SELECT id,email,display_name,created_at FROM users ORDER BY id DESC LIMIT 100');res.json({users});});
app.get('/api/admin/payments',authenticate,async(req,res)=>{if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});const [payments]=await db.query('SELECT py.id,py.method,py.amount_pen,py.status,py.external_reference,py.created_at,u.email,p.name AS plan FROM payments py JOIN users u ON u.id=py.user_id JOIN memberships m ON m.id=py.membership_id JOIN plans p ON p.id=m.plan_id ORDER BY py.id DESC LIMIT 100');res.json({payments});});
app.post('/api/admin/payments/:id/decision',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});
 if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({error:'ID inválido'});
 const parsed=z.object({decision:z.enum(['verified','rejected'])}).strict().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Decisión inválida'});
 const conn=await db.getConnection();try{await conn.beginTransaction();const [[payment]]=await conn.execute('SELECT id,status,membership_id FROM payments WHERE id=? FOR UPDATE',[req.params.id]);if(!payment){await conn.rollback();return res.status(404).json({error:'Pago no encontrado'});}if(payment.status!=='pending'){await conn.rollback();return res.status(409).json({error:'Solicitud ya procesada'});}
 if(parsed.data.decision==='verified'){
 const [[membership]]=await conn.execute('SELECT m.id,m.user_id,m.plan_id,p.duration_days FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.id=? FOR UPDATE',[payment.membership_id]);if(!membership)throw new Error('Membresía no encontrada');
 const [[current]]=await conn.execute("SELECT MAX(ends_at) AS last_end FROM memberships WHERE user_id=? AND status='active'",[membership.user_id]);
 const start=current?.last_end && new Date(current.last_end)>new Date()?new Date(current.last_end):new Date();
 const end=new Date(start.getTime()+membership.duration_days*86400000);
 await conn.execute("UPDATE memberships SET status='active',starts_at=?,ends_at=? WHERE id=?",[start,end,membership.id]);
 }else await conn.execute("UPDATE memberships SET status='cancelled' WHERE id=? AND status='pending'",[payment.membership_id]);
 await conn.execute('UPDATE payments SET status=?,verified_by=?,verified_at=UTC_TIMESTAMP() WHERE id=?',[parsed.data.decision,req.admin.id,payment.id]);
 await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'payment_decision','payment',?,JSON_OBJECT('decision',?))",[req.admin.id,String(payment.id),parsed.data.decision]);await conn.commit();res.json({ok:true,status:parsed.data.decision});
 }catch(e){await conn.rollback();console.error('payment decision',e.code||e.message);res.status(500).json({error:'No se pudo procesar'});}finally{conn.release();}
});

// Staff: registration always creates a customer. Only the owner may grant or revoke staff roles.
const staffRoleSchema=z.object({role:z.enum(['general_admin','payments_admin','analyst','moderator','customer'])}).strict();
app.get('/api/admin/staff',authenticate,async(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede gestionar el personal'});
 try{const [rows]=await db.query(`SELECT u.id,u.email,u.display_name,COALESCE(IF(a.is_active=1,a.role,NULL),'customer') AS role FROM users u LEFT JOIN admins a ON a.email=u.email ORDER BY u.id DESC LIMIT 200`);res.json({users:rows});}
 catch(e){console.error('staff list',e.code||e.message);res.status(500).json({error:'No se pudo consultar el personal'});}
});
app.post('/api/admin/staff/:id/role',authenticate,async(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede asignar roles'});
 if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({error:'ID inválido'});
 const parsed=staffRoleSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Rol inválido'});
 const conn=await db.getConnection();try{
  await conn.beginTransaction();
  const [[u]]=await conn.execute('SELECT id,email,password_hash FROM users WHERE id=? FOR UPDATE',[req.params.id]);
  if(!u||!u.password_hash){await conn.rollback();return res.status(404).json({error:'El usuario debe registrarse primero'});}
  const [[a]]=await conn.execute('SELECT id,role FROM admins WHERE email=? FOR UPDATE',[u.email]);
  if(a?.role==='owner'){await conn.rollback();return res.status(403).json({error:'No se puede modificar al dueño'});}
  if(parsed.data.role==='customer'){
   if(a)await conn.execute('UPDATE admins SET is_active=0 WHERE id=?',[a.id]);
  }else if(a){await conn.execute('UPDATE admins SET role=?,is_active=1 WHERE id=?',[parsed.data.role,a.id]);}
  else await conn.execute('INSERT INTO admins(email,password_hash,role,is_active) VALUES (?,?,?,1)',[u.email,u.password_hash,parsed.data.role]);
  await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'staff_role_changed','user',?,JSON_OBJECT('role',?))",[req.admin.id,String(u.id),parsed.data.role]);
  await conn.commit();res.json({ok:true,role:parsed.data.role});
 }catch(e){await conn.rollback();console.error('staff update',e.code||e.message);res.status(500).json({error:'No se pudo cambiar el rol'});}finally{conn.release();}
});

// Pago automático: integración desactivada hasta configurar proveedor, firma webhook y conciliación.
app.get('/api/payments/automatic/status',(req,res)=>res.json({enabled:false,reason:'Pasarela y webhook verificado pendientes'}));

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
app.use(express.static(root,{index:'index.html',dotfiles:'ignore'}));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((req,res)=>res.status(404).send('Not Found'));
const port=Number(process.env.PORT||3000);
try{await initializeDatabase();await db.query(`CREATE TABLE IF NOT EXISTS customer_password_resets (user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);app.listen(port,'0.0.0.0',()=>console.log(`Fijas de Elite API listening on ${port}`));}
catch(e){console.error('Database initialization failed:',e);process.exitCode=1;await db.end();}
