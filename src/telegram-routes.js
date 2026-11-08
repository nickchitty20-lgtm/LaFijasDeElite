import {safeTelegramPublicUrl,freeTelegramDestination} from './telegram-public.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {sha256,safeTelegramId,telegramApi,telegramLinkStart,telegramWebhookSecretValid} from './telegram-bridge.js';
import {canApproveJoinRequest} from './telegram-invite-policy.js';
import {effectiveVipSql,getVipEntitlement} from './vip-access.js';
import {rank0ActionMatchesStatus,rank0DesiredAction} from './telegram-rank0-policy.js';
import {shouldPreserveDetachedMember,shouldReleaseDetachedReservation,canBeginNewTelegramLink,shouldPreserveOwnerMember,ownerForceCanProceed} from './telegram-detach-policy.js';

const BOT_ENDPOINT='/api/telegram/webhook';
const VIP_SQL=`SELECT ${effectiveVipSql('u')} AS vip FROM users u WHERE u.id=? AND u.account_status='active'`;
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
  const [[row]]=await db.execute(`SELECT t.user_id,t.telegram_user_id,u.account_status,
   ${effectiveVipSql('u')} AS active_vip
   FROM telegram_links t JOIN users u ON u.id=t.user_id WHERE t.link_status='active' AND t.telegram_user_id=?
   AND NOT EXISTS(SELECT 1 FROM telegram_change_state c WHERE c.user_id=t.user_id AND c.status='awaiting_new')
   LIMIT 1`,[String(telegramUserId)]);
  return row?.account_status==='active' && Boolean(row?.active_vip)?row:null;
 }
 // Keep a ledger of IDs that Telegram has told the bot about. Bot API cannot list all channel members.
 async function rememberMember(telegramId,state){
  if(!safeTelegramId(telegramId))return;
  await db.execute(`INSERT INTO telegram_channel_members(telegram_user_id,state,last_seen_at)
   VALUES (?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE state=VALUES(state),last_seen_at=UTC_TIMESTAMP()`,
   [String(telegramId),state]);
 }
 async function markChecked(telegramId,state,error=null){
  await db.execute(`INSERT INTO telegram_channel_members(telegram_user_id,state,last_seen_at,last_checked_at,last_error)
   VALUES(?, ?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),?) ON DUPLICATE KEY UPDATE state=VALUES(state),
   last_checked_at=UTC_TIMESTAMP(),last_error=VALUES(last_error)`,[String(telegramId),state,error?String(error).slice(0,250):null]);
 }
 // A detached Telegram stays inside the channel untouched. Its VIP seat remains
 // reserved until it has actually left; this prevents sharing one subscription.
 async function checkDetachedAndRelease(userId){
  const [[link]]=await db.execute('SELECT telegram_user_id,link_status FROM telegram_links WHERE user_id=?',[userId]);
  if(!link||link.link_status!=='detached')return {pending:false,linked:link?.link_status==='active'};
  if(!telegramEnabled())return {pending:true,warning:'Telegram no está configurado para comprobar la salida.'};
  const id=String(link.telegram_user_id);
  const member=await api('getChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:id});
  const left=shouldReleaseDetachedReservation(link.link_status,member.status,member.is_member);
  if(!left)return {pending:true,telegram_member_status:member.status};
  await db.execute("DELETE FROM telegram_links WHERE user_id=? AND telegram_user_id=? AND link_status='detached'",[userId,id]);
  await markChecked(id,'left');
  return {pending:false,released:true};
 }
 async function detachLink(userId,{actor='customer',adminId=null,reason=null}={}){
  let conn;
  try{
   conn=await db.getConnection();await conn.beginTransaction();
   const [[link]]=await conn.execute('SELECT telegram_user_id,link_status FROM telegram_links WHERE user_id=? FOR UPDATE',[userId]);
   if(!link){await conn.rollback();return {status:404,error:'Esta cuenta no tiene Telegram vinculado.'};}
   if(link.link_status==='detached'){
    await conn.rollback();return {status:409,error:'Telegram ya está desvinculado. Primero debe salir del canal VIP antes de vincular otro.'};
   }
   const [[state]]=await conn.execute('SELECT status FROM telegram_change_state WHERE user_id=? FOR UPDATE',[userId]);
   if(state?.status==='awaiting_new'){
    await conn.rollback();return {status:409,error:'Hay un cambio de Telegram en curso. Termínalo antes de desvincular.'};
   }
   const [[invite]]=await conn.execute('SELECT invite_link FROM telegram_vip_invites WHERE user_id=? FOR UPDATE',[userId]);
   await conn.execute("UPDATE telegram_links SET link_status='detached' WHERE user_id=? AND link_status='active'",[userId]);
   await conn.execute('DELETE FROM telegram_vip_invites WHERE user_id=?',[userId]);
   await conn.execute('DELETE FROM telegram_link_tokens WHERE user_id=?',[userId]);
   await conn.execute(`INSERT INTO telegram_change_state(user_id,status,cooldown_until)
    VALUES (?,'idle',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY))
    ON DUPLICATE KEY UPDATE status='idle',pending_token_hash=NULL,pending_expires_at=NULL,
    cooldown_until=GREATEST(COALESCE(cooldown_until,UTC_TIMESTAMP()),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY))`,[userId]);
   await conn.execute('UPDATE telegram_notice_prefs SET vip_enabled=0,expiry_enabled=0,picks_enabled=0 WHERE user_id=?',[userId]);
   await conn.execute(`INSERT INTO telegram_unlink_events(user_id,telegram_user_id,performed_by,actor_admin_id,reason)
    VALUES (?,?,?,?,?)`,[userId,String(link.telegram_user_id),actor,adminId,reason]);
   if(actor==='owner')await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
    VALUES (?,'telegram_unlinked_no_kick','user',?,?)`,[adminId,String(userId),JSON.stringify({telegram_user_id:String(link.telegram_user_id),reason})]);
   await conn.commit();
   // No banChatMember, unbanChatMember, or other Telegram membership change here.
   if(invite?.invite_link)await revokeInvitationLink(invite.invite_link);
   return {status:200,ok:true,message:'Telegram desvinculado sin expulsar del canal VIP. La cuenta anterior conserva su plaza hasta que salga o el creador la retire; no se puede vincular otro Telegram mientras tanto.'};
  }catch(error){if(conn)try{await conn.rollback();}catch{}throw error;}
  finally{conn?.release();}
 }
 // Never tamper with Telegram channel admins/owner: the bot cannot remove other admins reliably.
 async function evaluateMember(telegramId){
  const id=String(telegramId);
  const state=await api('getChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:id});
  if(['left','kicked'].includes(state.status)){
   await markChecked(id,'left');await db.execute('UPDATE telegram_links SET is_member=0 WHERE telegram_user_id=?',[id]);
   await db.execute("DELETE FROM telegram_links WHERE telegram_user_id=? AND link_status='detached'",[id]);
   await db.execute('DELETE FROM telegram_owner_preserved WHERE telegram_user_id=?',[id]);
   return 'not_member';
  }
  if(['administrator','creator'].includes(state.status)){
   await markChecked(id,'member','Administradores de Telegram requieren revisión manual');
   return 'telegram_admin';
  }
  if(state.status!=='member'){
   await markChecked(id,'left');return 'not_member';
  }
  const [[detached]]=await db.execute(`SELECT t.link_status,u.account_status,${effectiveVipSql('u')} AS active_vip FROM telegram_links t
   JOIN users u ON u.id=t.user_id WHERE t.telegram_user_id=? LIMIT 1`,[id]);
  if(shouldPreserveDetachedMember(detached?.link_status,detached?.account_status,detached?.active_vip)){
   await markChecked(id,'member','Desvinculado: retiro manual pendiente del creador');
   return 'detached_kept';
  }
  const [[ownerPreserved]]=await db.execute(`SELECT p.user_id,u.account_status,
    ${effectiveVipSql('u')} AS active_vip FROM telegram_owner_preserved p
    JOIN users u ON u.id=p.user_id WHERE p.telegram_user_id=? LIMIT 1`,[id]);
  if(shouldPreserveOwnerMember(ownerPreserved,ownerPreserved?.account_status,ownerPreserved?.active_vip)){
   await markChecked(id,'member','Excepción del creador: Telegram anterior conservado sin vinculación');
   return 'owner_preserved_kept';
  }
  // An expired VIP/Rank 0 does not inherit an endless exception.
  if(ownerPreserved)await db.execute('DELETE FROM telegram_owner_preserved WHERE telegram_user_id=?',[id]);
  const eligible=await allowedToJoin(id);
  if(eligible){
   await markChecked(id,'member');
   await db.execute('UPDATE telegram_links SET is_member=1,last_verified_at=UTC_TIMESTAMP() WHERE user_id=?',[eligible.user_id]);
   return 'kept';
  }
  // A Rank 0 is banned indefinitely; other non-VIPs are removed and can request
  // a fresh invite after becoming eligible. Shared/old invitations cannot bypass approval.
  const [[account]]=await db.execute(`SELECT u.account_status FROM telegram_links t
   JOIN users u ON u.id=t.user_id WHERE t.telegram_user_id=? LIMIT 1`,[id]);
  await api('banChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:id,revoke_messages:false});
  if(account?.account_status!=='blacklisted'){
   await api('unbanChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:id,only_if_banned:true});
  }
  await markChecked(id,'left');
  await db.execute('UPDATE telegram_links SET is_member=0 WHERE telegram_user_id=?',[id]);
  return 'removed';
 }
 // One unused link per user. Telegram's expiry is enforced by Telegram itself;
 // the database hash is additionally required before any join request is approved.
 async function revokeInvitationLink(inviteLink){
  if(!inviteLink)return false; // Legacy v1.9.2 rows have only a hash; they still expire in Telegram.
  try{await api('revokeChatInviteLink',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,invite_link:inviteLink});return true;}
  catch(error){console.error('telegram invite revoke (access still requires approval)',error.message);return false;}
 }
 async function discardInvitation(userId){
  const [[invite]]=await db.execute('SELECT invite_link FROM telegram_vip_invites WHERE user_id=?',[userId]);
  await db.execute('DELETE FROM telegram_vip_invites WHERE user_id=?',[userId]);
  if(invite?.invite_link)await revokeInvitationLink(invite.invite_link);
 }
 // Persist Rank 0 changes before calling Telegram, so temporary outages or restarts
 // cannot silently lose a ban or a later unban. No public-group method is called.
 async function queueRank0Action(userId,action){
  const [[account]]=await db.execute(`SELECT u.account_status,t.telegram_user_id FROM users u
    LEFT JOIN telegram_links t ON t.user_id=u.id WHERE u.id=?`,[userId]);
  if(!account)return {queued:false,error:'Cuenta inexistente'};
  if(!rank0ActionMatchesStatus(action,account.account_status))
   return {queued:false,error:'El rango cambió mientras se procesaba Telegram'};
  if(!account.telegram_user_id)return {account_linked:false,vip_channel_blocked:true,vip_channel_unblocked:true};
  await db.execute(`INSERT INTO telegram_rank0_actions(user_id,telegram_user_id,action)
    VALUES(?,?,?) ON DUPLICATE KEY UPDATE telegram_user_id=VALUES(telegram_user_id),
    action=VALUES(action),attempts=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP`,
    [userId,String(account.telegram_user_id),action]);
  return processRank0Action(userId);
 }
 async function processRank0Action(userId){
  const [[entry]]=await db.execute(`SELECT q.action,q.telegram_user_id,u.account_status,
    t.telegram_user_id AS current_telegram_id FROM telegram_rank0_actions q
    JOIN users u ON u.id=q.user_id
    LEFT JOIN telegram_links t ON t.user_id=q.user_id WHERE q.user_id=?`,[userId]);
  if(!entry)return {queued:false};
  if(!entry.current_telegram_id){
   await db.execute('DELETE FROM telegram_rank0_actions WHERE user_id=?',[userId]);
   return {account_linked:false,queued:false};
  }
  if(!rank0ActionMatchesStatus(entry.action,entry.account_status)
     || String(entry.current_telegram_id)!==String(entry.telegram_user_id)){
   // A concurrent role/link change superseded this action. Never release Rank 0.
   const desired=rank0DesiredAction(entry.account_status);
   await db.execute(`UPDATE telegram_rank0_actions SET telegram_user_id=?,action=?,attempts=0,
    last_error=NULL WHERE user_id=?`,[String(entry.current_telegram_id),desired,userId]);
   return {queued:true,warning:'Acción actualizada según el rango vigente; se reintentará en la próxima sincronización.'};
  }
  if(!telegramEnabled()){
   return {account_linked:true,queued:true,vip_channel_blocked:entry.action==='ban'?false:undefined,
    vip_channel_unblocked:entry.action==='unban'?false:undefined,
    warning:'Telegram no está configurado; la operación quedó pendiente para reintento.'};
  }
  try{
   const telegramId=String(entry.telegram_user_id);
   if(entry.action==='ban'){
    await api('banChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId,revoke_messages:false});
   }else{
    // only_if_banned=true lifts a Rank 0 ban without joining the channel.
    // Admission still requires a linked Telegram ID, active VIP and a new invite.
    await api('unbanChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId,only_if_banned:true});
   }
   await db.execute('UPDATE telegram_links SET is_member=0 WHERE user_id=? AND telegram_user_id=?',[userId,telegramId]);
   await markChecked(telegramId,'left');
   // Don't delete a newer opposite action written during an awaited API call.
   await db.execute(`DELETE FROM telegram_rank0_actions
     WHERE user_id=? AND action=? AND telegram_user_id=?`,[userId,entry.action,telegramId]);
   // If status changed mid-flight, enqueue the current desired action again.
   const [[current]]=await db.execute('SELECT account_status FROM users WHERE id=?',[userId]);
   if(current && !rank0ActionMatchesStatus(entry.action,current.account_status)){
    await db.execute(`INSERT INTO telegram_rank0_actions(user_id,telegram_user_id,action)
      VALUES(?,?,?) ON DUPLICATE KEY UPDATE action=VALUES(action),telegram_user_id=VALUES(telegram_user_id),
      attempts=0,last_error=NULL`,[userId,telegramId,rank0DesiredAction(current.account_status)]);
    return {queued:true,warning:'El rango volvió a cambiar; se aplicará la nueva restricción en la sincronización.'};
   }
   return {account_linked:true,queued:false,
    ...(entry.action==='ban'?{vip_channel_blocked:true}:{vip_channel_unblocked:true}),
    message:entry.action==='unban'?'Bloqueo de Telegram retirado. Solo podrá solicitar ingreso con VIP vigente.':'Acceso al canal VIP bloqueado.'};
  }catch(error){
   console.error('telegram rank0 action',entry.action,error.message);
   await db.execute(`UPDATE telegram_rank0_actions SET attempts=attempts+1,last_error=?
    WHERE user_id=? AND action=? AND telegram_user_id=?`,[String(error.message).slice(0,250),userId,entry.action,String(entry.telegram_user_id)]);
   return {account_linked:true,queued:true,
    ...(entry.action==='ban'?{vip_channel_blocked:false}:{vip_channel_unblocked:false}),
    warning:'Telegram no confirmó el cambio. Quedó pendiente y el bot volverá a intentarlo.'};
  }
 }
 async function synchronizeRank0Queue(){
  const [entries]=await db.query(`SELECT user_id FROM telegram_rank0_actions
    ORDER BY updated_at ASC,user_id ASC LIMIT 40`);
  let completed=0,pending=0;
  for(const {user_id} of entries){
   try{const result=await processRank0Action(user_id);
    if(result.queued)pending++;else completed++;
   }catch(error){pending++;console.error('telegram rank0 queue',error.message);}
  }
  return {processed:entries.length,completed,pending};
 }
 async function revokeUser(userId){
  await discardInvitation(userId);
  return queueRank0Action(userId,'ban');
 }
 async function restoreUser(userId){
  // Called only on an actual transition from Rank 0 to another role.
  // No free VIP is granted and the user is NOT automatically rejoined.
  return queueRank0Action(userId,'unban');
 }
 // Return only non-secret status to an authenticated customer.
 app.get('/api/customers/telegram',customerAuth,async(req,res)=>{
  try{
   const [[link]]=await db.execute('SELECT telegram_user_id,telegram_username,is_member,linked_at,link_status FROM telegram_links WHERE user_id=?',[req.customer.id]);
   const entitlement=await getVipEntitlement(db,req.customer.id);
   const vip=entitlement.hasVip;
   const [[change]]=await db.execute(`SELECT status,
     GREATEST(0,CEIL(TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),cooldown_until)/60)) AS cooldown_minutes,
     GREATEST(0,CEIL(TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),DATE_ADD(last_issue_at,INTERVAL 30 MINUTE))/60)) AS reissue_minutes,
     GREATEST(0,CEIL(TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),pending_expires_at)/60)) AS expires_minutes
     FROM telegram_change_state WHERE user_id=?`,[req.customer.id]);
   res.json({configured:telegramEnabled(),linked:Boolean(link)&&link.link_status==='active',detached_pending:link?.link_status==='detached',telegram_username:link?.link_status==='active'?link.telegram_username:null,
    telegram_user_id:link?.telegram_user_id?String(link.telegram_user_id):null,
    is_member:link?.link_status==='active'&&(!change||change.status!=='awaiting_new')?Boolean(link?.is_member):false,has_vip:vip,
    staff_vip:entitlement.staff,access_reason:entitlement.staff?'staff':entitlement.paid?'paid':null,
    change_pending:change?.status==='awaiting_new',change_cooldown_minutes:Number(change?.cooldown_minutes||0),
    change_reissue_minutes:Number(change?.reissue_minutes||0),change_expires_minutes:Number(change?.expires_minutes||0),
    public_channel_url:safeTelegramPublicUrl(process.env.TELEGRAM_FREE_CHANNEL_URL),
    public_group_url:safeTelegramPublicUrl(process.env.TELEGRAM_FREE_GROUP_URL)});
  }catch(error){console.error('telegram customer status',error.code||error.message);res.status(503).json({error:'No se pudo cargar Telegram'});}
 });
 app.post('/api/customers/telegram/link',limit,customerAuth,async(req,res)=>{
  if(!telegramEnabled())return res.status(503).json({error:'El dueño todavía no habilitó el bot y el canal VIP.'});
  try{
   const [[linked]]=await db.execute('SELECT telegram_user_id FROM telegram_links WHERE user_id=?',[req.customer.id]);
   if(linked)return res.status(409).json({error:'Ya tienes una cuenta Telegram vinculada o reservada. Si la desvinculaste, primero debe salir del canal VIP y debes comprobar la salida.'});
   const [[cooldown]]=await db.execute('SELECT GREATEST(0,TIMESTAMPDIFF(MINUTE,UTC_TIMESTAMP(),cooldown_until)) AS minutes FROM telegram_change_state WHERE user_id=?',[req.customer.id]);
   if(!canBeginNewTelegramLink(Boolean(linked),cooldown?.minutes))return res.status(429).json({error:`Por seguridad debes esperar ${Math.ceil(cooldown.minutes/1440)} día(s) antes de vincular otro Telegram, salvo excepción del dueño.`});
   const code=crypto.randomBytes(24).toString('hex');
   const username=await botUsername();
   await db.execute(`INSERT INTO telegram_link_tokens(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))
    ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)`,[req.customer.id,sha256(code)]);
   res.json({url:`https://t.me/${username}?start=${code}`,expires_in_minutes:10,message:'Abre Telegram y pulsa Iniciar. Luego vuelve a la web.'});
  }catch(error){console.error('telegram link',error.code||error.message);res.status(503).json({error:'No se pudo preparar la vinculación de Telegram'});}
 });
 // v2.0.1: self-service unlink, without expelling the Telegram subscriber.
 // A detached VIP seat cannot be reassigned while its previous Telegram is still inside.
 app.post('/api/customers/telegram/unlink',limit,customerAuth,async(req,res)=>{
  const password=req.body?.password;
  if(typeof password!=='string'||password.length<1||password.length>256||req.body?.confirm!==true)
   return res.status(400).json({error:'Confirma con tu contraseña que quieres desvincular sin expulsar.'});
  try{
   const [[u]]=await db.execute('SELECT password_hash FROM users WHERE id=?',[req.customer.id]);
   if(!u?.password_hash||!await bcrypt.compare(password,u.password_hash))return res.status(403).json({error:'Contraseña incorrecta.'});
   const result=await detachLink(req.customer.id);
   return res.status(result.status).json(result.status===200?{ok:true,message:result.message}:{error:result.error});
  }catch(error){console.error('telegram unlink',error.code||error.message);return res.status(503).json({error:'No se pudo desvincular Telegram.'});}
 });
 app.post('/api/customers/telegram/check-departure',limit,customerAuth,async(req,res)=>{
  try{const result=await checkDetachedAndRelease(req.customer.id);res.json({ok:true,...result,message:result.pending?'La cuenta anterior todavía está dentro del canal VIP. El creador puede retirarla manualmente, o puede salir voluntariamente.':result.released?'Se confirmó su salida. La plaza ya no está reservada; se aplicará el plazo de seguridad del cambio.':'No hay ninguna salida pendiente.'});}
  catch(error){console.error('telegram departure check',error.code||error.message);res.status(503).json({error:'Telegram no permitió comprobar la salida. Inténtalo de nuevo.'});}
 });
 // The older one-click 'change' route automatically banned the previous account.
 // v2.0.1 retires that route: unlinking must NEVER kick an existing member.
 app.post('/api/customers/telegram/change',limit,customerAuth,(req,res)=>
  res.status(410).json({error:'Para cambiar de Telegram usa «Desvincular sin expulsar». La cuenta anterior debe salir voluntariamente o el creador retirarla; no se expulsará a nadie desde este botón.'}));
 app.post('/api/customers/telegram/invite',limit,customerAuth,async(req,res)=>{
  if(!telegramEnabled())return res.status(503).json({error:'El canal VIP aún no está configurado.'});
  let conn;let createdLink=null;let committed=false;
  try{
   conn=await db.getConnection();await conn.beginTransaction();
   // Serialize invitations for this customer; repeated clicks invalidate the previous link.
   const [[link]]=await conn.execute('SELECT telegram_user_id,link_status FROM telegram_links WHERE user_id=? FOR UPDATE',[req.customer.id]);
   if(!link||link.link_status!=='active'){await conn.rollback();return res.status(409).json({error:'Vincula tu Telegram y confirma que no hay otra cuenta reservada.'});}
   const [[account]]=await conn.execute('SELECT account_status FROM users WHERE id=?',[req.customer.id]);
   if(account?.account_status!=='active'){await conn.rollback();return res.status(403).json({error:'Tu cuenta no está autorizada.'});}
   const [[change]]=await conn.execute("SELECT status FROM telegram_change_state WHERE user_id=?",[req.customer.id]);
   if(change?.status==='awaiting_new'){await conn.rollback();return res.status(409).json({error:'Tu cambio de Telegram está pendiente.'});}
   const [[vip]]=await conn.execute(VIP_SQL,[req.customer.id]);
   if(!vip?.vip){await conn.rollback();return res.status(403).json({error:'Necesitas una membresía VIP activa para entrar al canal.'});}
   const [[prior]]=await conn.execute('SELECT invite_link,expires_at<=UTC_TIMESTAMP() AS expired FROM telegram_vip_invites WHERE user_id=? FOR UPDATE',[req.customer.id]);
   // If Telegram cannot revoke an unexpired previous link, fail closed rather than
   // issuing multiple links. Legacy hash-only links cannot authorize access after replacement.
   if(prior?.invite_link){
    const revoked=await revokeInvitationLink(prior.invite_link);
    if(!revoked&&!prior.expired){await conn.rollback();return res.status(503).json({error:'No se pudo revocar la invitación anterior. Espera su vencimiento y vuelve a intentar.'});}
   }
   await api('unbanChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:String(link.telegram_user_id),only_if_banned:true});
   const expiration=Math.floor(Date.now()/1000)+15*60;
   const invite=await api('createChatInviteLink',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,name:`Fijas VIP u${req.customer.id}`.slice(0,32),expire_date:expiration,creates_join_request:true});
   createdLink=invite.invite_link;
   if(typeof createdLink!=='string'||!createdLink.startsWith('https://t.me/'))throw Error('Invitación inválida');
   await conn.execute(`INSERT INTO telegram_vip_invites(user_id,invite_hash,invite_link,expires_at)
    VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
    ON DUPLICATE KEY UPDATE invite_hash=VALUES(invite_hash),invite_link=VALUES(invite_link),expires_at=VALUES(expires_at)`,
    [req.customer.id,sha256(createdLink),createdLink]);
   await conn.commit();committed=true;
   res.json({url:createdLink,expires_in_minutes:15,message:'Enlace de un solo acceso, válido por 15 minutos. El bot verificará tu Telegram y VIP activo antes de aprobar.'});
  }catch(error){if(conn&&!committed)try{await conn.rollback();}catch{}
   if(createdLink&&!committed)await revokeInvitationLink(createdLink);
   console.error('telegram invite',error.code||error.message);res.status(503).json({error:'No se pudo generar la invitación. Comprueba los permisos del bot en el canal.'});}
  finally{conn?.release();}
 });
 // Telegram identifies the user who sends /start in a direct message. Never use a user-supplied Telegram ID.
 async function handleStopNotifications(message){
  if(message.chat?.type!=='private'||!safeTelegramId(message.from?.id))return false;
  if(!/^\/stop(?:@\w+)?\s*$/i.test(String(message.text||'')))return false;
  const [users]=await db.execute('SELECT user_id FROM telegram_links WHERE telegram_user_id=?',[String(message.from.id)]);
  if(users.length){
   await db.execute(`INSERT INTO telegram_notice_prefs(user_id,vip_enabled,expiry_enabled,picks_enabled)
    VALUES (?,0,0,0) ON DUPLICATE KEY UPDATE vip_enabled=0,expiry_enabled=0,picks_enabled=0`,[users[0].user_id]);
  }
  await api('sendMessage',{chat_id:String(message.from.id),text:'🔕 Avisos privados desactivados. Puedes volver a activarlos desde Fijas de Élite → Notificaciones.'});
  return true;
 }
 async function handleStart(message){
  if(message.chat?.type!=='private'||!safeTelegramId(message.from?.id))return;
  const code=telegramLinkStart(message.text);
  if(!code)return;
  const conn=await db.getConnection();let reply='No se pudo vincular la cuenta.';
  try{
   await conn.beginTransaction();
   const [[replacement]]=await conn.execute(`SELECT c.user_id,c.old_telegram_user_id,u.account_status FROM telegram_change_state c
    JOIN users u ON u.id=c.user_id WHERE c.pending_token_hash=? AND c.status='awaiting_new'
    AND c.pending_expires_at>UTC_TIMESTAMP() FOR UPDATE`,[sha256(code)]);
   if(replacement){
    // Never allow the old account to complete its own replacement.
    if(replacement.account_status!=='active'||String(message.from.id)===String(replacement.old_telegram_user_id)){
     await conn.rollback();reply='No puedes completar el cambio con el Telegram anterior. Usa otra cuenta o solicita ayuda al dueño.';
    }else{
     const [[existing]]=await conn.execute('SELECT user_id FROM telegram_links WHERE telegram_user_id=? FOR UPDATE',[String(message.from.id)]);
     const [[previous]]=await conn.execute('SELECT telegram_user_id,link_status FROM telegram_links WHERE user_id=? FOR UPDATE',[replacement.user_id]);
     if(existing||String(previous?.telegram_user_id)!==String(replacement.old_telegram_user_id)){
      await conn.rollback();reply='Este Telegram ya está vinculado a otra cuenta o el cambio fue modificado. Contacta a soporte.';
     }else{
      await conn.execute(`UPDATE telegram_links SET telegram_user_id=?,telegram_username=?,is_member=0,
       linked_at=UTC_TIMESTAMP(),last_verified_at=NULL WHERE user_id=? AND telegram_user_id=?`,
       [String(message.from.id),String(message.from.username||'').slice(0,100)||null,replacement.user_id,String(replacement.old_telegram_user_id)]);
      await conn.execute(`UPDATE telegram_change_state SET status='idle',pending_token_hash=NULL,pending_expires_at=NULL,
       last_changed_at=UTC_TIMESTAMP(),cooldown_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)
       WHERE user_id=?`,[replacement.user_id]);
      await conn.execute('DELETE FROM telegram_vip_invites WHERE user_id=?',[replacement.user_id]);
      await conn.execute(`INSERT INTO telegram_change_events(user_id,event_type,old_telegram_user_id,new_telegram_user_id,detail)
       VALUES(?,'completed',?,?,?)`,[replacement.user_id,String(replacement.old_telegram_user_id),String(message.from.id),'Cambio confirmado por Telegram; enfriamiento de 30 días']);
      await conn.commit();reply='✅ Telegram cambiado correctamente. El anterior ya no puede acceder al canal VIP. Vuelve a tu web y solicita el acceso desde esta nueva cuenta.';
     }
    }
   }else{
   const [[token]]=await conn.execute(`SELECT t.user_id,u.account_status FROM telegram_link_tokens t
    JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP() FOR UPDATE`,[sha256(code)]);
   if(!token||token.account_status!=='active'){await conn.rollback();reply='El enlace venció o no está disponible. Solicita otro desde tu panel.';}
   else{
    const [[linked]]=await conn.execute('SELECT user_id,telegram_user_id FROM telegram_links WHERE user_id=? OR telegram_user_id=? FOR UPDATE',[token.user_id,String(message.from.id)]);
    const [[preserved]]=await conn.execute('SELECT telegram_user_id FROM telegram_owner_preserved WHERE telegram_user_id=? FOR UPDATE',[String(message.from.id)]);
    const [[cooldown]]=await conn.execute('SELECT cooldown_until>UTC_TIMESTAMP() AS blocked FROM telegram_change_state WHERE user_id=?',[token.user_id]);
    if(linked||preserved||cooldown?.blocked){await conn.rollback();reply='Este Telegram ya está vinculado o reservado, o tu plazo de seguridad aún no termina. Contacta al dueño si necesitas una excepción.';}
    else{
     await conn.execute('INSERT INTO telegram_links(user_id,telegram_user_id,telegram_username,is_member) VALUES(?,?,?,0)',[token.user_id,String(message.from.id),String(message.from.username||'').slice(0,100)||null]);
     await conn.execute('DELETE FROM telegram_link_tokens WHERE user_id=?',[token.user_id]);
     await conn.commit();reply='✅ Telegram vinculado con Fijas de Élite. Vuelve a tu panel web para solicitar el acceso al canal VIP.';
    }
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
 async function admissionForRequest(request){
  const telegramId=String(request.from.id);
  const allowed=await allowedToJoin(telegramId);
  if(!allowed)return null;
  const [[already]]=await db.execute('SELECT is_member FROM telegram_links WHERE user_id=?',[allowed.user_id]);
  const [[invitation]]=await db.execute('SELECT invite_hash,invite_link,expires_at FROM telegram_vip_invites WHERE user_id=? AND expires_at>UTC_TIMESTAMP()',[allowed.user_id]);
  const valid=canApproveJoinRequest({
   requestedTelegramId:telegramId,linkedTelegramId:allowed.telegram_user_id,
   accountStatus:allowed.account_status,hasActiveVip:allowed.active_vip,
   alreadyMember:Boolean(already?.is_member),
   expectedInviteHash:invitation?.invite_hash,providedInviteLink:request.invite_link?.invite_link
  });
  return valid?{...allowed,inviteLink:invitation?.invite_link}:null;
 }
 async function handleJoinRequest(request){
  if(String(request.chat?.id)!==String(process.env.TELEGRAM_VIP_CHAT_ID)||!safeTelegramId(request.from?.id))return;
  const telegramId=String(request.from.id);
  let allowed=await admissionForRequest(request);
  if(!allowed){await api('declineChatJoinRequest',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId});return;}
  // Recheck immediately before approval; the invite may have been replaced meanwhile.
  allowed=await admissionForRequest(request);
  if(!allowed){await api('declineChatJoinRequest',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId});return;}
  await api('approveChatJoinRequest',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId});
  // A simultaneous Rank 0 or VIP removal must not leave the user in the channel.
  const stillAllowed=await allowedToJoin(telegramId);
  if(!stillAllowed){
   await api('banChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:telegramId,revoke_messages:false});return;
  }
  await db.execute('UPDATE telegram_links SET is_member=1,last_verified_at=UTC_TIMESTAMP() WHERE user_id=?',[stillAllowed.user_id]);
  await rememberMember(telegramId,'member');
  // Consumed links cannot be reused or forwarded to another Telegram.
  await discardInvitation(stillAllowed.user_id);
 }
 async function handleChatMember(update){
  if(String(update.chat?.id)!==String(process.env.TELEGRAM_VIP_CHAT_ID))return;
  const user=update.new_chat_member?.user;
  if(!safeTelegramId(user?.id)||user.is_bot)return;
  const status=update.new_chat_member.status;
  if(['administrator','creator'].includes(status)){
   await rememberMember(user.id,'member');return; // Telegram admins need separate manual review.
  }
  if(status==='member'){
   await rememberMember(user.id,'member');
   const [[detached]]=await db.execute(`SELECT t.link_status,u.account_status,${effectiveVipSql('u')} AS active_vip FROM telegram_links t
    JOIN users u ON u.id=t.user_id WHERE t.telegram_user_id=? LIMIT 1`,[String(user.id)]);
   if(shouldPreserveDetachedMember(detached?.link_status,detached?.account_status,detached?.active_vip))return; // No automatic kick on unlink.
   const [[ownerPreserved]]=await db.execute(`SELECT p.user_id,u.account_status,${effectiveVipSql('u')} AS active_vip
    FROM telegram_owner_preserved p JOIN users u ON u.id=p.user_id
    WHERE p.telegram_user_id=? LIMIT 1`,[String(user.id)]);
   if(shouldPreserveOwnerMember(ownerPreserved,ownerPreserved?.account_status,ownerPreserved?.active_vip))return;
   if(ownerPreserved)await db.execute('DELETE FROM telegram_owner_preserved WHERE telegram_user_id=?',[String(user.id)]);
   const allowed=await allowedToJoin(user.id);
   if(!allowed){
    const [[linked]]=await db.execute(`SELECT u.account_status FROM telegram_links t
      JOIN users u ON u.id=t.user_id WHERE t.telegram_user_id=? LIMIT 1`,[String(user.id)]);
    await api('banChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:String(user.id),revoke_messages:false});
    // Rank 0 stays banned; former free clients may rejoin after a new approved VIP invitation.
    if(linked?.account_status!=='blacklisted')await api('unbanChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:String(user.id),only_if_banned:true});
    await rememberMember(user.id,'left');
    await db.execute('UPDATE telegram_links SET is_member=0 WHERE telegram_user_id=?',[String(user.id)]);
    return;
   }
   await db.execute('UPDATE telegram_links SET is_member=1,last_verified_at=UTC_TIMESTAMP() WHERE user_id=?',[allowed.user_id]);
  }else if(['left','kicked'].includes(status)){
   await rememberMember(user.id,'left');
   await db.execute('UPDATE telegram_links SET is_member=0 WHERE telegram_user_id=?',[String(user.id)]);
   await db.execute("DELETE FROM telegram_links WHERE telegram_user_id=? AND link_status='detached'",[String(user.id)]);
   await db.execute('DELETE FROM telegram_owner_preserved WHERE telegram_user_id=?',[String(user.id)]);
  }
 }
 app.post(BOT_ENDPOINT,async(req,res)=>{
  if(!validWebhookSecret()||!telegramWebhookSecretValid(req.get('X-Telegram-Bot-Api-Secret-Token'),process.env.TELEGRAM_WEBHOOK_SECRET))
   return res.status(403).json({error:'Solicitud no autorizada'});
  const update=req.body;
  if(!update||typeof update!=='object'||!Number.isSafeInteger(update.update_id))return res.status(400).json({error:'Actualización inválida'});
  try{
   if(update.message && !await handleStopNotifications(update.message))await handleStart(update.message);
   if(update.chat_join_request)await handleJoinRequest(update.chat_join_request);
   if(update.chat_member)await handleChatMember(update.chat_member);
   res.json({ok:true});
  }catch(error){console.error('telegram webhook processing',error.code||error.message);res.status(503).json({error:'No se pudo procesar la actualización'});}
 });
 async function synchronizeExpired(){
  // Process durable Rank 0 bans/unbans before the normal known-member audit.
  const rank0=await synchronizeRank0Queue();
  if(!telegramEnabled())return {checked:0,kept:0,removed:0,failed:0,telegram_admins:0,expired_invites:0,tracked:0,rank0};
  // Invalidate expired, blocked, pending-change, or no-longer-entitled links.
  const [stale]=await db.query(`SELECT i.user_id FROM telegram_vip_invites i JOIN users u ON u.id=i.user_id
   WHERE i.expires_at<=UTC_TIMESTAMP() OR u.account_status='blacklisted' OR NOT ${effectiveVipSql('u')}
   OR EXISTS(SELECT 1 FROM telegram_change_state c WHERE c.user_id=i.user_id AND c.status='awaiting_new') LIMIT 100`);
  let expiredInvites=0;
  for(const invite of stale){try{await discardInvitation(invite.user_id);expiredInvites++;}catch(error){console.error('telegram invite cleanup',error.message);}}
  // The queue contains every identity observed through chat_member updates or linked
  // during earlier versions. It cannot enumerate subscribers who predate the bot.
  const [known]=await db.query(`SELECT telegram_user_id FROM telegram_channel_members WHERE state='member'
   ORDER BY COALESCE(last_checked_at,'1970-01-01') ASC, telegram_user_id ASC LIMIT 60`);
  const [legacy]=await db.query(`SELECT t.telegram_user_id FROM telegram_links t
    LEFT JOIN telegram_channel_members c ON c.telegram_user_id=t.telegram_user_id
    WHERE c.telegram_user_id IS NULL LIMIT 30`);
  const [ownerFormer]=await db.query(`SELECT p.telegram_user_id FROM telegram_owner_preserved p
    LEFT JOIN telegram_channel_members c ON c.telegram_user_id=p.telegram_user_id
    WHERE c.telegram_user_id IS NULL LIMIT 30`);
  const ids=[...new Set([...known,...legacy,...ownerFormer].map(u=>String(u.telegram_user_id)))];
  let checked=0,removed=0,kept=0,failed=0,telegramAdmins=0;
  for(const id of ids){
   try{
    const result=await evaluateMember(id);checked++;
    if(result==='removed')removed++;
    if(result==='kept')kept++;
    if(result==='telegram_admin')telegramAdmins++;
   }catch(error){failed++;console.error('telegram vip member audit',error.message);
    // Leave state='member' for retry; record unsuccessful check without exposing token.
    try{await db.execute('UPDATE telegram_channel_members SET last_checked_at=UTC_TIMESTAMP(),last_error=? WHERE telegram_user_id=?',[String(error.message).slice(0,250),id]);}catch{}
   }
  }
  const [[stats]]=await db.query("SELECT COUNT(*) AS tracked FROM telegram_channel_members WHERE state='member'");
  return {checked,kept,removed,failed,telegram_admins:telegramAdmins,expired_invites:expiredInvites,tracked:Number(stats.tracked||0),rank0,scope:'known_members_only'};
 }
 async function reconcileUser(userId){
  const [[link]]=await db.execute('SELECT telegram_user_id FROM telegram_links WHERE user_id=?',[userId]);
  if(!link||!telegramEnabled())return {checked:0};
  try{const result=await evaluateMember(link.telegram_user_id);return {checked:1,result};}
  catch(error){console.error('telegram role change reconciliation',error.message);return {checked:0,error:'La comprobación falló; el sincronizador reintentará.'};}
 }
 app.get('/api/admin/telegram',authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede configurar Telegram'});
  try{
   const [[stats]]=await db.query("SELECT COALESCE(SUM(link_status='active'),0) AS linked,COALESCE(SUM(is_member AND link_status='active'),0) AS members,COALESCE(SUM(link_status='detached'),0) AS detached_pending FROM telegram_links");
   const [[tracking]]=await db.query(`SELECT COUNT(*) AS total,COALESCE(SUM(state='member'),0) AS known_current FROM telegram_channel_members`);
   const [[exceptions]]=await db.query('SELECT COUNT(*) AS total FROM telegram_owner_preserved');
   let reportedChannelMembers=null;
   if(telegramEnabled())try{reportedChannelMembers=Number(await api('getChatMemberCount',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID}));}catch(error){console.error('Telegram channel count',error.message);}
   res.json({bot_configured:Boolean(process.env.TELEGRAM_BOT_TOKEN),vip_channel_configured:Boolean(process.env.TELEGRAM_VIP_CHAT_ID),free_channel_configured:Boolean(freeTelegramDestination(process.env)),free_group_configured:Boolean(process.env.TELEGRAM_FREE_CHAT_ID),webhook_secret_configured:validWebhookSecret(),public_base_url_configured:Boolean(process.env.PUBLIC_BASE_URL),linked:Number(stats.linked),vip_members:Number(stats.members),detached_pending:Number(stats.detached_pending),tracked_members:Number(tracking.known_current||0),tracked_total:Number(tracking.total||0),creator_preserved:Number(exceptions.total||0),telegram_member_count:reportedChannelMembers,full_scan_available:false});
  }catch(error){console.error('telegram admin',error.code||error.message);res.status(503).json({error:'No se pudo consultar Telegram'});}
 });
 // The original owner is created before customer registration and may lack a user row.
 // Opt-in: create a matching identity only for the authenticated owner so personal VIP/Telegram works.
 app.post('/api/admin/telegram/prepare-owner-profile',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo disponible para el dueño'});
  try{
   const [[owner]]=await db.execute("SELECT email,password_hash FROM admins WHERE id=? AND is_active=1 AND role='owner' LIMIT 1",[req.admin.id]);
   if(!owner)return res.status(403).json({error:'Cuenta de dueño no disponible'});
   const [r]=await db.execute(`INSERT IGNORE INTO users(email,display_name,password_hash)
     VALUES (?,'Dueño',?)`,[owner.email,owner.password_hash]);
   if(r.affectedRows){
    const [[profile]]=await db.execute('SELECT id FROM users WHERE email=?',[owner.email]);
    await db.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id)
      VALUES (?,'owner_telegram_profile_created','user',?)`,[req.admin.id,String(profile.id)]);
   }
   res.json({ok:true,message:'Tu identidad para Telegram VIP quedó preparada. Ahora vincula tu Telegram desde Mi Telegram VIP.'});
  }catch(error){console.error('telegram prepare owner profile',error.code||error.message);res.status(503).json({error:'No se pudo preparar el perfil del dueño.'});}
 });
 // Owner can detach another user's identity without touching the Telegram channel.
 app.post('/api/admin/telegram/unlink',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede desvincular otras cuentas.'});
  const userId=String(req.body?.user_id||''),reason=String(req.body?.reason||'').trim();
  if(!/^[1-9]\d{0,18}$/.test(userId)||reason.length<8||reason.length>250)
   return res.status(400).json({error:'Indica un ID de cliente y motivo de 8 a 250 caracteres.'});
  try{
   const result=await detachLink(userId,{actor:'owner',adminId:req.admin.id,reason});
   return res.status(result.status).json(result.status===200?{ok:true,message:result.message}:{error:result.error});
  }catch(error){console.error('telegram owner unlink',error.code||error.message);res.status(503).json({error:'No se pudo desvincular la cuenta.'});}
 });
 // Creator-only override: unlink an identity and IMMEDIATELY allow a replacement,
 // WITHOUT kicking/unbanning the previous Telegram member. A single preserved former
 // member is allowed per customer, and still requires an active VIP entitlement.
 app.post('/api/admin/telegram/force-unlink',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el creador puede forzar la desvinculación.'});
  const userId=String(req.body?.user_id||'');
  const reason=String(req.body?.reason||'').trim();
  const password=req.body?.password;
  if(!/^[1-9]\d{0,18}$/.test(userId)||reason.length<12||reason.length>250||
    typeof password!=='string'||password.length<1||password.length>256||
    req.body?.confirm_keep_old!==true)
   return res.status(400).json({error:'Indica ID, motivo (12-250 caracteres), tu contraseña y confirma la excepción.'});
  let conn;
  try{
   const [[owner]]=await db.execute("SELECT password_hash FROM admins WHERE id=? AND role='owner' AND is_active=1",[req.admin.id]);
   if(!owner?.password_hash||!await bcrypt.compare(password,owner.password_hash))
    return res.status(403).json({error:'Contraseña del creador incorrecta.'});
   conn=await db.getConnection();await conn.beginTransaction();
   const [[account]]=await conn.execute('SELECT account_status FROM users WHERE id=? FOR UPDATE',[userId]);
   const [[link]]=await conn.execute('SELECT telegram_user_id,link_status FROM telegram_links WHERE user_id=? FOR UPDATE',[userId]);
   const [[preserved]]=await conn.execute('SELECT telegram_user_id FROM telegram_owner_preserved WHERE user_id=? FOR UPDATE',[userId]);
   if(!ownerForceCanProceed({isOwner:true,hasLinkedTelegram:Boolean(link),alreadyPreserved:Boolean(preserved),accountStatus:account?.account_status})){
    await conn.rollback();return res.status(409).json({error:preserved?
      'Este cliente ya conserva un Telegram anterior. El creador debe retirarlo del canal o comprobar que salió antes de hacer otro cambio.':
      'La cuenta debe estar activa y tener un Telegram vinculado o reservado.'});
   }
   const [[change]]=await conn.execute('SELECT status FROM telegram_change_state WHERE user_id=? FOR UPDATE',[userId]);
   if(change?.status==='awaiting_new'){
    await conn.rollback();return res.status(409).json({error:'Hay un reemplazo de Telegram en curso. Debe terminar o vencer antes de forzar otra desvinculación.'});
   }
   const [[oldInvite]]=await conn.execute('SELECT invite_link FROM telegram_vip_invites WHERE user_id=? FOR UPDATE',[userId]);
   // This row grants no new invitation. It only prevents the known-member audit
   // from kicking the previous account for being unlinked while VIP remains active.
   await conn.execute(`INSERT INTO telegram_owner_preserved(telegram_user_id,user_id,actor_admin_id,reason)
    VALUES(?,?,?,?)`,[String(link.telegram_user_id),userId,req.admin.id,reason]);
   await conn.execute('DELETE FROM telegram_links WHERE user_id=?',[userId]);
   await conn.execute('DELETE FROM telegram_link_tokens WHERE user_id=?',[userId]);
   await conn.execute('DELETE FROM telegram_vip_invites WHERE user_id=?',[userId]);
   await conn.execute(`INSERT INTO telegram_change_state(user_id,status,cooldown_until)
     VALUES (?,'idle',NULL)
     ON DUPLICATE KEY UPDATE status='idle',old_telegram_user_id=NULL,pending_token_hash=NULL,
      pending_expires_at=NULL,cooldown_until=NULL`,[userId]);
   await conn.execute('UPDATE telegram_notice_prefs SET vip_enabled=0,expiry_enabled=0,picks_enabled=0 WHERE user_id=?',[userId]);
   await conn.execute(`INSERT INTO telegram_unlink_events(user_id,telegram_user_id,performed_by,actor_admin_id,reason)
     VALUES (? ,?,'owner',?,?)`,[userId,String(link.telegram_user_id),req.admin.id,reason]);
   await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
     VALUES (?,'telegram_owner_force_unlink_keep_member','user',?,?)`,
     [req.admin.id,userId,JSON.stringify({previous_telegram_user_id:String(link.telegram_user_id),reason,allowed_to_relink:true,old_member_not_expulsed:true})]);
   // Prevent the synchronizer from treating the former member as an unknown ID.
   await conn.execute(`INSERT INTO telegram_channel_members(telegram_user_id,state,last_seen_at)
     VALUES(?,'member',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE state='member'`,[String(link.telegram_user_id)]);
   await conn.commit();
   // Only revoke unused invitation. NEVER call banChatMember/unbanChatMember.
   if(oldInvite?.invite_link)await revokeInvitationLink(oldInvite.invite_link);
   return res.json({ok:true,message:'Desvinculación forzada completada. El Telegram anterior NO fue expulsado y el cliente ya puede vincular otro. Mientras el VIP esté activo, el canal conservará al anterior; solo el creador puede retirar manualmente ese acceso. Máximo un anterior conservado por cliente.'});
  }catch(error){if(conn)try{await conn.rollback();}catch{}
   console.error('telegram creator force unlink',error.code||error.message);
   res.status(503).json({error:'No se pudo completar la desvinculación forzada.'});
  }finally{conn?.release();}
 });
 // Creator can release a preserved slot only after Telegram confirms the old ID left.
 app.post('/api/admin/telegram/check-preserved',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el creador puede comprobar plazas conservadas.'});
  const userId=String(req.body?.user_id||'');
  if(!/^[1-9]\d{0,18}$/.test(userId))return res.status(400).json({error:'ID de cliente inválido.'});
  if(!telegramEnabled())return res.status(503).json({error:'Telegram no está configurado.'});
  try{
   const [[preserved]]=await db.execute('SELECT telegram_user_id FROM telegram_owner_preserved WHERE user_id=?',[userId]);
   if(!preserved)return res.json({ok:true,released:true,message:'Este cliente no tiene ninguna cuenta anterior conservada.'});
   const oldId=String(preserved.telegram_user_id);
   const member=await api('getChatMember',{chat_id:process.env.TELEGRAM_VIP_CHAT_ID,user_id:oldId});
   const gone=['left','kicked'].includes(member.status)||(member.status==='restricted'&&member.is_member===false);
   if(!gone)return res.json({ok:true,released:false,message:'El Telegram anterior todavía pertenece al canal VIP. El creador debe retirarlo manualmente si desea liberar la excepción.'});
   await db.execute('DELETE FROM telegram_owner_preserved WHERE user_id=? AND telegram_user_id=?',[userId,oldId]);
   await markChecked(oldId,'left');
   return res.json({ok:true,released:true,message:'Telegram confirmó que el anterior salió. La plaza excepcional quedó liberada.'});
  }catch(error){console.error('telegram creator preserved check',error.code||error.message);
   return res.status(503).json({error:'No se pudo comprobar la salida mediante Telegram.'});}
 });
 app.post('/api/admin/telegram/change-exception',limit,authenticate,async(req,res)=>{
  if(req.admin.role!=='owner')return res.status(403).json({error:'Solo el dueño puede autorizar una excepción'});
  const userId=String(req.body?.user_id||'');const reason=String(req.body?.reason||'').trim();
  if(!/^[1-9]\d{0,18}$/.test(userId)||reason.length<12||reason.length>250)
   return res.status(400).json({error:'Indica un ID de cliente válido y un motivo de 12 a 250 caracteres.'});
  let conn;
  try{
   conn=await db.getConnection();await conn.beginTransaction();
   const [[linked]]=await conn.execute('SELECT user_id FROM telegram_links WHERE user_id=? FOR UPDATE',[userId]);
   const [[state]]=await conn.execute('SELECT status FROM telegram_change_state WHERE user_id=? FOR UPDATE',[userId]);
   if(state?.status==='awaiting_new'||(!linked&&!state)){
    await conn.rollback();return res.status(409).json({error:state?.status==='awaiting_new'?'El cliente tiene un cambio pendiente.':'El cliente todavía no tiene una vinculación ni un plazo de seguridad que exceptuar.'});
   }
   await conn.execute(`INSERT INTO telegram_change_state(user_id,status,cooldown_until)
    VALUES (?,'idle',NULL) ON DUPLICATE KEY UPDATE cooldown_until=NULL`,[userId]);
   await conn.execute(`INSERT INTO telegram_change_events(user_id,event_type,actor_admin_id,detail)
    VALUES(?,'owner_exception',?,?)`,[userId,req.admin.id,reason]);
   await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
    VALUES(?,'telegram_change_exception','user',?,?)`,[req.admin.id,userId,JSON.stringify({reason})]);
   await conn.commit();res.json({ok:true,message:linked?'Excepción autorizada. El cliente puede solicitar el cambio y confirmar su contraseña.':'Excepción autorizada. Cuando el Telegram anterior haya salido del canal, el cliente podrá vincular otra cuenta.'});
  }catch(error){if(conn)try{await conn.rollback();}catch{}console.error('telegram owner exception',error.code||error.message);res.status(503).json({error:'No se pudo registrar la excepción'});}
  finally{conn?.release();}
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
 return {synchronizeExpired,revokeUser,restoreUser,reconcileUser};
}
