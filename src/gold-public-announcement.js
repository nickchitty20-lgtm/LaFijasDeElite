import {telegramApi,inspectFreeTelegramChannel,telegramHomeUrl} from './telegram-bridge.js';
import {queueGoldPrediction} from './gold-telegram.js';

/** Public GOLD advertisement: intentionally NEVER includes prediction data.
 * Even a user-authored title may contain the private selection, so only a
 * fixed message is published. All content is constant except public base URL.
 */
export function goldOfficialAnnouncement(baseUrl){
 const landing=telegramHomeUrl(baseUrl);
 return `💎 <b>FIJAS DE ÉLITE · GOLD</b>

⚽ ¡Nuevo pronóstico GOLD publicado!
🔒 Disponible para miembros GOLD y VIP.

🌐 Suscríbete y consulta tu acceso: ${landing}

<i>Información deportiva. Ningún pronóstico garantiza resultados.</i>`;
}

/** One announcement per *published* GOLD prediction, official channel only.
 * Reserve in MySQL BEFORE sending to avoid duplicate announcements after a
 * server restart or concurrent publish. Failure is left for manual review;
 * Telegram does not provide idempotency keys for sendMessage.
 */
export async function announceGoldOfficial(p,env=process.env,db,{api=telegramApi,verify=inspectFreeTelegramChannel}={}){
 if(!db||!env.TELEGRAM_BOT_TOKEN||p?.visibility!=='gold'||!/^[1-9]\d{0,17}$/.test(String(p?.id??'')))
  return {state:'not_configured'};
 const channel=await verify(env,{checkPermissions:true});
 if(!channel?.ready)return {state:'not_configured',reason:channel?.reason||'Canal oficial no disponible'};
 if(String(channel.chat_id)===String(env.TELEGRAM_VIP_CHAT_ID||''))
  return {state:'not_configured',reason:'El canal oficial coincide con el canal VIP'};
 const [claim]=await db.execute(`INSERT IGNORE INTO telegram_gold_public_announcements (prediction_id,chat_id,state)
  SELECT id,?,'reserved' FROM predictions
  WHERE id=? AND visibility='gold' AND published_at IS NOT NULL AND archived_at IS NULL`,[channel.chat_id,p.id]);
 if(Number(claim.affectedRows)!==1)return {state:'already_announced'};
 try{
  const sent=await api('sendMessage',{chat_id:channel.chat_id,
   text:goldOfficialAnnouncement(env.PUBLIC_BASE_URL),parse_mode:'HTML',disable_web_page_preview:true},env);
  await db.execute(`UPDATE telegram_gold_public_announcements SET state='sent',message_id=?,sent_at=UTC_TIMESTAMP()
   WHERE prediction_id=? AND state='reserved'`,[sent?.message_id||null,p.id]);
  return {state:'sent'};
 }catch(error){
  await db.execute("UPDATE telegram_gold_public_announcements SET state='failed' WHERE prediction_id=? AND state='reserved'",[p.id]).catch(()=>{});
  console.error('Aviso GOLD al canal oficial:',String(error?.message||error).slice(0,180));
  return {state:'failed'};
 }
}

/** The GOLD DM delivery remains independent from the public advertisement.
 * A failure to announce never cancels the private delivery queue.
 */
export async function publishGoldTelegram(p,env=process.env,{db}={}){
 const queue=await queueGoldPrediction(db,p.id);
 let announcement={state:'not_configured'};
 try{announcement=await announceGoldOfficial(p,env,db);}
 catch(error){
  console.error('Aviso GOLD no disponible:',String(error?.message||error).slice(0,180));
  announcement={state:'failed'};
 }
 return {...queue,announcement:announcement.state};
}
