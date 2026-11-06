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
import {buildMembershipSummary} from './membership-summary.js';
import {isBlacklisted,roleRank,blockedAccountResponse} from './account-policy.js';
import {getVipEntitlement} from './vip-access.js';
import {manualVipPeriod} from './manual-vip.js';
import {evaluateMembershipArchive} from './membership-archive-policy.js';
import {paypalReadiness,validatePaypalCapture,refundState,usdCents,captureIdFromRefund} from './paypal-rules.js';
import {sendPredictionToTelegram} from './telegram-bridge.js';
import {installTelegramRoutes} from './telegram-routes.js';
import {installNotificationCenter,enqueueVipActivation,enqueuePredictionEvent} from './notification-center.js';
import {installFootballAutomation} from './football-automation.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
const APP_VERSION = '2.1.0';
const app = express();
let telegramVipControl=null;
let notificationControl=null;
let footballControl=null;
// Railway terminates HTTPS behind one reverse proxy; trust only that hop.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'","data:"],objectSrc:["'none'"]}}}));
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',') || false}));
// Preserve PayPal's exact signed bytes before the JSON parser runs.
app.use('/api/payments/paypal/webhook',express.raw({type:'application/json',limit:'128kb'}));
app.use(express.json({limit:'16kb'}));

// Persistent same-site sessions, no JWT exposed to browser JavaScript.
// Customers stay connected for 14 days; administrative sessions expire after 12 hours.
const SESSION_COOKIE='fijas_session';
const sessionMaxAge={customer:14*24*60*60*1000,admin:12*60*60*1000};
const sessionFingerprint=passwordHash=>crypto.createHmac('sha256',process.env.JWT_SECRET)
 .update(passwordHash).digest('hex');
const cookieSecure=req=>req.secure || process.env.NODE_ENV==='production';
const cookieOptions=req=>({httpOnly:true,secure:cookieSecure(req),sameSite:'lax',path:'/'});
function setSessionCookie(req,res,audience,accountId,passwordHash){
 const token=jwt.sign({sub:String(accountId),sv:sessionFingerprint(passwordHash)},process.env.JWT_SECRET,{
  expiresIn:audience==='admin'?'12h':'14d',issuer:'fijas-de-elite',audience
 });
 const cookie=encodeURIComponent(token);
 const flags=[`${SESSION_COOKIE}=${cookie}`,'Path=/','HttpOnly','SameSite=Lax',`Max-Age=${Math.floor(sessionMaxAge[audience]/1000)}`];
 if(cookieSecure(req))flags.push('Secure');
 res.setHeader('Set-Cookie',flags.join('; '));
 return token;
}
function clearSessionCookie(req,res){
 res.setHeader('Set-Cookie',[`${SESSION_COOKIE}=`,'Path=/','HttpOnly','SameSite=Lax','Max-Age=0',...(cookieSecure(req)?['Secure']:[])].join('; '));
}
function sessionToken(req){
 const bearer=req.headers.authorization||'';
 if(bearer.startsWith('Bearer '))return bearer.slice(7); // brief support for older deployed tabs
 const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='));
 if(!cookie)return null;
 try{return decodeURIComponent(cookie.slice(SESSION_COOKIE.length+1));}catch{return null;}
}
function verifyToken(req,audience){
 const token=sessionToken(req);
 if(!token)return null;
 return jwt.verify(token,process.env.JWT_SECRET,{issuer:'fijas-de-elite',audience});
}
function sessionStillValid(payload,hash){
 // Legacy short-lived Bearer tokens are accepted until natural expiry, but new
 // HttpOnly-cookie sessions are invalidated whenever the password changes.
 return !payload.sv || payload.sv===sessionFingerprint(hash);
}
// Cookie-based authentication needs a CSRF defense on state-changing requests.
// Accept requests only from this origin; PayPal returns via a top-level GET (SameSite=Lax).
app.use('/api',(req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(['/payments/paypal/webhook','/telegram/webhook'].includes(req.path) && req.method==='POST')return next(); // Webhook uses PayPal cryptographic signature.
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 const origin=req.get('Origin');
 const requestOrigin=`${req.protocol}://${req.get('host')}`;
 let configuredOrigin=requestOrigin;
 try{if(process.env.PUBLIC_BASE_URL)configuredOrigin=new URL(process.env.PUBLIC_BASE_URL).origin;}catch{}
 if(origin && origin!==requestOrigin && origin!==configuredOrigin)
  return res.status(403).json({error:'Origen de solicitud no autorizado'});
 if(!origin && req.headers.cookie && !req.headers.authorization){
  let refererOrigin='';
  try{if(req.get('Referer'))refererOrigin=new URL(req.get('Referer')).origin;}catch{}
  if(![requestOrigin,configuredOrigin].includes(refererOrigin) && req.get('Sec-Fetch-Site')!=='same-origin')
   return res.status(403).json({error:'Solicitud no autorizada desde otro sitio'});
 }
 next();
});

// All /api rate limits return JSON, so clients never parse HTML/text 429 pages as JSON.
// The proxy-aware client IP still comes from the single trusted Railway proxy hop.
const apiRateLimit=options=>rateLimit({
 ...options,
 handler:(req,res)=>res.status(429).json({
  error:'Demasiadas solicitudes. Espera unos minutos antes de intentarlo de nuevo.',
  code:'RATE_LIMITED'
 })
});
const authLimit=apiRateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
app.use('/api/auth',authLimit);
app.get('/health',async(req,res)=>{try{await db.query('SELECT 1');res.json({status:'ok',database:'connected',version:APP_VERSION});}catch{res.status(503).json({status:'unavailable',version:APP_VERSION});}});

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
const adminLoginLimit=apiRateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
const unifiedLimit=apiRateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/login',unifiedLimit,async(req,res)=>{
 const p=loginSchema.safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Datos inválidos'});
 const email=emailKey(p.data.email);
 try{
  const [[admin]]=await db.execute('SELECT id,password_hash,is_active FROM admins WHERE email=? LIMIT 1',[email]);
  const [[customer]]=await db.execute('SELECT id,password_hash,account_status FROM users WHERE email=? LIMIT 1',[email]);
  const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  // Assigned staff authenticate using the password from their customer account.
  const adminHash=customer?.password_hash||admin?.password_hash||dummy;
  const [adminValid,customerValid]=await Promise.all([
   bcrypt.compare(p.data.password,adminHash),
   bcrypt.compare(p.data.password,customer?.password_hash||dummy)
  ]);
  if(isBlacklisted(customer) && (adminValid || customerValid)) return res.status(403).json(blockedAccountResponse);
  if(admin?.is_active && adminValid){
   setSessionCookie(req,res,'admin',admin.id,adminHash);
   return res.json({accountType:'admin'});
  }
  if(customer && customerValid){
   setSessionCookie(req,res,'customer',customer.id,customer.password_hash);
   return res.json({accountType:'customer'});
  }
  return res.status(401).json({error:'Credenciales incorrectas'});
 }catch(e){console.error('unified login',e.code||e.message);return res.status(500).json({error:'No se pudo iniciar sesión'});}
});
app.post('/api/auth/login',adminLoginLimit,async(req,res)=>{
 const p=loginSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Datos inválidos'});
 try{
  const [rows]=await db.execute('SELECT id,email,password_hash,role,is_active FROM admins WHERE email=? LIMIT 1',[emailKey(p.data.email)]);
  const admin=rows[0];
  // Compare against a dummy hash to reduce account enumeration timing.
  const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const [[linkedUser]]=await db.execute('SELECT password_hash,account_status FROM users WHERE email=? LIMIT 1',[emailKey(p.data.email)]);const valid=await bcrypt.compare(p.data.password,(linkedUser?.password_hash || admin?.password_hash)||dummy);
  if(!admin || !admin.is_active || !valid)return res.status(401).json({error:'Credenciales incorrectas'});
  if(isBlacklisted(linkedUser))return res.status(403).json(blockedAccountResponse);
  setSessionCookie(req,res,'admin',admin.id,linkedUser?.password_hash||admin.password_hash);
  res.json({accountType:'admin',admin:{id:admin.id,email:admin.email,role:admin.role},mfaRequiredForProduction:true});
 }catch(e){console.error('login error',e.code||e.message);res.status(500).json({error:'Error interno'});}
});
async function authenticate(req,res,next){
 try{
  const payload=verifyToken(req,'admin');
  if(!payload)return res.status(401).json({error:'Inicia sesión como administrador'});
  const [[admin]]=await db.execute(`SELECT a.id,a.email,a.role,a.is_active,
   COALESCE(u.password_hash,a.password_hash) AS auth_hash,u.account_status
   FROM admins a LEFT JOIN users u ON u.email=a.email WHERE a.id=? LIMIT 1`,[payload.sub]);
  if(!admin?.is_active)return res.status(403).json({error:'Acceso denegado'});
  if(isBlacklisted(admin))return res.status(403).json(blockedAccountResponse);
  if(!sessionStillValid(payload,admin.auth_hash))return res.status(401).json({error:'La contraseña cambió. Inicia sesión otra vez.'});
  const {auth_hash,...safeAdmin}=admin;
  req.admin=safeAdmin;next();
 }catch{return res.status(401).json({error:'Sesión inválida o vencida'});}
}
// Session state is checked against current database records; never trust role claims alone.
app.get('/api/session',async(req,res)=>{
 const raw=sessionToken(req);
 if(!raw)return res.json({authenticated:false,accountType:null});
 try{
  const payload=jwt.verify(raw,process.env.JWT_SECRET,{issuer:'fijas-de-elite'});
  if(payload.aud==='admin'){
   const [[a]]=await db.execute(`SELECT a.is_active,COALESCE(u.password_hash,a.password_hash) AS auth_hash,u.account_status
    FROM admins a LEFT JOIN users u ON u.email=a.email WHERE a.id=? LIMIT 1`,[payload.sub]);
   return res.json({authenticated:Boolean(a?.is_active && !isBlacklisted(a) && sessionStillValid(payload,a.auth_hash)),accountType:a?.is_active && !isBlacklisted(a) && sessionStillValid(payload,a.auth_hash)?'admin':null});
  }
  if(payload.aud==='customer'){
   const [[u]]=await db.execute('SELECT password_hash,account_status FROM users WHERE id=? LIMIT 1',[payload.sub]);
   return res.json({authenticated:Boolean(u && !isBlacklisted(u) && sessionStillValid(payload,u.password_hash)),accountType:u && !isBlacklisted(u) && sessionStillValid(payload,u.password_hash)?'customer':null});
  }
 }catch(e){if(e.code)console.error('session check',e.code);}
 res.json({authenticated:false,accountType:null});
});
app.post('/api/logout',(req,res)=>{clearSessionCookie(req,res);res.json({ok:true});});
app.get('/api/admin/me',authenticate,(req,res)=>res.json(req.admin));
app.get('/api/admin/overview',authenticate,async(req,res)=>{
 try{
  const [rows]=await db.query(`SELECT
   (SELECT COUNT(*) FROM users) AS users,
   (SELECT COUNT(*) FROM memberships WHERE status='active' AND archived_at IS NULL AND ends_at > NOW()) AS active_memberships,
   (SELECT COUNT(*) FROM payments WHERE status='pending') AS pending_payments,
   (SELECT COUNT(*) FROM predictions) AS predictions`);
  res.json({stats:rows[0],role:req.admin.role});
 }catch(e){console.error('overview error',e.code||e.message);res.status(500).json({error:'Error interno'});}
});
// Pronósticos: la publicación web se guarda primero; Telegram se intenta después.
const predictionSchema=z.object({title:z.string().trim().min(5).max(200),analysis:z.string().trim().min(10).max(8000),visibility:z.enum(['free','vip']),match_date:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),league:z.string().trim().min(2).max(120),market:z.string().trim().min(2).max(120),selection:z.string().trim().min(1).max(160),odds:z.coerce.number().min(1.01).max(1000)}).strict();
const outcomeSchema=z.object({outcome:z.enum(['pending','won','lost','void'])}).strict();
const allowedToPublish=(a)=>['owner','general_admin','analyst'].includes(a.role);
const canViewCustomers=(a)=>['owner','general_admin','payments_admin','moderator'].includes(a.role);
const canViewAudit=(a)=>['owner','general_admin'].includes(a.role);
const rolePermissions={owner:['predictions:read','predictions:write','payments:read','payments:write','memberships:write','plans:write','customers:read','staff:write','audit:read'],general_admin:['predictions:read','predictions:write','payments:read','payments:write','memberships:write','plans:write','customers:read','audit:read'],payments_admin:['payments:read','payments:write','memberships:write','plans:write','customers:read'],analyst:['predictions:read','predictions:write'],moderator:['customers:read']};
app.get('/api/admin/permissions',authenticate,(req,res)=>res.json({role:req.admin.role,permissions:rolePermissions[req.admin.role]||[]}));
// The public community gets teasers only; full VIP selections go exclusively to the private channel.
const sendTelegram=sendPredictionToTelegram;
app.get('/api/admin/predictions',authenticate,async(req,res)=>{
 if(!allowedToPublish(req.admin))return res.status(403).json({error:'Sin permisos'});
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
  try{await enqueuePredictionEvent(db,r.insertId,p.visibility);}catch(error){console.error('notification event enqueue',error.code||error.message);}
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
const registerLimit=apiRateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
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
 try{const [[u]]=await db.execute('SELECT id,password_hash,account_status FROM users WHERE email=?',[emailKey(p.data.email)]);const dummy='$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';const ok=await bcrypt.compare(p.data.password,u?.password_hash||dummy);if(!u||!ok)return res.status(401).json({error:'Credenciales incorrectas'});if(isBlacklisted(u))return res.status(403).json(blockedAccountResponse);setSessionCookie(req,res,'customer',u.id,u.password_hash);res.json({accountType:'customer'});}
 catch{res.status(500).json({error:'No se pudo iniciar sesión'});}
});
// Password recovery: hashed, single-use, expiring tokens; no account enumeration.
const resetLimit=apiRateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
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
async function customerAuth(req,res,next){
 try{
  let t=null;
  try{t=verifyToken(req,'customer');}catch{/* Admin session has a different JWT audience. */}
  let u=null;
  if(t){
   [[u]]=await db.execute('SELECT id,email,display_name,password_hash,account_status FROM users WHERE id=?',[t.sub]);
   if(!u||!sessionStillValid(t,u.password_hash))return res.status(401).json({error:'Sesión vencida o cuenta no disponible'});
  }else{
   // Staff see their own Telegram/VIP benefit using their existing admin session.
   // Never allow a different customer's account to be impersonated by an admin.
   t=verifyToken(req,'admin');
   if(!t)return res.status(401).json({error:'Inicia sesión'});
   const [[a]]=await db.execute(`SELECT a.email,a.role,a.is_active,COALESCE(u.password_hash,a.password_hash) AS auth_hash
     FROM admins a LEFT JOIN users u ON u.email=a.email WHERE a.id=?`,[t.sub]);
   if(!a?.is_active||!['owner','general_admin','payments_admin','analyst','moderator'].includes(a.role)||!sessionStillValid(t,a.auth_hash))return res.status(403).json({error:'Acceso administrativo no autorizado'});
   [[u]]=await db.execute('SELECT id,email,display_name,password_hash,account_status FROM users WHERE email=? LIMIT 1',[a.email]);
   if(!u)return res.status(403).json({error:'Tu perfil de cliente todavía no está vinculado. El dueño puede habilitarlo desde su panel.'});
  }
  if(isBlacklisted(u))return res.status(403).json(blockedAccountResponse);
  const {password_hash,account_status,...customer}=u;
  req.customer=customer;next();
 }catch{return res.status(401).json({error:'Sesión inválida o vencida'});}
}
// Always authorize content on the server; never send VIP selections to non-VIP users.
app.get('/api/customers/predictions',customerAuth,async(req,res)=>{
 try{
  const entitlement=await getVipEntitlement(db,req.customer.id);
  const vip=entitlement.hasVip;
  const [rows]=await db.query("SELECT id,title,league,match_date,visibility,analysis,market,selection,odds,outcome FROM predictions WHERE published_at IS NOT NULL ORDER BY id DESC LIMIT 50");
  res.set('Cache-Control','private, no-store');
  res.json({has_vip:vip,staff_vip:entitlement.staff,predictions:rows.map(p=>p.visibility==='vip'&&!vip?{id:p.id,title:p.title,league:p.league,match_date:p.match_date,visibility:'vip',locked:true}:{...p,locked:false})});
 }catch(e){console.error('customer predictions',e.code||e.message);res.status(500).json({error:'No se pudieron cargar los pronósticos'});}
});
// Customer-only dashboard: all figures are derived from database records.
app.get('/api/customers/dashboard',customerAuth,async(req,res)=>{
 try{
  // Determine whether VIP is active NOW, then include all confirmed, consecutive
  // future renewals in its displayed expiry. Previously the dashboard excluded
  // future starts_at rows, making a successful renewal appear not to be applied.
  const [[currentMembership]]=await db.execute("SELECT m.ends_at,p.name AS plan FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.user_id=? AND m.status='active' AND m.archived_at IS NULL AND m.starts_at<=UTC_TIMESTAMP() AND m.ends_at>UTC_TIMESTAMP() ORDER BY m.ends_at DESC LIMIT 1",[req.customer.id]);
  const [[horizon]]=currentMembership?await db.execute("SELECT m.ends_at FROM memberships m WHERE m.user_id=? AND m.status='active' AND m.archived_at IS NULL AND m.ends_at>UTC_TIMESTAMP() ORDER BY m.ends_at DESC LIMIT 1",[req.customer.id]):[[null]];
  const [[scheduled]]=currentMembership?await db.execute("SELECT COUNT(*) AS total FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL AND starts_at>UTC_TIMESTAMP() AND ends_at>UTC_TIMESTAMP()",[req.customer.id]):[[{total:0}]];
  const entitlement=await getVipEntitlement(db,req.customer.id);
  // Staff benefit is unlimited while the role is active. It is NOT a paid membership.
  const membership=entitlement.staff?{plan:'VIP por cargo · gratuito',ends_at:null,current_ends_at:null,days_left:null,renewals_scheduled:0,staff_vip:true}
   :buildMembershipSummary(currentMembership,horizon,scheduled?.total);
  const [[stats]]=await db.query("SELECT COUNT(*) AS total, SUM(outcome='won') AS won, SUM(outcome='lost') AS lost, SUM(outcome='pending') AS pending FROM predictions WHERE published_at IS NOT NULL AND outcome IN ('won','lost','pending')");
  const [payments]=await db.execute("SELECT py.id,py.status,py.created_at,p.name AS plan FROM payments py JOIN memberships m ON m.id=py.membership_id JOIN plans p ON p.id=m.plan_id WHERE py.user_id=? ORDER BY py.id DESC LIMIT 5",[req.customer.id]);
  const [recent]=await db.query("SELECT id,title,visibility,outcome,match_date FROM predictions WHERE published_at IS NOT NULL ORDER BY id DESC LIMIT 6");
  const daysLeft=membership?.days_left||0;
  const notices=[];
  if(membership&&!membership.staff_vip&&daysLeft<=3)notices.push({type:'expiry',message:`Tu membresía vence en ${daysLeft} día(s).`});
  if(!membership)notices.push({type:'vip',message:'Activa una membresía para desbloquear los pronósticos VIP.'});
  if(payments.some(p=>p.status==='pending'))notices.push({type:'payment',message:'Tienes una solicitud de pago pendiente de revisión.'});
  const [alerts]=await db.execute('SELECT kind,message,created_at FROM customer_notifications WHERE user_id=? ORDER BY id DESC LIMIT 4',[req.customer.id]);
  for(const alert of alerts)notices.push({type:alert.kind,message:alert.message});
  if(recent.length)notices.push({type:'picks',message:'Hay pronósticos publicados. Consulta las tarjetas disponibles según tu acceso.'});
  res.set('Cache-Control','private, no-store').json({membership,stats:{total:Number(stats.total||0),won:Number(stats.won||0),lost:Number(stats.lost||0),pending:Number(stats.pending||0)},payments,notices});
 }catch(e){console.error('customer dashboard',e.code||e.message);res.status(500).json({error:'No se pudo cargar el panel'});}
});
app.get('/api/customers/me',customerAuth,async(req,res)=>{
 try{
  const base='SELECT m.id,m.status,m.starts_at,m.ends_at,p.name AS plan FROM memberships m JOIN plans p ON p.id=m.plan_id';
  const [confirmed]=await db.execute(`${base} WHERE m.user_id=? AND m.status='active' AND m.archived_at IS NULL ORDER BY m.ends_at DESC LIMIT 40`,[req.customer.id]);
  const [pending]=await db.execute(`${base} WHERE m.user_id=? AND m.status='pending' AND m.archived_at IS NULL ORDER BY m.id DESC LIMIT 20`,[req.customer.id]);
  const [history]=await db.execute(`${base} WHERE m.user_id=? AND m.status IN ('expired','cancelled') AND m.archived_at IS NULL ORDER BY m.id DESC LIMIT 20`,[req.customer.id]);
  const entitlement=await getVipEntitlement(db,req.customer.id);
  res.set('Cache-Control','private, no-store').json({user:req.customer,staff_vip:entitlement.staff,memberships:[...confirmed,...pending,...history]});
 }catch(e){console.error('customer membership list',e.code||e.message);res.status(500).json({error:'No se pudieron consultar tus membresías'});}
});
app.post('/api/customers/payment-requests',customerAuth,async(req,res)=>{
 const p=paymentRequest.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Datos de solicitud inválidos'});
 const conn=await db.getConnection();try{await conn.beginTransaction();const [[plan]]=await conn.execute('SELECT id,price_pen FROM plans WHERE id=? AND active=1',[p.data.plan_id]);if(!plan){await conn.rollback();return res.status(404).json({error:'Plan no disponible'});}
 const [m]=await conn.execute("INSERT INTO memberships(user_id,plan_id,status) VALUES (?,?,'pending')",[req.customer.id,plan.id]);const [pay]=await conn.execute("INSERT INTO payments(user_id,membership_id,method,amount_pen,status,external_reference) VALUES (?,?,?,?, 'pending',?)",[req.customer.id,m.insertId,p.data.method,plan.price_pen,p.data.reference]);await conn.commit();res.status(201).json({payment_id:pay.insertId,status:'pending',message:'Solicitud recibida. No implica que el pago esté confirmado.'});}
 catch(e){await conn.rollback();console.error('payment request',e.code||e.message);res.status(500).json({error:'No se pudo guardar la solicitud'});}finally{conn.release();}
});
app.get('/api/admin/plans',authenticate,async(req,res)=>{if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});const [plans]=await db.query('SELECT id,name,duration_days,price_pen,active FROM plans ORDER BY id DESC LIMIT 100');res.json({plans});});
app.post('/api/admin/plans',authenticate,async(req,res)=>{if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});const p=planSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Plan inválido'});try{const [r]=await db.execute('INSERT INTO plans(name,duration_days,price_pen,active) VALUES (?,?,?,1)',[p.data.name,p.data.duration_days,p.data.price_pen]);await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id) VALUES (?,'plan_created','plan',?)",[req.admin.id,String(r.insertId)]);res.status(201).json({id:r.insertId});}catch{res.status(500).json({error:'No se pudo crear el plan'});}});
app.get('/api/admin/customers',authenticate,async(req,res)=>{if(!canViewCustomers(req.admin))return res.status(403).json({error:'Sin permisos'});const [users]=await db.query('SELECT id,email,display_name,created_at FROM users ORDER BY id DESC LIMIT 100');res.json({users});});
app.get('/api/admin/payments',authenticate,async(req,res)=>{if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});const [payments]=await db.query('SELECT py.id,py.method,py.amount_pen,py.status,py.external_reference,py.created_at,u.email,p.name AS plan FROM payments py JOIN users u ON u.id=py.user_id JOIN memberships m ON m.id=py.membership_id JOIN plans p ON p.id=m.plan_id ORDER BY py.id DESC LIMIT 100');res.json({payments});});
app.post('/api/admin/payments/:id/decision',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos'});
 if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({error:'ID inválido'});
 const parsed=z.object({decision:z.enum(['verified','rejected'])}).strict().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Decisión inválida'});
 const conn=await db.getConnection();try{await conn.beginTransaction();const [[payment]]=await conn.execute('SELECT id,status,membership_id FROM payments WHERE id=? FOR UPDATE',[req.params.id]);if(!payment){await conn.rollback();return res.status(404).json({error:'Pago no encontrado'});}if(payment.status!=='pending'){await conn.rollback();return res.status(409).json({error:'Solicitud ya procesada'});}const [[cardCheck]]=await conn.execute('SELECT method FROM payments WHERE id=?',[payment.id]);if(cardCheck?.method==='card'){await conn.rollback();return res.status(403).json({error:'Los pagos con tarjeta se concilian automáticamente con el proveedor'});}
 if(parsed.data.decision==='verified'){
 const [[membership]]=await conn.execute("SELECT m.id,m.user_id,m.plan_id,p.duration_days FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.id=? AND m.status='pending' AND m.archived_at IS NULL FOR UPDATE",[payment.membership_id]);if(!membership){await conn.rollback();return res.status(409).json({error:'Membresía eliminada o solicitud no disponible'});}
 // Serialize approvals for the same customer to prevent two renewals overwriting days.
 await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[membership.user_id]);
 const [[current]]=await conn.execute("SELECT MAX(ends_at) AS last_end FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL",[membership.user_id]);
 const start=current?.last_end && new Date(current.last_end)>new Date()?new Date(current.last_end):new Date();
 const end=new Date(start.getTime()+membership.duration_days*86400000);
 await conn.execute("UPDATE memberships SET status='active',starts_at=?,ends_at=? WHERE id=? AND status='pending' AND archived_at IS NULL",[start,end,membership.id]);
 await enqueueVipActivation(conn,membership.user_id,membership.id);
 }else await conn.execute("UPDATE memberships SET status='cancelled' WHERE id=? AND status='pending'",[payment.membership_id]);
 await conn.execute('UPDATE payments SET status=?,verified_by=?,verified_at=UTC_TIMESTAMP() WHERE id=?',[parsed.data.decision,req.admin.id,payment.id]);
 await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'payment_decision','payment',?,JSON_OBJECT('decision',?))",[req.admin.id,String(payment.id),parsed.data.decision]);await conn.commit();res.json({ok:true,status:parsed.data.decision});
 }catch(e){await conn.rollback();console.error('payment decision',e.code||e.message);res.status(500).json({error:'No se pudo procesar'});}finally{conn.release();}
});

// Manual VIP management: no fake payment is created. Only authorized payment staff
// can grant or revoke entitlements, with a required explanation and audit trail.
const vipTargetId=id=>/^\d{1,18}$/.test(String(id));
const vipReason=z.string().trim().min(4).max(350);
const manualVipGrantSchema=z.object({plan_id:z.coerce.number().int().positive(),reason:vipReason}).strict();
const manualVipRevokeSchema=z.object({reason:vipReason}).strict();

app.get('/api/admin/vip/search',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos para gestionar VIP'});
 const query=typeof req.query.q==='string'?req.query.q.trim():'';
 if(!query || query.length>120 || (query.length<2 && !/^\d$/.test(query)))
  return res.status(400).json({error:'Escribe al menos dos caracteres, o el ID del cliente'});
 try{
  // Search is bounded and parameterized; never disclose password hashes or sessions.
  const matches=`%${query.replace(/[!%_]/g,'!$&')}%`;
  const [users]=await db.execute(`SELECT u.id,u.email,u.display_name,u.account_status,
   EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active' AND m.archived_at IS NULL
    AND m.starts_at<=UTC_TIMESTAMP() AND m.ends_at>UTC_TIMESTAMP()) AS has_vip
   FROM users u WHERE u.email LIKE ? ESCAPE '!' OR u.display_name LIKE ? ESCAPE '!'
    OR u.id=? ORDER BY u.id DESC LIMIT 25`,[matches,matches,/^\d{1,18}$/.test(query)?query:'0']);
  res.json({users:users.map(u=>({...u,has_vip:Boolean(u.has_vip)}))});
 }catch(e){console.error('vip search',e.code||e.message);res.status(500).json({error:'No se pudo buscar clientes'});}
});
app.get('/api/admin/vip/customers/:id',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos para gestionar VIP'});
 if(!vipTargetId(req.params.id))return res.status(400).json({error:'ID inválido'});
 try{
  const [[user]]=await db.execute('SELECT id,email,display_name,account_status FROM users WHERE id=? LIMIT 1',[req.params.id]);
  if(!user)return res.status(404).json({error:'Cliente no encontrado'});
  const [[status]]=await db.execute(`SELECT
   EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL AND starts_at<=UTC_TIMESTAMP() AND ends_at>UTC_TIMESTAMP()) AS has_vip,
   (SELECT MAX(ends_at) FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL AND ends_at>UTC_TIMESTAMP()) AS vip_until,
   (SELECT COUNT(*) FROM memberships WHERE user_id=? AND status='pending' AND archived_at IS NULL) AS pending_requests,
   (SELECT COUNT(*) FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL AND ends_at>UTC_TIMESTAMP()) AS confirmed_count`,[user.id,user.id,user.id,user.id]);
  const [memberships]=await db.execute(`SELECT m.id,m.status,m.source,m.starts_at,m.ends_at,m.created_at,
   m.grant_reason,m.revoked_at,m.revoke_reason,p.name AS plan,
   EXISTS(SELECT 1 FROM payments py WHERE py.membership_id=m.id AND py.status='verified') AS paid
   FROM memberships m JOIN plans p ON p.id=m.plan_id
   WHERE m.user_id=? AND m.archived_at IS NULL ORDER BY m.id DESC LIMIT 35`,[user.id]);
  res.json({user,has_vip:Boolean(status.has_vip),vip_until:status.vip_until,
   pending_requests:Number(status.pending_requests||0),confirmed_count:Number(status.confirmed_count||0),
   memberships:memberships.map(m=>({...m,paid:Boolean(m.paid)}))});
 }catch(e){console.error('vip detail',e.code||e.message);res.status(500).json({error:'No se pudo consultar la membresía'});}
});
app.post('/api/admin/vip/customers/:id/grant',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos para otorgar VIP'});
 if(!vipTargetId(req.params.id))return res.status(400).json({error:'ID inválido'});
 const parsed=manualVipGrantSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Selecciona un plan y escribe un motivo (4 a 350 caracteres)'});
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  // Serializing on the customer prevents two manual grants from losing renewal days.
  const [[user]]=await conn.execute('SELECT id,account_status,password_hash FROM users WHERE id=? FOR UPDATE',[req.params.id]);
  if(!user||!user.password_hash){await conn.rollback();return res.status(404).json({error:'El cliente debe estar registrado'});}
  if(isBlacklisted(user)){await conn.rollback();return res.status(403).json({error:'La cuenta está en lista negra. Debes desbloquearla primero'});}
  const [[plan]]=await conn.execute('SELECT id,name,duration_days FROM plans WHERE id=? AND active=1 LIMIT 1',[parsed.data.plan_id]);
  if(!plan){await conn.rollback();return res.status(404).json({error:'Plan VIP no disponible'});}
  const [[last]]=await conn.execute("SELECT MAX(ends_at) AS last_end FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL",[user.id]);
  const {start,end}=manualVipPeriod(last?.last_end,Number(plan.duration_days));
  const [result]=await conn.execute(`INSERT INTO memberships
   (user_id,plan_id,status,starts_at,ends_at,source,granted_by,grant_reason)
   VALUES (?,?,'active',?,?,'manual',?,?)`,[user.id,plan.id,start,end,req.admin.id,parsed.data.reason]);
  await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
   VALUES (?,'vip_manual_granted','membership',?,JSON_OBJECT('user_id',?,'plan_id',?,'days',?,'reason',?))`,
   [req.admin.id,String(result.insertId),String(user.id),String(plan.id),Number(plan.duration_days),parsed.data.reason]);
  await enqueueVipActivation(conn,user.id,result.insertId);
  await conn.commit();
  res.status(201).json({ok:true,membership_id:result.insertId,plan:plan.name,starts_at:start,ends_at:end,
   message:'VIP concedido manualmente. No se registró ningún pago.'});
 }catch(e){try{await conn.rollback();}catch{}console.error('vip grant',e.code||e.message);res.status(500).json({error:'No se pudo asignar el VIP'});}
 finally{conn.release();}
});
app.post('/api/admin/vip/customers/:id/revoke',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos para retirar VIP'});
 if(!vipTargetId(req.params.id))return res.status(400).json({error:'ID inválido'});
 const parsed=manualVipRevokeSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Indica el motivo del retiro (4 a 350 caracteres)'});
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [[user]]=await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[req.params.id]);
  if(!user){await conn.rollback();return res.status(404).json({error:'Cliente no encontrado'});}
  // Cancel ALL current and future confirmed VIP, irrespective of payment source.
  // Keep the original payments as-is: a revocation is NOT a refund.
  const [result]=await conn.execute(`UPDATE memberships SET status='cancelled',revoked_at=UTC_TIMESTAMP(),
   revoked_by=?,revoke_reason=? WHERE user_id=? AND status='active' AND archived_at IS NULL AND ends_at>UTC_TIMESTAMP()`,
   [req.admin.id,parsed.data.reason,user.id]);
  if(result.affectedRows===0){await conn.rollback();return res.status(409).json({error:'Este cliente no tiene VIP vigente ni renovaciones confirmadas'});}
  await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
   VALUES (?,'vip_manual_revoked','user',?,JSON_OBJECT('reason',?,'memberships_cancelled',?))`,
   [req.admin.id,String(user.id),parsed.data.reason,result.affectedRows]);
  await conn.commit();
  res.json({ok:true,cancelled:result.affectedRows,
   message:'Acceso VIP retirado. Los pagos anteriores se conservan y NO se reembolsaron.'});
 }catch(e){try{await conn.rollback();}catch{}console.error('vip revoke',e.code||e.message);res.status(500).json({error:'No se pudo retirar el VIP'});}
 finally{conn.release();}
});


// v1.8.9: archive ONE selected membership. Owner-only, audited, never hard-delete
// a payment or erase a record needed for chargebacks/disputes. The archive is
// invisible to VIP entitlement checks and the customer's membership list.
const membershipArchiveSchema=z.object({reason:vipReason}).strict();
app.post('/api/admin/vip/customers/:id/memberships/:membershipId/archive',authenticate,async(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede eliminar membresías'});
 if(!vipTargetId(req.params.id)||!vipTargetId(req.params.membershipId))return res.status(400).json({error:'ID inválido'});
 const parsed=membershipArchiveSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Escribe un motivo de 4 a 350 caracteres'});
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  // Lock the customer first, same serialization used by renewal/grant operations.
  const [[user]]=await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[req.params.id]);
  if(!user){await conn.rollback();return res.status(404).json({error:'Cliente no encontrado'});}
  const [[membership]]=await conn.execute(`SELECT id,user_id,plan_id,status,archived_at
    FROM memberships WHERE id=? AND user_id=? FOR UPDATE`,[req.params.membershipId,user.id]);
  if(!membership){await conn.rollback();return res.status(404).json({error:'Membresía no encontrada'});}
  if(membership.archived_at){await conn.rollback();return res.status(409).json({error:'Esta membresía ya fue eliminada del panel'});}
  const [payments]=await conn.execute('SELECT id,method,status,external_reference FROM payments WHERE membership_id=? FOR UPDATE',[membership.id]);
  // A PayPal order awaiting capture must not be discarded. It may still capture.
  const policy=evaluateMembershipArchive(payments);
  if(policy.blockedByPaypal){
   await conn.rollback();return res.status(409).json({error:'Esta membresía tiene una orden PayPal pendiente. Comprueba o cancela la orden con el proveedor antes de eliminarla.'});
  }
  const verified=policy.hasVerifiedPayment;
  const [cancelledPayments]=await conn.execute(`UPDATE payments
    SET status='rejected',verified_by=?,verified_at=UTC_TIMESTAMP()
    WHERE membership_id=? AND status='pending' AND method<>'card'`,[req.admin.id,membership.id]);
  const [archived]=await conn.execute(`UPDATE memberships SET archived_at=UTC_TIMESTAMP(), archived_by=?,archive_reason=?,
    status='cancelled',revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()),revoked_by=?,revoke_reason=?
    WHERE id=? AND user_id=? AND archived_at IS NULL`,
   [req.admin.id,parsed.data.reason,req.admin.id,parsed.data.reason,membership.id,user.id]);
  if(archived.affectedRows!==1)throw new Error('No se pudo archivar la membresía');
  await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
   VALUES (?,'membership_archived','membership',?,
    JSON_OBJECT('user_id',?,'previous_status',?,'reason',?,'had_verified_payment',?,'manual_requests_rejected',?))`,
    [req.admin.id,String(membership.id),String(user.id),membership.status,parsed.data.reason,verified,cancelledPayments.affectedRows]);
  await conn.commit();
  res.json({ok:true,membership_id:membership.id,had_verified_payment:verified,
   message:verified?'Membresía eliminada del panel y acceso retirado. El pago verificado se conserva; no se ha reembolsado.':'Membresía eliminada del panel. No se borraron pagos ni registros de auditoría.'});
 }catch(e){try{await conn.rollback();}catch{}console.error('membership archive',e.code||e.message);res.status(500).json({error:'No se pudo eliminar la membresía'});}
 finally{conn.release();}
});

// Audit history: only owner and general admin may read it. Never expose passwords or tokens.
app.get('/api/admin/audit',authenticate,async(req,res)=>{
 if(!canViewAudit(req.admin))return res.status(403).json({error:'Sin permisos'});
 try{const [logs]=await db.query(`SELECT l.id,l.action,l.entity_type,l.entity_id,l.details,l.created_at,a.email AS actor FROM audit_logs l LEFT JOIN admins a ON a.id=l.actor_admin_id ORDER BY l.id DESC LIMIT 100`);res.json({logs});}
 catch(e){console.error('audit list',e.code||e.message);res.status(500).json({error:'No se pudo consultar el historial'});}
});
// Staff: registration always creates a customer. Only the owner may grant or revoke staff roles.
const staffRoleSchema=z.object({
 role:z.enum(['general_admin','payments_admin','analyst','moderator','customer','blacklist']),
 reason:z.string().trim().max(350).optional()
}).strict();
app.get('/api/admin/staff',authenticate,async(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede gestionar el personal'});
 try{const [rows]=await db.query(`SELECT u.id,u.email,u.display_name,u.account_status,u.blacklist_reason,u.blacklisted_at,
   CASE WHEN u.account_status='blacklisted' THEN 'blacklist' ELSE COALESCE(IF(a.is_active=1,a.role,NULL),'customer') END AS role
   FROM users u LEFT JOIN admins a ON a.email=u.email ORDER BY u.id DESC LIMIT 200`);
   res.json({users:rows.map(u=>({...u,rank:roleRank(u.role)}))});}
 catch(e){console.error('staff list',e.code||e.message);res.status(500).json({error:'No se pudo consultar el personal'});}
});
app.post('/api/admin/staff/:id/role',authenticate,async(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede asignar roles'});
 if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({error:'ID inválido'});
 const parsed=staffRoleSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Rol inválido'});
 const conn=await db.getConnection();try{
  await conn.beginTransaction();
  const [[u]]=await conn.execute('SELECT id,email,password_hash,account_status FROM users WHERE id=? FOR UPDATE',[req.params.id]);
  if(!u||!u.password_hash){await conn.rollback();return res.status(404).json({error:'El usuario debe registrarse primero'});}
  const [[a]]=await conn.execute('SELECT id,role FROM admins WHERE email=? FOR UPDATE',[u.email]);
  if(a?.role==='owner'){await conn.rollback();return res.status(403).json({error:'No se puede modificar al dueño'});}
  if(parsed.data.role==='blacklist'){
   const reason=parsed.data.reason?.trim()||'';
   if(reason.length<4){await conn.rollback();return res.status(400).json({error:'Especifica un motivo de lista negra (mínimo 4 caracteres)'});}
   // Disable any administrative privileges, including currently issued sessions.
   if(a)await conn.execute('UPDATE admins SET is_active=0 WHERE id=?',[a.id]);
   await conn.execute("UPDATE users SET account_status='blacklisted',blacklist_reason=?,blacklisted_at=UTC_TIMESTAMP(),blacklisted_by=? WHERE id=?",[reason,req.admin.id,u.id]);
  }else{
   // An explicit change by the owner lifts the block and restores the selected role.
   await conn.execute("UPDATE users SET account_status='active',blacklist_reason=NULL,blacklisted_at=NULL,blacklisted_by=NULL WHERE id=?",[u.id]);
   if(parsed.data.role==='customer'){
    if(a)await conn.execute('UPDATE admins SET is_active=0 WHERE id=?',[a.id]);
   }else if(a)await conn.execute('UPDATE admins SET role=?,is_active=1 WHERE id=?',[parsed.data.role,a.id]);
   else await conn.execute('INSERT INTO admins(email,password_hash,role,is_active) VALUES (?,?,?,1)',[u.email,u.password_hash,parsed.data.role]);
  }
  await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'staff_role_changed','user',?,JSON_OBJECT('role',?,'rank',?,'reason',?))",[req.admin.id,String(u.id),parsed.data.role,roleRank(parsed.data.role),parsed.data.role==='blacklist'?parsed.data.reason?.trim():null]);
  await conn.commit();
  let telegram_vip=null;
  if(telegramVipControl){
   try{
    if(parsed.data.role==='blacklist'){
     telegram_vip=await telegramVipControl.revokeUser(u.id);
    }else if(u.account_status==='blacklisted'){
     // Rank 0 -> client/staff: remove Telegram's ban even when the user has NO VIP.
     // The user stays OUT of the channel until a fresh authorized invite.
     telegram_vip=await telegramVipControl.restoreUser(u.id);
    }
    if(parsed.data.role!=='blacklist'){
     // Demotion removes staff VIP unless a paid membership is still active.
     await telegramVipControl.reconcileUser(u.id);
    }
   }catch(error){
    console.error('telegram role transition',error.message);
    telegram_vip={queued:true,warning:'No se confirmó el cambio de Telegram. Usa Telegram → Sincronizar.'};
   }
  }
  res.json({ok:true,role:parsed.data.role,rank:roleRank(parsed.data.role),telegram_vip});
 }catch(e){await conn.rollback();console.error('staff update',e.code||e.message);res.status(500).json({error:'No se pudo cambiar el rol'});}finally{conn.release();}
});

// PayPal Checkout: orders are created/captured server-to-server; no browser-provided amount is trusted.
// PayPal REST does not support PEN as a checkout currency. USD is calculated with an owner-configured rate.
// Separate limits prevent repeated payment checks from exhausting the checkout creation quota.
const paypalCreateLimit=apiRateLimit({windowMs:15*60*1000,limit:6,standardHeaders:'draft-7',legacyHeaders:false});
const paypalConfirmLimit=apiRateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false});
const paypalPlan=z.object({plan_id:z.coerce.number().int().positive()}).strict();
const paypalOrder=z.object({order_id:z.string().regex(/^[A-Z0-9-]{8,64}$/i)}).strict();
const paypalMode=()=>paypalReadiness(process.env).mode;
const paypalHost=()=>paypalMode()==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
const paypalRate=()=>Number(process.env.PAYPAL_PEN_PER_USD);
// Live defaults OFF until PayPal's webhook ID and explicit owner release are set.
const paypalMissing=()=>paypalReadiness(process.env).missing;
const paypalReady=()=>paypalMissing().length===0;
const usdFromPen=pen=>(Math.round(Number(pen)/paypalRate()*100)/100).toFixed(2);
let paypalAccess={token:null,expires:0,mode:null,key:null};
async function paypalToken(){
 const key=crypto.createHash('sha256').update(paypalMode()+':'+(process.env.PAYPAL_CLIENT_ID||'')+':'+(process.env.PAYPAL_CLIENT_SECRET||'')).digest('hex');
 if(paypalAccess.token&&paypalAccess.mode===paypalMode()&&paypalAccess.key===key&&paypalAccess.expires>Date.now()+30000)return paypalAccess.token;
 const credentials=Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64');
 const r=await fetch(paypalHost()+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+credentials,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('PayPal auth HTTP '+r.status);
 const d=await r.json();paypalAccess={token:d.access_token,expires:Date.now()+Number(d.expires_in||300)*1000,mode:paypalMode(),key};return d.access_token;
}
async function paypalApi(route,opts={}){
 const token=await paypalToken();const r=await fetch(paypalHost()+route,{...opts,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(opts.headers||{})},signal:AbortSignal.timeout(15000)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error('PayPal HTTP '+r.status);return data;
}
// Public status never exposes credential presence. Owners have a separate protected diagnostic.
app.get('/api/payments/automatic/status',(req,res)=>res.json({enabled:paypalReady(),provider:'paypal',mode:paypalMode(),currency:'USD',pen_per_usd:paypalReady()?paypalRate():null,version:APP_VERSION,reason:paypalReady()?null:'Checkout deshabilitado. El dueño debe revisar la configuración en su panel.'}));
app.get('/api/admin/paypal/diagnostics',authenticate,(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede ver el diagnóstico'});
 return res.json({version:APP_VERSION,provider:'paypal',mode:paypalMode(),ready:paypalReady(),missing:paypalMissing(),proxy_hops:app.get('trust proxy'),message:paypalReady()?'Configuración preparada para '+paypalMode()+'. Comprueba la conexión y los webhooks antes de cobrar.':'Configura las variables indicadas en Railway. Live permanece bloqueado hasta la activación explícita.'});
});
const paypalConnectivityLimit=apiRateLimit({windowMs:15*60*1000,limit:3,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/admin/paypal/connectivity',paypalConnectivityLimit,authenticate,async(req,res)=>{
 if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede comprobar PayPal'});
 const missing=paypalMissing();
 if(missing.length)return res.status(400).json({connected:false,missing});
 try {await paypalToken();return res.json({connected:true,mode:paypalMode(),message:'Credenciales aceptadas por PayPal. Esto no valida la elegibilidad comercial ni realiza cobros.'});}
 catch(e){console.error('paypal diagnostics connectivity',e.message);return res.status(503).json({connected:false,error:'No se pudo autenticar con PayPal. Verifica el entorno PayPal y las credenciales correspondientes. No compartas tus claves.'});}
});
app.post('/api/customers/payments/paypal',paypalCreateLimit,customerAuth,async(req,res)=>{
 if(!paypalReady())return res.status(503).json({error:'PayPal todavía no está disponible'});
 const parsed=paypalPlan.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Plan inválido'});
 try{
  const [[plan]]=await db.execute('SELECT id,name,price_pen FROM plans WHERE id=? AND active=1',[parsed.data.plan_id]);
  if(!plan)return res.status(404).json({error:'Plan no disponible'});
  const usd=usdFromPen(plan.price_pen);if(Number(usd)<0.01)return res.status(400).json({error:'Monto inválido'});
  const conn=await db.getConnection();let paymentId;
  try{await conn.beginTransaction();const [m]=await conn.execute("INSERT INTO memberships(user_id,plan_id,status) VALUES (?,?,'pending')",[req.customer.id,plan.id]);const [pay]=await conn.execute("INSERT INTO payments(user_id,membership_id,method,amount_pen,status,paypal_environment,paypal_amount_usd) VALUES (?,?,'card',?,'pending',?,?)",[req.customer.id,m.insertId,plan.price_pen,paypalMode(),usd]);paymentId=pay.insertId;await conn.commit();}
  catch(e){await conn.rollback();throw e;}finally{conn.release();}
  const base=process.env.PUBLIC_BASE_URL.replace(/\/$/,'');
  const order=await paypalApi('/v2/checkout/orders',{method:'POST',headers:{'PayPal-Request-Id':'fijas-order-'+paymentId},body:JSON.stringify({intent:'CAPTURE',purchase_units:[{reference_id:String(paymentId),custom_id:String(paymentId),description:'Fijas de Élite - '+plan.name,amount:{currency_code:'USD',value:usd}}],application_context:{return_url:base+'/clientes.html?paypal_return=success',cancel_url:base+'/clientes.html?paypal_return=cancel',user_action:'PAY_NOW'}})});
  const approve=order.links?.find(x=>x.rel==='approve'&&x.href?.startsWith('https://'))?.href;
  if(!approve||!order.id)throw new Error('PayPal order incomplete');
  // Store PayPal order id before redirect; use a compare-and-swap to avoid accidental overwrite.
  const [saved]=await db.execute("UPDATE payments SET external_reference=? WHERE id=? AND status='pending' AND paypal_environment=? AND external_reference IS NULL",[order.id,paymentId,paypalMode()]);
  if(saved.affectedRows!==1)throw new Error('Unable to link PayPal order');
  res.json({checkout_url:approve,order_id:order.id,amount_usd:usd,pen_per_usd:paypalRate(),status:'pending'});
 }catch(e){console.error('paypal create',e.message);res.status(503).json({error:'No se pudo preparar PayPal. No se activó VIP.'});}
});
async function reconcilePaypalOrder(orderId){
 const order=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(orderId));
 const customId=order?.purchase_units?.[0]?.custom_id;
 if(!/^\d{1,20}$/.test(String(customId)))return false;
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [[pay]]=await conn.execute(`SELECT id,user_id,membership_id,amount_pen,status,external_reference,
   paypal_environment,paypal_amount_usd,paypal_capture_id
   FROM payments WHERE id=? AND method='card' FOR UPDATE`,[customId]);
  if(!pay||pay.external_reference!==orderId||pay.paypal_environment!==paypalMode()){
   await conn.rollback();return false;
  }
  const capture=validatePaypalCapture(order,orderId,pay.id,pay.paypal_amount_usd);
  if(!capture){await conn.rollback();return false;}
  if(pay.paypal_capture_id && pay.paypal_capture_id!==capture.captureId){await conn.rollback();return false;}
  if(pay.status==='verified'||pay.status==='refunded'){
   await conn.rollback();return true; // Already reconciled: never grant a second VIP period.
  }
  if(pay.status!=='pending'){await conn.rollback();return false;}
  const [[member]]=await conn.execute("SELECT m.id,m.user_id,p.duration_days FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.id=? AND m.status='pending' AND m.archived_at IS NULL FOR UPDATE",[pay.membership_id]);
  if(!member||String(member.user_id)!==String(pay.user_id)){await conn.rollback();return false;}
  await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[pay.user_id]);
  const [[current]]=await conn.execute("SELECT MAX(ends_at) AS last_end FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL",[pay.user_id]);
  const start=current?.last_end&&new Date(current.last_end)>new Date()?new Date(current.last_end):new Date();
  const end=new Date(start.getTime()+Number(member.duration_days)*86400000);
  await conn.execute("UPDATE memberships SET status='active',starts_at=?,ends_at=? WHERE id=? AND status='pending' AND archived_at IS NULL",[start,end,member.id]);
  const [updated]=await conn.execute("UPDATE payments SET status='verified',verified_at=UTC_TIMESTAMP(),paypal_capture_id=?,paypal_financial_state='captured' WHERE id=? AND status='pending' AND paypal_environment=?",[capture.captureId,pay.id,paypalMode()]);
  if(updated.affectedRows!==1)throw new Error('Capture reconciliation conflict');
  await conn.execute("INSERT INTO customer_notifications(user_id,payment_id,kind,message) VALUES (?,?,'paypal_confirmed',?) ON DUPLICATE KEY UPDATE id=id",[pay.user_id,pay.id,'Pago PayPal confirmado. Tu membresía VIP fue activada o renovada.']);
  await enqueueVipActivation(conn,pay.user_id,member.id);
  await conn.execute("INSERT INTO audit_logs(action,entity_type,entity_id,details) VALUES ('paypal_captured','payment',?,JSON_OBJECT('paypal_order_id',?,'environment',?,'usd',?))",[String(pay.id),orderId,paypalMode(),capture.amountUsd]);
  await conn.commit();return true;
 }catch(e){try{await conn.rollback();}catch{}throw e;}finally{conn.release();}
}
app.post('/api/customers/payments/paypal/capture',paypalConfirmLimit,customerAuth,async(req,res)=>{
 if(!paypalReady())return res.status(503).json({error:'PayPal no disponible'});
 const parsed=paypalOrder.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Orden inválida'});
 const id=parsed.data.order_id;
 try{
  const [[pay]]=await db.execute("SELECT id,status FROM payments WHERE user_id=? AND method='card' AND paypal_environment=? AND external_reference=? LIMIT 1",[req.customer.id,paypalMode(),id]);
  if(!pay)return res.status(404).json({error:'Orden no encontrada'});
  if(pay.status==='verified')return res.json({status:'verified',message:'Este pago ya estaba confirmado. La renovación debe aparecer en «Mi membresía» y en la fecha total de vencimiento.'});
  const order=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(id));
  if(order.status==='APPROVED'){
   await paypalApi('/v2/checkout/orders/'+encodeURIComponent(id)+'/capture',{method:'POST',headers:{'PayPal-Request-Id':'fijas-capture-'+pay.id},body:'{}'});
  }
  const activated=await reconcilePaypalOrder(id);
  res.json({status:activated?'verified':'pending',message:activated?'Pago confirmado. ¡Tu membresía VIP está activa!':'PayPal todavía no confirma la captura del pago.'});
 }catch(e){console.error('paypal capture',e.message);res.status(503).json({error:'No se pudo verificar el cobro. Intenta nuevamente; no pagues dos veces.'});}
});
// Manual reconciliation by the authenticated customer (never trust redirect query as proof).
app.post('/api/customers/payments/paypal/check',paypalConfirmLimit,customerAuth,async(req,res)=>{
 if(!paypalReady())return res.status(503).json({error:'PayPal no disponible'});
 const [[pay]]=await db.execute("SELECT external_reference,status FROM payments WHERE user_id=? AND method='card' AND paypal_environment=? AND external_reference IS NOT NULL ORDER BY (status='pending') DESC,id DESC LIMIT 1",[req.customer.id]);
 if(!pay)return res.json({status:'no_pending',message:'No hay órdenes PayPal para verificar.'});
 if(pay.status==='verified')return res.json({status:'verified',message:'Tu último pago PayPal ya estaba confirmado. La fecha de vencimiento actualizada se muestra en «Mi membresía».'});
 try{
  // The order belongs to the authenticated customer. Resume capture if return processing failed.
  const order=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(pay.external_reference));
  if(order.status==='APPROVED'){
   const [[myPayment]]=await db.execute("SELECT id FROM payments WHERE user_id=? AND method='card' AND paypal_environment=? AND external_reference=? AND status='pending' LIMIT 1",[req.customer.id,paypalMode(),pay.external_reference]);
   if(myPayment)await paypalApi('/v2/checkout/orders/'+encodeURIComponent(pay.external_reference)+'/capture',{method:'POST',headers:{'PayPal-Request-Id':'fijas-capture-'+myPayment.id},body:'{}'});
  }
  const done=await reconcilePaypalOrder(pay.external_reference);
  res.json({status:done?'verified':'pending',message:done?'Pago confirmado. VIP activado.':'Aún no hay un pago capturado confirmado.'});
 }catch(e){console.error('paypal check',e.message);res.status(503).json({error:'No se pudo verificar el estado del pago. No pagues dos veces.'});}
});


// PayPal server-to-server webhooks (signed and deduplicated). Client redirects and
// client-supplied body fields NEVER grant VIP access.
const PAYPAL_EVENT_TYPES = new Set([
 'CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED',
 'CUSTOMER.DISPUTE.CREATED','CUSTOMER.DISPUTE.UPDATED','CUSTOMER.DISPUTE.RESOLVED'
]);
async function verifyPaypalWebhook(req,event){
 if(!process.env.PAYPAL_WEBHOOK_ID?.trim())return false;
 const names=['paypal-transmission-id','paypal-transmission-time','paypal-transmission-sig','paypal-cert-url','paypal-auth-algo'];
 if(names.some(n=>!req.get(n)))return false;
 const verification=await paypalApi('/v1/notifications/verify-webhook-signature',{method:'POST',body:JSON.stringify({
  transmission_id:req.get('paypal-transmission-id'),transmission_time:req.get('paypal-transmission-time'),
  transmission_sig:req.get('paypal-transmission-sig'),cert_url:req.get('paypal-cert-url'),
  auth_algo:req.get('paypal-auth-algo'),webhook_id:process.env.PAYPAL_WEBHOOK_ID,
  webhook_event:event
 })});
 return verification.verification_status==='SUCCESS';
}
async function recordPaypalIncident({eventId,captureId,kind,resourceId=null,amountUsd=null,notes=''}){
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [[pay]]=await conn.execute(`SELECT id,user_id,membership_id,status,paypal_environment,
   paypal_amount_usd,paypal_capture_id,paypal_financial_state
   FROM payments WHERE paypal_capture_id=? AND method='card' FOR UPDATE`,[captureId]);
  if(!pay || pay.paypal_environment!==paypalMode()){await conn.rollback();return 'unmatched';}
  const [[previous]]=await conn.execute(`SELECT id FROM paypal_incidents WHERE event_id=? OR (payment_id=? AND kind='refund' AND resource_id=?) LIMIT 1`,[eventId,pay.id,resourceId]);
  if(previous){await conn.rollback();return 'processed';}
  await conn.execute('INSERT INTO paypal_incidents(payment_id,event_id,resource_id,kind,amount_usd,notes) VALUES (?,?,?,?,?,?)',
   [pay.id,eventId,resourceId,kind,amountUsd,notes.slice(0,250)]);
  let state='captured',notification='';
  if(kind==='refund'){
   const [[sums]]=await conn.execute("SELECT COALESCE(SUM(amount_usd),0) AS refunded_usd FROM paypal_incidents WHERE payment_id=? AND kind='refund'",[pay.id]);
   state=refundState(String(sums.refunded_usd),pay.paypal_amount_usd);
   if(state==='review')state='partially_refunded'; // uncertain totals: require manual review, do not revoke.
   notification=state==='refunded'?'PayPal confirmó un reembolso completo. El acceso VIP asociado se retiró.':'PayPal registró un reembolso parcial. Tu membresía será revisada.';
  } else if(kind==='reversal'){
   state='reversed';notification='PayPal notificó la reversión de tu pago. Tu membresía asociada fue cancelada.';
  } else {
   state='disputed';notification='PayPal registró una disputa sobre tu pago. El equipo revisará la operación.';
  }
  if(pay.status==='refunded' && state==='disputed')state=pay.paypal_financial_state; // Do not erase an already settled full refund.
  await conn.execute('UPDATE payments SET paypal_financial_state=?,paypal_issue_at=UTC_TIMESTAMP() WHERE id=?',[state,pay.id]);
  if(state==='refunded'||state==='reversed'){
   await conn.execute("UPDATE payments SET status='refunded' WHERE id=? AND status='verified'",[pay.id]);
   await conn.execute("UPDATE memberships SET status='cancelled',revoked_at=UTC_TIMESTAMP(),revoke_reason='PayPal: reembolso o reversión confirmado' WHERE id=? AND status='active' AND archived_at IS NULL",[pay.membership_id]);
  }
  await conn.execute('INSERT INTO customer_notifications(user_id,payment_id,kind,message) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE message=VALUES(message)',
   [pay.user_id,pay.id,kind==='refund'?('paypal_'+state):('paypal_'+kind),notification]);
  await conn.execute("INSERT INTO audit_logs(action,entity_type,entity_id,details) VALUES ('paypal_financial_incident','payment',?,JSON_OBJECT('kind',?,'state',?,'environment',?,'event_id',?))",
   [String(pay.id),kind,state,paypalMode(),eventId]);
  await conn.commit();return 'processed';
 }catch(e){try{await conn.rollback();}catch{}throw e;}finally{conn.release();}
}
async function processPayPalEvent(event){
 const type=event.event_type,resource=event.resource||{};
 if(type==='CHECKOUT.ORDER.APPROVED'){
  const orderId=resource.id;
  if(!orderId || !/^[A-Z0-9-]{8,64}$/i.test(orderId))return 'unmatched';
  const [[pay]]=await db.execute("SELECT id,status,paypal_amount_usd FROM payments WHERE external_reference=? AND paypal_environment=? AND method='card' LIMIT 1",[orderId,paypalMode()]);
  if(!pay)return 'unmatched';
  if(pay.status==='verified'||pay.status==='refunded')return 'processed';
  if(pay.status!=='pending')return 'ignored';
  const order=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(orderId));
  if(order.status==='APPROVED'){
   const unit=order.purchase_units?.[0];
   if(order.purchase_units?.length!==1||String(unit?.custom_id)!==String(pay.id)||
      unit?.amount?.currency_code!=='USD'||usdCents(unit.amount.value)!==usdCents(pay.paypal_amount_usd))return 'unmatched';
   await paypalApi('/v2/checkout/orders/'+encodeURIComponent(orderId)+'/capture',{
    method:'POST',headers:{'PayPal-Request-Id':'fijas-capture-'+pay.id},body:'{}'});
  }
  return await reconcilePaypalOrder(orderId)?'processed':'unmatched';
 }
 if(type==='PAYMENT.CAPTURE.DENIED'){
  const orderId=resource.supplementary_data?.related_ids?.order_id;
  if(!orderId)return 'unmatched';
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [[pay]]=await conn.execute("SELECT id,user_id,membership_id,status FROM payments WHERE external_reference=? AND paypal_environment=? AND method='card' FOR UPDATE",[orderId,paypalMode()]);
   if(!pay){await conn.rollback();return 'unmatched';}
   if(pay.status==='pending'){
    await conn.execute("UPDATE payments SET status='rejected' WHERE id=?",[pay.id]);
    await conn.execute("UPDATE memberships SET status='cancelled' WHERE id=? AND status='pending'",[pay.membership_id]);
    await conn.execute("INSERT INTO customer_notifications(user_id,payment_id,kind,message) VALUES (?,?,'paypal_denied',?) ON DUPLICATE KEY UPDATE id=id",[pay.user_id,pay.id,'PayPal rechazó la captura del pago. No se activó VIP.']);
   }
   await conn.commit();return 'processed';
  }catch(e){try{await conn.rollback();}catch{}throw e;}finally{conn.release();}
 }
 if(type==='PAYMENT.CAPTURE.COMPLETED'){
  const orderId=resource.supplementary_data?.related_ids?.order_id;
  if(!orderId)return 'unmatched';
  const [[local]]=await db.execute("SELECT id FROM payments WHERE external_reference=? AND paypal_environment=? AND method='card' LIMIT 1",[orderId,paypalMode()]);
  if(!local)return 'unmatched';
  const applied=await reconcilePaypalOrder(orderId);
  // Failed reconciliation might mean an amount mismatch or archived membership.
  // Do not acknowledge as a successful VIP activation; flag it for owner review.
  return applied?'processed':'unmatched';
 }
 if(type==='PAYMENT.CAPTURE.REFUNDED'){
  if(!/^[A-Z0-9-]{5,100}$/i.test(resource.id||''))return 'unmatched';
  const refund=await paypalApi('/v2/payments/refunds/'+encodeURIComponent(resource.id));
  if(refund.status!=='COMPLETED')return 'ignored';
  if(refund.amount?.currency_code!=='USD'||usdCents(refund.amount.value)===null)return 'unmatched';
  const captureId=captureIdFromRefund(refund)||captureIdFromRefund(resource);
  if(!captureId)return 'unmatched';
  return recordPaypalIncident({eventId:event.id,captureId,resourceId:refund.id,kind:'refund',amountUsd:refund.amount.value,
   notes:'PayPal refund '+resource.id});
 }
 if(type==='PAYMENT.CAPTURE.REVERSED'){
  if(!/^[A-Z0-9-]{5,100}$/i.test(resource.id||''))return 'unmatched';
  return recordPaypalIncident({eventId:event.id,captureId:resource.id,kind:'reversal',notes:'Captura revertida'});
 }
 if(type.startsWith('CUSTOMER.DISPUTE.')){
  // Disputes do not automatically erase historical entitlements or refund money.
  const captureId=(resource.disputed_transactions||[]).map(t=>t.seller_transaction_id).find(Boolean);
  if(!captureId)return 'unmatched';
  return recordPaypalIncident({eventId:event.id,captureId,kind:'dispute',notes:type});
 }
 return 'ignored';
}
app.post('/api/payments/paypal/webhook',async(req,res)=>{
 if(!Buffer.isBuffer(req.body))return res.status(415).json({error:'Content-Type inválido'});
 if(req.body.length>128*1024)return res.status(413).end();
 let event;
 try{event=JSON.parse(req.body.toString('utf8'));}catch{return res.status(400).json({error:'JSON inválido'});}
 if(!event?.id||typeof event.id!=='string'||event.id.length>100||!event.event_type)return res.status(400).end();
 try{
  if(!await verifyPaypalWebhook(req,event))return res.status(401).json({error:'Firma PayPal inválida'});
  const mode=paypalMode();
  const [[seen]]=await db.execute('SELECT event_id FROM paypal_webhook_events WHERE environment=? AND event_id=? LIMIT 1',[mode,event.id]);
  if(seen)return res.status(200).json({ok:true,duplicate:true});
  const outcome=PAYPAL_EVENT_TYPES.has(event.event_type)?await processPayPalEvent(event):'ignored';
  await db.execute('INSERT IGNORE INTO paypal_webhook_events(environment,event_id,event_type,outcome) VALUES (?,?,?,?)',
   [mode,event.id,String(event.event_type).slice(0,100),outcome]);
  res.json({ok:true});
 }catch(e){console.error('PayPal webhook handling',e.code||e.message);res.status(503).json({error:'Webhook temporalmente no procesado; PayPal puede reintentarlo'});}
});

// Financial reporting never mixes Sandbox payments with Live revenue or manually confirmed PEN.
app.get('/api/admin/finance',authenticate,async(req,res)=>{
 if(!canManagePayments(req.admin))return res.status(403).json({error:'Sin permisos para ver finanzas'});
 try{
  const [[sales]]=await db.query(`SELECT
   (SELECT COALESCE(SUM(paypal_amount_usd),0) FROM payments WHERE method='card' AND paypal_environment='live' AND status IN('verified','refunded') AND paypal_capture_id IS NOT NULL) AS live_gross_usd,
   (SELECT COALESCE(SUM(paypal_amount_usd),0) FROM payments WHERE method='card' AND paypal_environment='sandbox' AND status IN('verified','refunded') AND paypal_capture_id IS NOT NULL) AS sandbox_test_gross_usd,
   (SELECT COALESCE(SUM(amount_pen),0) FROM payments WHERE method<>'card' AND status='verified') AS manual_verified_pen,
   (SELECT COUNT(*) FROM payments WHERE method='card' AND paypal_environment='legacy') AS historical_unclassified,
   (SELECT COUNT(*) FROM payments WHERE method='card' AND paypal_environment='live' AND status='pending') AS live_pending,
   (SELECT COUNT(*) FROM payments WHERE method='card' AND paypal_financial_state='disputed') AS disputed_count`);
  const [[refunds]]=await db.query(`SELECT COALESCE(SUM(CASE WHEN py.paypal_environment='live' THEN pi.amount_usd ELSE 0 END),0) AS live_refunds_usd,
   COALESCE(SUM(CASE WHEN py.paypal_environment='sandbox' THEN pi.amount_usd ELSE 0 END),0) AS sandbox_refunds_usd
   FROM paypal_incidents pi JOIN payments py ON py.id=pi.payment_id WHERE pi.kind='refund'`);
  const [byPlan]=await db.query(`SELECT p.name AS plan,COUNT(*) AS payments,COALESCE(SUM(py.paypal_amount_usd),0) AS gross_usd
   FROM payments py JOIN memberships m ON m.id=py.membership_id JOIN plans p ON p.id=m.plan_id
   WHERE py.method='card' AND py.paypal_environment='live' AND py.status IN('verified','refunded') AND py.paypal_capture_id IS NOT NULL
   GROUP BY p.id,p.name ORDER BY gross_usd DESC`);
  const [incidents]=await db.query(`SELECT pi.id,pi.kind,pi.amount_usd,pi.notes,pi.created_at,py.id AS payment_id,
   py.paypal_environment,py.paypal_financial_state,u.email
   FROM paypal_incidents pi JOIN payments py ON py.id=pi.payment_id JOIN users u ON u.id=py.user_id
   ORDER BY pi.id DESC LIMIT 30`);
  const [unmatched]=await db.query(`SELECT environment,event_type,event_id,received_at
   FROM paypal_webhook_events WHERE outcome='unmatched' ORDER BY received_at DESC LIMIT 15`);
  res.json({mode:paypalMode(),stats:{...sales,...refunds},byPlan,incidents,unmatched,
   note:'Importes brutos antes de comisiones e impuestos. Los reembolsos figuran por separado. No sumar USD y PEN ni tratar Sandbox/legacy como ingresos reales.'});
 }catch(e){console.error('financial dashboard',e.code||e.message);res.status(500).json({error:'No se pudo cargar el control financiero'});}
});

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
telegramVipControl=installTelegramRoutes(app,{db,customerAuth,authenticate,limit:apiRateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false})});
notificationControl=installNotificationCenter(app,{db,customerAuth,limit:apiRateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false})});
footballControl=installFootballAutomation(app,{db,authenticate});
app.use(express.static(root,{index:'index.html',dotfiles:'ignore',setHeaders(res,servedPath){
 if(/\.(?:html|js|css)$/i.test(servedPath))res.setHeader('Cache-Control','no-store');
}}));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((req,res)=>res.status(404).send('Not Found'));
const port=Number(process.env.PORT||3000);
try{await initializeDatabase();await db.query(`CREATE TABLE IF NOT EXISTS customer_password_resets (user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);app.listen(port,'0.0.0.0',()=>{
 console.log(`Fijas de Elite API listening on ${port}`);
 footballControl?.start();
 // Start durable opt-in notification outbox after database migration.
 if(process.env.TELEGRAM_BOT_TOKEN){
  setImmediate(()=>notificationControl?.tick().catch(error=>console.error('notification startup worker',error.code||error.message)));
 }
 // Restart reconciliation of known Telegram members. The interval then keeps auditing.
 if(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID){
  setImmediate(()=>telegramVipControl?.synchronizeExpired().then(r=>console.log('Telegram VIP startup reconciliation:',JSON.stringify(r))).catch(e=>console.error('Telegram VIP startup reconciliation failed:',e.message)));
 }
});}
catch(e){console.error('Database initialization failed:',e);process.exitCode=1;await db.end();}
