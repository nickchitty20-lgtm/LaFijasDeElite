import crypto from 'node:crypto';
import {z} from 'zod';
import {telegramApi} from './telegram-bridge.js';
import {effectiveVipSql} from './vip-access.js';

// Explicit opt-in: every preference is false until the customer enables it.
export const notificationSettingsSchema=z.object({vip_enabled:z.boolean(),expiry_enabled:z.boolean(),picks_enabled:z.boolean()}).strict();
import {noticeKindColumn,formatPredictionNotice,noticeShouldSend} from './notification-policy.js';
const baseUrl=()=>{
 try{const url=new URL(process.env.PUBLIC_BASE_URL||'https://lafijasdeelite-production.up.railway.app');return url.protocol==='https:'?url.origin+'/clientes.html':'https://lafijasdeelite-production.up.railway.app/clientes.html';}
 catch{return 'https://lafijasdeelite-production.up.railway.app/clientes.html';}
};
const botEnabled=()=>Boolean(process.env.TELEGRAM_BOT_TOKEN);

// Queued within the same transaction as the VIP grant, so a process restart
// cannot lose a committed activation. No paid record is forged for staff.
export async function enqueueVipActivation(conn,userId,membershipId){
 await conn.execute(`INSERT IGNORE INTO telegram_notice_outbox(user_id,kind,reference_key,message)
  SELECT p.user_id,'vip_activated',?,? FROM telegram_notice_prefs p
  JOIN users u ON u.id=p.user_id JOIN telegram_links t ON t.user_id=p.user_id AND t.link_status='active'
  WHERE p.user_id=? AND p.vip_enabled=1 AND u.account_status='active'`,
  [`membership:${membershipId}`,`♛ Tu membresía VIP fue activada o renovada. Consulta su fecha de vencimiento en ${baseUrl()}`,userId]);
}
export async function enqueuePredictionEvent(db,predictionId,visibility){
 await db.execute(`INSERT IGNORE INTO telegram_notice_events(prediction_id,visibility) VALUES (?,?)`,[predictionId,visibility]);
}
export function installNotificationCenter(app,{db,customerAuth,limit}){
 app.get('/api/customers/notifications/preferences',customerAuth,async(req,res)=>{
  try{
   const [[p]]=await db.execute('SELECT vip_enabled,expiry_enabled,picks_enabled FROM telegram_notice_prefs WHERE user_id=?',[req.customer.id]);
   const [[link]]=await db.execute("SELECT telegram_user_id FROM telegram_links WHERE user_id=? AND link_status='active'",[req.customer.id]);
   res.json({linked:Boolean(link),vip_enabled:Boolean(p?.vip_enabled),expiry_enabled:Boolean(p?.expiry_enabled),picks_enabled:Boolean(p?.picks_enabled)});
  }catch(error){console.error('notice preferences',error.code||error.message);res.status(503).json({error:'No se pudieron consultar tus avisos.'});}
 });
 app.post('/api/customers/notifications/preferences',limit,customerAuth,async(req,res)=>{
  const p=notificationSettingsSchema.safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'Preferencias no válidas.'});
  try{
   const [[link]]=await db.execute("SELECT telegram_user_id FROM telegram_links WHERE user_id=? AND link_status='active'",[req.customer.id]);
   if(!link && Object.values(p.data).some(Boolean))return res.status(409).json({error:'Primero debes vincular tu Telegram desde Telegram VIP.'});
   await db.execute(`INSERT INTO telegram_notice_prefs(user_id,vip_enabled,expiry_enabled,picks_enabled)
    VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE vip_enabled=VALUES(vip_enabled),expiry_enabled=VALUES(expiry_enabled),picks_enabled=VALUES(picks_enabled)`,
    [req.customer.id,p.data.vip_enabled,p.data.expiry_enabled,p.data.picks_enabled]);
   // Queued messages disabled after opt-out: the dispatcher also rechecks the flag.
   res.json({ok:true,...p.data});
  }catch(error){console.error('notice preferences save',error.code||error.message);res.status(503).json({error:'No se pudieron guardar tus preferencias.'});}
 });

 // A durable event fan-out means restarts do not lose customer recipients.
 // Each iteration covers at most 200 users and advances its cursor persistently.
 async function processPredictionEvents(){
  const [events]=await db.query("SELECT id,prediction_id,visibility,last_user_id FROM telegram_notice_events WHERE status='pending' ORDER BY id LIMIT 4");
  for(const e of events){
   const vipCond=e.visibility==='vip'?`AND ${effectiveVipSql('u')}`:'';
   const [users]=await db.execute(`SELECT p.user_id FROM telegram_notice_prefs p
    JOIN users u ON u.id=p.user_id JOIN telegram_links t ON t.user_id=p.user_id AND t.link_status='active'
    WHERE p.picks_enabled=1 AND u.account_status='active' AND p.user_id>? ${vipCond}
    ORDER BY p.user_id ASC LIMIT 200`,[e.last_user_id]);
   const msg=formatPredictionNotice(e.visibility,baseUrl());
   for(const u of users){
    await db.execute(`INSERT IGNORE INTO telegram_notice_outbox(user_id,kind,reference_key,message,requires_vip)
     VALUES (?,'new_prediction',?,?,?)`,[u.user_id,`prediction:${e.prediction_id}`,msg,e.visibility==='vip'?1:0]);
   }
   if(users.length){await db.execute('UPDATE telegram_notice_events SET last_user_id=? WHERE id=?',[users[users.length-1].user_id,e.id]);}
   if(users.length<200)await db.execute("UPDATE telegram_notice_events SET status='done' WHERE id=?",[e.id]);
  }
 }
 async function queueExpiryWarnings(){
  const [rows]=await db.query(`SELECT m.user_id,DATE_FORMAT(MAX(m.ends_at),'%Y-%m-%d') AS last_date,
   DATEDIFF(DATE(MAX(m.ends_at)),UTC_DATE()) AS days_left
   FROM memberships m JOIN telegram_notice_prefs p ON p.user_id=m.user_id
   JOIN users u ON u.id=m.user_id JOIN telegram_links t ON t.user_id=m.user_id AND t.link_status='active'
   WHERE m.status='active' AND m.archived_at IS NULL AND m.ends_at>UTC_TIMESTAMP()
    AND p.expiry_enabled=1 AND u.account_status='active'
    AND NOT EXISTS (SELECT 1 FROM admins a WHERE a.email=u.email AND a.is_active=1)
   GROUP BY m.user_id HAVING days_left IN (1,3) LIMIT 2000`);
  for(const r of rows){
   const days=Number(r.days_left);
   await db.execute(`INSERT IGNORE INTO telegram_notice_outbox(user_id,kind,reference_key,message)
    VALUES (?,'vip_expiring',?,?)`,[r.user_id,`expiry:${r.last_date}:${days}`,`⏳ Tu VIP vence en ${days} día(s), el ${r.last_date}. Puedes renovarlo desde ${baseUrl()}`]);
  }
 }
 async function processOutbox(){
  if(!botEnabled())return;
  const lease=crypto.randomUUID();
  // Claim a small bounded batch atomically to avoid concurrent worker duplicates.
  await db.execute(`UPDATE telegram_notice_outbox SET status='sending',lease_id=?,leased_at=UTC_TIMESTAMP(),attempts=attempts+1
   WHERE (status IN ('pending','failed') AND (retry_after IS NULL OR retry_after<=UTC_TIMESTAMP()))
    OR (status='sending' AND leased_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE))
   ORDER BY id ASC LIMIT 12`,[lease]);
  const [items]=await db.execute("SELECT id,user_id,kind,message,attempts,requires_vip FROM telegram_notice_outbox WHERE lease_id=? AND status='sending' ORDER BY id",[lease]);
  for(const n of items){
   try{
    const col=noticeKindColumn[n.kind];
    const [[target]]=await db.execute(`SELECT u.account_status,t.telegram_user_id,t.link_status,p.${col} AS opted_in,
     EXISTS(SELECT 1 FROM telegram_change_state c WHERE c.user_id=u.id AND c.status='awaiting_new') AS pending_change,
     ${effectiveVipSql('u')} AS has_vip
     FROM users u LEFT JOIN telegram_links t ON t.user_id=u.id
     LEFT JOIN telegram_notice_prefs p ON p.user_id=u.id WHERE u.id=?`,[n.user_id]);
    const eligible=(n.kind==='vip_activated'||n.kind==='vip_expiring'||Boolean(n.requires_vip))?Boolean(target?.has_vip):true;
    if(!noticeShouldSend({active:target?.account_status==='active',linked:Boolean(target?.telegram_user_id)&&target?.link_status==='active',pendingChange:target?.pending_change,optedIn:target?.opted_in,eligible})){
     await db.execute("UPDATE telegram_notice_outbox SET status='disabled',lease_id=NULL WHERE id=? AND lease_id=?",[n.id,lease]);continue;
    }
    await telegramApi('sendMessage',{chat_id:String(target.telegram_user_id),text:n.message,disable_web_page_preview:true});
    await db.execute("UPDATE telegram_notice_outbox SET status='sent',sent_at=UTC_TIMESTAMP(),lease_id=NULL,last_error=NULL WHERE id=? AND lease_id=?",[n.id,lease]);
   }catch(error){
    const msg=String(error.message||error).slice(0,250);
    const permanent=/blocked by the user|chat not found|user is deactivated|bot was blocked/i.test(msg)||Number(n.attempts)>=4;
    await db.execute(`UPDATE telegram_notice_outbox SET status=?,retry_after=IF(?='failed',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),NULL),
     last_error=?,lease_id=NULL WHERE id=? AND lease_id=?`,[permanent?'disabled':'failed',permanent?'disabled':'failed',msg,n.id,lease]);
    console.error('telegram private notification failed',n.id,msg);
   }
  }
 }
 let running=false;
 async function tick(){
  if(running)return {busy:true};running=true;
  try{await processPredictionEvents();await queueExpiryWarnings();await processOutbox();return {ok:true};}
  finally{running=false;}
 }
 // Limited worker: prevent flood and prevent unfinished startup from blocking server listen.
 const worker=setInterval(()=>tick().catch(e=>console.error('telegram notification worker',e.code||e.message)),60000);
 worker.unref?.();
 return {tick};
}
