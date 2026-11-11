import crypto from 'node:crypto';
import {telegramApi,h} from './telegram-bridge.js';
import {effectiveGoldSql} from './vip-access.js';

// GOLD has no group or channel destination: the full pick is delivered only
// to private Telegram chats linked by /start to an active GOLD or VIP account.
export function goldPrivateMessage(p){
 const text=String(p.match_date||'');
 const date=p.match_date instanceof Date?p.match_date:p.match_date?new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(text)?text.replace(' ','T'):text.replace(' ','T')+'Z'):null;
 const when=date && Number.isFinite(date.getTime())?
  '\n🗓 '+new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}).format(date):'';
 return `💎 <b>FIJAS DE ÉLITE · GOLD</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league||'Fútbol')}${when}\n🎯 <b>${h(p.market||'Selección')}:</b> ${h(p.selection||'')}\n\n<b>Análisis y riesgos:</b>\n${h(String(p.analysis||'').slice(0,2200))}\n\n<i>Estimación estadística, sin garantías de acierto o ganancias.</i>`;
}
export function goldMayReceive({active,linked,entitled,pendingChange,telegramId,archived}){
 return Boolean(active && linked && entitled && !pendingChange && !archived && /^\d{1,16}$/.test(String(telegramId||'')));
}

/** Durable, idempotent fan-out at publication: no user who pays later receives
 * old GOLD selections and no one without a confirmed active plan is queued.
 * This function deliberately NEVER posts full GOLD picks to a public chat.
 */
export async function queueGoldPrediction(db,predictionId){
 if(!db||!/^\d{1,18}$/.test(String(predictionId)))throw Error('Pronóstico GOLD inválido');
 const [saved]=await db.execute(`INSERT IGNORE INTO telegram_gold_deliveries(prediction_id,user_id,telegram_user_id)
  SELECT p.id,u.id,t.telegram_user_id FROM predictions p
  JOIN users u ON u.account_status='active'
  JOIN telegram_links t ON t.user_id=u.id AND t.link_status='active'
  WHERE p.id=? AND p.visibility='gold' AND p.published_at IS NOT NULL AND p.archived_at IS NULL
   AND ${effectiveGoldSql('u')}
   AND NOT EXISTS(SELECT 1 FROM telegram_change_state c WHERE c.user_id=u.id AND c.status='awaiting_new')`,[predictionId]);
 return {state:'pending',queued:Number(saved.affectedRows||0)};
}

/** No automatic retry after an ambiguous Telegram failure. Telegram sendMessage
 * has no idempotency key: marking failed or interrupted sends for owner review
 * avoids sending duplicates to paying subscribers after a Railway restart.
 * A member's entitlement and Telegram link are rechecked immediately before DM.
 */
export function installGoldDeliveryWorker({db,env=process.env,api=telegramApi}={}){
 let running=false,interval=null;
 async function tick(){
  if(running||!env.TELEGRAM_BOT_TOKEN)return {skipped:true};
  running=true;
  const lease=crypto.randomUUID();let checked=0,sent=0,failed=0,skipped=0;
  try{
   // Exclusive MySQL lock across Railway replicas. An interrupted "sending"
   // stays unconfirmed for owner review; it is never silently retried.
   const lock=await db.getConnection();let locked=false;
   try{
    const [[l]]=await lock.query("SELECT GET_LOCK('fijas_gold_delivery_worker',0) AS acquired");
    if(Number(l?.acquired)!==1)return {busy:true};
    locked=true;
    await db.execute("UPDATE telegram_gold_deliveries SET status='sending',lease_id=? WHERE status='pending' ORDER BY id LIMIT 5",[lease]);
    const [rows]=await db.execute(`SELECT d.id,d.user_id,d.prediction_id,d.telegram_user_id,
      p.title,p.league,p.match_date,p.market,p.selection,p.analysis,p.archived_at
      FROM telegram_gold_deliveries d JOIN predictions p ON p.id=d.prediction_id
      WHERE d.status='sending' AND d.lease_id=? ORDER BY d.id ASC LIMIT 5`,[lease]);
    for(const n of rows){
     checked++;
     try{
      const [[a]]=await db.execute(`SELECT u.account_status,t.telegram_user_id,t.link_status,
        EXISTS(SELECT 1 FROM telegram_change_state c WHERE c.user_id=u.id AND c.status='awaiting_new') AS pending_change,
        ${effectiveGoldSql('u')} AS entitled
       FROM users u LEFT JOIN telegram_links t ON t.user_id=u.id WHERE u.id=?`,[n.user_id]);
      const ok=goldMayReceive({active:a?.account_status==='active',linked:a?.link_status==='active'&&String(a.telegram_user_id)===String(n.telegram_user_id),entitled:a?.entitled,pendingChange:a?.pending_change,telegramId:n.telegram_user_id,archived:n.archived_at});
      if(!ok){await db.execute("UPDATE telegram_gold_deliveries SET status='skipped',lease_id=NULL,last_error='Sin acceso GOLD o Telegram desvinculado' WHERE id=? AND status='sending'",[n.id]);skipped++;continue;}
      const output=goldPrivateMessage(n);
      await api('sendMessage',{chat_id:String(n.telegram_user_id),text:output,parse_mode:'HTML',disable_web_page_preview:true,protect_content:true},env);
      await db.execute("UPDATE telegram_gold_deliveries SET status='sent',lease_id=NULL,sent_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=? AND status='sending'",[n.id]);sent++;
     }catch(e){
      await db.execute("UPDATE telegram_gold_deliveries SET status='failed',lease_id=NULL,last_error=? WHERE id=? AND status='sending'",[String(e?.message||'Telegram error').slice(0,240),n.id]);failed++;
     }
     // Aggregate Telegram state stays observable on the admin panel.
     await db.execute(`UPDATE predictions p SET telegram_status=CASE
       WHEN EXISTS(SELECT 1 FROM telegram_gold_deliveries d WHERE d.prediction_id=p.id AND d.status='sent') THEN 'sent'
       WHEN EXISTS(SELECT 1 FROM telegram_gold_deliveries d WHERE d.prediction_id=p.id AND d.status='failed') THEN 'failed'
       ELSE p.telegram_status END WHERE p.id=? AND p.visibility='gold'`,[n.prediction_id]);
    }
    return {checked,sent,failed,skipped};
   }finally{if(locked)await lock.query("SELECT RELEASE_LOCK('fijas_gold_delivery_worker')").catch(()=>{});lock.release();}
  }finally{running=false;}
 }
 function start(){if(interval)return;interval=setInterval(()=>tick().catch(e=>console.error('gold delivery worker',e.code||e.message)),12000);interval.unref?.();}
 function stop(){if(interval)clearInterval(interval);interval=null;}
 return {tick,start,stop};
}
