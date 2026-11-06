import crypto from 'node:crypto';
import {sha256,safeTelegramId,telegramApi,telegramLinkStart,telegramWebhookSecretValid} from './telegram-bridge.js';

const BOT_ENDPOINT='/api/telegram/webhook';
const VIP_SQL=`SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND status='active' AND archived_at IS NULL AND starts_at<=UTC_TIMESTAMP() AND ends_at>UTC_TIMESTAMP()) AS vip`;
const validWebhookSecret=()=>/^[A-Za-z0-9_-]{24,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET||'');
const telegramEnabled=()=>Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID&&validWebhookSecret());

export function installTelegramRoutes(app,{db,customerAuth,authenticate,limit}){
 let cachedBotUsername='';
 const api=(method,payload)=>telegramApi(method,payload);
 async function botUsername(){
  if(cachedBotUsername)return cachedBotUsername;
  const bot=await api('getMe');
  if(!/^[A-Za-z0-9_]{5,32}$/.test(bot.username||''))throw Error('Nombre de bot inválido');
  cachedBotUsername=bot.username;
  return cachedBotUsername;
 }
 async function activeVip(userId){
  const [[row]]=await db.execute(VIP_SQL,[userId]);
  return Boolean(row?.vip);
 }
 async function allowedToJoin(telegramUserId){
  const [[row]]=await db.execute(`SELECT t.user_id,u.account_status,EXISTS(SELECT 1 FROM memberships m
   WHERE m.user_id=t.user_id AND m.status='active' AND m.archived_at IS NULL
   AND m.starts_at<=UTC_TIMESTAMP() AND m.ends_at>UTC_TIMESTAMP()) AS active_vip
   FROM telegram_links t JOIN users u ON u.id=t.user_id WHERE t.telegram_user_id=? LIMIT 1`,[String(telegramUserId)]);
  return row?.account_status==='active' && Boolean(row?.active_vip)?row:null;
 }
 // Return only non-secret status to an authenticated customer.
 app.get('/api/customers/telegram',customerAuth,async(req,res)=>{
  try{
   const [[link]]=await db.execute('SELECT telegram_user_id,telegram_username,is_member,linked_at FROM telegram_links WHERE user_id=?',[req.customer.id]);
   const vip=await activeVip(req.customer.id);
   res.json({configured:telegramEnabled(),linked:Boolean(link),telegram_username:link?.telegram_username||null,telegram_user_id:link?.telegram_user_id?String(link.telegram_user_id):null,is_member:Boolean(link?.is_member),has_vip:vip,public_group_url:process.env.TELEGRAM_FREE_GROUP_URL||null});
  }catch(error){console.error('telegram customer status',error.code||error.message);res.status(503).json({error:'No se pudo cargar Telegram'});}
 });
 app.post('/api/customers/telegram/link',limit,customerAuth,async(req,res)=>{
  if(!telegramEnabled())return res.status(503).json({error:'El dueño todavía no habilitó el bot y el canal VIP.'});
  try{
   const [[linked]]=await db.execute('SELECT telegram_user_id FROM telegram_links WHERE user_id=?',[req.customer.id]);
   if(linked)return res.status(409).json({error:'Tu cuenta ya tiene Telegram vinculado. Contacta a soporte si necesitas cambiarlo.'});
   const code=crypto.randomBytes(24).toString('hex');
   const username=await botUsername();
   await db.execute(`INSERT INTO telegram_link_tokens(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))
    ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)`,[req.customer.id,sha256(code)]);
   res.json({url:`https://t.me/${username}?start=${code}`,expires_in_minutes:10,message:'Abre Telegram y pulsa Iniciar. Luego vuelve a la web.'});
  }catch(error){console.error('telegram link',error.code||error.message);res.status(503).json({error:'No se pudo preparar la vinculación de Telegram'});}
 });
 app.post('/api/customers/telegram/invite',limit,customerAuth,async(req,res)=>{
  if(!telegramEnabled())return res.status(503).json({error:'El canal VIP aún no está configurado.'});
  try{
   const [[link]]=await db.execute('SELECT telegram_user_id FROM telegram_links WHERE user_id=?',[req.customer.id]);
   if(!link)return res.status(409).json({error:'Primero vincula tu cuenta de Telegram.'});
   if(!await activeVip(req.customer.id))return res.status(403).json({error:'Necesitas una membresía VIP activa para entrar al canal.'});
   // Join requests are ALWAYS checked against the linked Telegram ID; forwarded links grant no privilege.
   const expiration=Math.floor(Date.now()/1000)+15*60;
   const invite=await api('createChatInviteLink',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,name:`Fijas VIP u${req.customer.id}`.slice(0,32),expire_date:expiration,creates_join_request:true});
   await db.execute(`INSERT INTO telegram_vip_invites(user_id,invite_hash,expires_at)
    VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))
    ON DUPLICATE KEY UPDATE invite_hash=VALUES(invite_hash),expires_at=VALUES(expires_at)`,[req.customer.id,sha256(invite.invite_link)]);
   res.json({url:invite.invite_link,expires_in_minutes:15,message:'Abre el enlace y solicita unirte. El bot comprobará tu VIP antes de aprobarte.'});
  }catch(error){console.error('telegram invite',error.code||error.message);res.status(503).json({error:'No se pudo generar la invitación. Comprueba los permisos del bot en el canal.'});}
 });
 // Telegram identifies the user who sends /start in a direct message. Never use a user-supplied Telegram ID.
 async function handleStart(message){
  if(message.chat?.type!=='private'||!safeTelegramId(message.from?.id))return;
  const code=telegramLinkStart(message.text);
  if(!code)return;
  const conn=await db.getConnection();let reply='No se pudo vincular la cuenta.';
  try{
   await conn.beginTransaction();
   const [[token]]=await conn.execute(`SELECT t.user_id,u.account_status FROM telegram_link_tokens t
    JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP() FOR UPDATE`,[sha256(code)]);
   if(!token||token.account_status!=='active'){await conn.rollback();reply='El enlace venció o no está disponible. Solicita otro desde tu panel.';}
   else{
    const [[linked]]=await conn.execute('SELECT user_id,telegram_user_id FROM telegram_links WHERE user_id=? OR telegram_user_id=? FOR UPDATE',[token.user_id,String(message.from.id)]);
    if(linked){await conn.rollback();reply='Esta cuenta o usuario de Telegram ya está vinculado. Contacta a soporte para cambiarlo.';}
    else{
     await conn.execute('INSERT INTO telegram_links(user_id,telegram_user_id,telegram_username,is_member) VALUES(?,?,?,0)',[token.user_id,String(message.from.id),String(message.from.username||'').slice(0,100)||null]);
     await conn.execute('DELETE FROM telegram_link_tokens WHERE user_id=?',[token.user_id]);
     await conn.commit();reply='✅ Telegram vinculado con Fijas de Élite. Vuelve a tu panel web para solicitar el acceso al canal VIP.';
    }
   }
  }catch(error){try{await conn.rollback();}catch{}console.error('telegram start',error.code||error.message);}
  finally{conn.release();}
  try{await api('sendMessage',{chat_id:message.chat.id,text:reply});}catch(error){console.error('telegram start reply',error.message);}
 }
 async function removeFromVip(telegramUserId){
  // Telegram requires ban then unban to remove a subscriber while permitting rejoining after renewal.
  await api('banChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramUserId,revoke_messages:false});
  await api('unbanChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramUserId,only_if_banned:true});
 }
 async function handleJoinRequest(request){
  if(String(request.chat?.id)!==String(process.env.TELEGRAM_VIP_CHAT_ID)||!safeTelegramId(request.from?.id))return;
  const telegramId=String(request.from.id);
  const allowed=await allowedToJoin(telegramId);
  let approved=false;
  if(allowed){
   const [[already]]=await db.execute('SELECT is_member FROM telegram_links WHERE user_id=?',[allowed.user_id]);
   if(already?.is_member)return; // Telegram can retry an already approved update.
   const [[invite]]=await db.execute('SELECT invite_hash FROM telegram_vip_invites WHERE user_id=? AND expires_at>UTC_TIMESTAMP() LIMIT 1',[allowed.user_id]);
   approved=Boolean(invite && request.invite_link?.invite_link && sha256(request.invite_link.invite_link)===invite.invite_hash);
  }
  if(!approved){await api('declineChatJoinRequest',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId});return;}
  await api('approveChatJoinRequest',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId});
  await db.execute('UPDATE telegram_links SET is_member=1,last_verified_at=UTC_TIMESTAMP() WHERE user_id=?',[allowed.user_id]);
  await db.execute('DELETE FROM telegram_vip_invites WHERE user_id=?',[allowed.user_id]);
 }
 async function handleChatMember(update){
  if(String(update.chat?.id)!==String(process.env.TELEGRAM_VIP_CHAT_ID))return;
  const user=update.new_chat_member?.user;
  if(!safeTelegramId(user?.id)||user.is_bot)return;
  const status=update.new_chat_member.status;
  if(['administrator','creator'].includes(status))return; // Never remove a channel owner/admin.
  if(status==='member'){
   const allowed=await allowedToJoin(user.id);
   if(!allowed){await removeFromVip(user.id);return;}
   await db.execute('UPDATE telegram_links SET is_member=1,last_verified_at=UTC_TIMESTAMP() WHERE user_id=?',[allowed.user_id]);
  }else if(['left','kicked'].includes(status)){
   await db.execute('UPDATE telegram_links SET is_member=0 WHERE telegram_user_id=?',[String(user.id)]);
  }
 }
 app.post(BOT_ENDPOINT,async(req,res)=>{
  if(!validWebhookSecret()||!telegramWebhookSecretValid(req.get('X-Telegram-Bot-Api-Secret-Token'),process.env.TELEGRAM_WEBHOOK_SECRET))
   return res.status(403).json({error:'Solicitud no autorizada'});
  const update=req.body;
  if(!update||typeof update!=='object'||!Number.isSafeInteger(update.update_id))return res.status(400).json({error:'Actualización inválida'});
  try{
   if(update.message)await handleStart(update.message);
   if(update.chat_join_request)await handleJoinRequest(update.chat_join_request);
   if(update.chat_member)await handleChatMember(update.chat_member);
   res.json({ok:true});
  }catch(error){console.error('telegram webhook processing',error.code||error.message);res.status(503).json({error:'No se pudo procesar la actualización'});}
 });
 async function synchronizeExpired(){
  if(!telegramEnabled())return {removed:0,failed:0};
  const [users]=await db.query(`SELECT t.user_id,t.telegram_user_id FROM telegram_links t JOIN users u ON u.id=t.user_id
   WHERE t.is_member=1 AND (u.account_status='blacklisted' OR NOT EXISTS(
    SELECT 1 FROM memberships m WHERE m.user_id=t.user_id AND m.status='active' AND m.archived_at IS NULL AND m.starts_at<=UTC_TIMESTAMP() AND m.ends_at>UTC_TIMESTAMP()))
   ORDER BY t.user_id LIMIT 100`);
  let removed=0,failed=0;
  for(const u of users){
   try{await removeFromVip(String(u.telegram_user_id));await db.execute('UPDATE telegram_links SET is_member=0 WHERE user_id=?',[u.user_id]);removed++;}
   catch(error){failed++;console.error('telegram vip sync',error.message);}
  }
  return {removed,failed};
 }
 app.get('/api/admin/telegram',authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede configurar Telegram'});
  try{
   const [[stats]]=await db.query('SELECT COUNT(*) AS linked,COALESCE(SUM(is_member),0) AS members FROM telegram_links');
   res.json({bot_configured:Boolean(process.env.TELEGRAM_BOT_TOKEN),vip_channel_configured:Boolean(process.env.TELEGRAM_VIP_CHAT_ID),free_group_configured:Boolean(process.env.TELEGRAM_FREE_CHAT_ID),webhook_secret_configured:validWebhookSecret(),public_base_url_configured:Boolean(process.env.PUBLIC_BASE_URL),linked:Number(stats.linked),vip_members:Number(stats.members)});
  }catch(error){console.error('telegram admin',error.code||error.message);res.status(503).json({error:'No se pudo consultar Telegram'});}
 });
 app.post('/api/admin/telegram/configure',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede configurar Telegram'});
  if(!telegramEnabled()||!process.env.PUBLIC_BASE_URL)return res.status(400).json({error:'Configura TELEGRAM_BOT_TOKEN, TELEGRAM_VIP_CHAT_ID, TELEGRAM_WEBHOOK_SECRET y PUBLIC_BASE_URL'});
  try{
   const base=new URL(process.env.PUBLIC_BASE_URL);
   if(base.protocol!=='https:')return res.status(400).json({error:'PUBLIC_BASE_URL debe usar HTTPS'});
   await api('setWebhook',{url:base.origin+BOT_ENDPOINT,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','chat_join_request','chat_member'],max_connections:1});
   const bot=await api('getMe');cachedBotUsername=bot.username;
   res.json({ok:true,bot_username:cachedBotUsername,message:'Webhook activado. Telegram podrá vincular cuentas y gestionar solicitudes VIP.'});
  }catch(error){console.error('telegram configure',error.message);res.status(503).json({error:'Telegram rechazó el webhook. Revisa el token y los permisos del bot.'});}
 });
 app.post('/api/admin/telegram/sync',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede sincronizar Telegram'});
  try{res.json({ok:true,...await synchronizeExpired()});}
  catch(error){console.error('telegram sync',error.code||error.message);res.status(503).json({error:'No se pudo sincronizar el canal'});}
 });
 // Best effort sync every 3 minutes. Admin can trigger a manual sync after revoking VIP.
 let running=false;
 const timer=setInterval(async()=>{
  if(running)return;
  running=true;
  try{await synchronizeExpired();}catch(error){console.error('telegram scheduled sync',error.code||error.message);}
  finally{running=false;}
 },180000);
 timer.unref?.();
 return {synchronizeExpired};
}
