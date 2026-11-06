import crypto from 'node:crypto';
import {telegramMatchSchedule} from './match-schedule.js';
import {recordPredictionTelegramMessage} from './prediction-removal.js';

// Never put TELEGRAM_BOT_TOKEN or webhook secrets into browser responses/logs.
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const safeTelegramId = value => /^\d{1,16}$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const isMemberStatus = status => ['member','administrator','creator'].includes(status);
export const isPublicTelegramContentSafe = message => !/[\n]🎯|[\n]📊 Cuota:|[\n]Análisis:/.test(message);
export const h = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function telegramPublicNotice(p,base){
 const label=p.visibility==='vip'?'🔒 NUEVO VIP':'⚽ NUEVO PRONÓSTICO GRATIS';
 const location=`${base.replace(/\/$/,'')}/clientes.html`;
 return `${label}\n🏆 Liga: ${h(p.league)}${h(telegramMatchSchedule(p.match_date))}\n\n🔐 Consulta los detalles iniciando sesión en Fijas de Élite.\n${h(location)}\n\nLos pronósticos no garantizan resultados.`;
}
export function telegramFreeAutoPost(p){
 const n=Number(p.estimated_probability);
 const verified=p.estimated_probability!=null && Number.isFinite(n)&&n>=0&&n<=100;
 const confidence=verified?`\n📈 Estimación del proveedor: ${n.toFixed(1)}% (NO es porcentaje de aciertos real).`:'';
 return `⚽ <b>FIJAS DE ÉLITE · COMUNIDAD · GRATIS</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league)}${h(telegramMatchSchedule(p.match_date))}\n🎯 ${h(p.market)}: <b>${h(p.selection)}</b>${confidence}\n⚠️ <b>RIESGO ALTO · NO ES UNA FIJA SEGURA</b>\n\n${h(String(p.analysis||'').slice(0,1400))}\n\nEstimación estadística no calibrada, no garantía de acierto. No apuestes dinero que no puedas perder.`;
}
export function telegramGoalsSummary(p){
 const f=p?.football_details;
 if(!f)return '';
 const line=(label,v)=>`\n• ${label}: ${h(v||'sin estimación')}`;
 const hist=f.historical;
 const msg='\n\n<b>⚽ MERCADOS DE GOLES (estimaciones)</b>'+line('Total',f.total_line?.market_label)+line('Local',f.home_line?.market_label)+line('Visitante',f.away_line?.market_label)+
  line('Ambos anotan',hist?`${hist.both_scored}/${hist.games} antecedentes`:'Sin datos suficientes')+
  line('Marcador orientativo',f.estimated_score)+
  line('Diferencia de goles',f.estimated_margin!=null?`${f.estimated_margin} gol(es)`:null);
 return msg+'\n<i>Estimaciones, no apuestas garantizadas ni cuotas verificadas para goles.</i>';
}
export function telegramAdvancedSummary(p){
 const a=p?.football_details?.advanced;if(!a)return '';
 const status={available:'Datos disponibles',partial:'Parcial',pending:'Pendiente',no_records:'Sin registros informados',unavailable:'No disponible'};
 let msg='\n\n<b>🔎 ESTUDIO AVANZADO</b>';
 msg+='\n🩹 Bajas reportadas: '+h(a.injuries?.reported??'sin datos')+' ('+h(status[a.status?.injuries]||'no disponible')+')';
 for(const [side,label] of [['home','Local'],['away','Visitante']]){
  const abs=(a.injuries?.[side]||[]).slice(0,3);
  if(abs.length)msg+='\n'+label+': '+abs.map(x=>h(x.name)+' ('+h(x.type)+')').join(', ');
  const f=a.form?.[side],s=a.season?.[side];
  if(f?.form_pct!=null)msg+='\n📈 '+label+' forma 5: '+f.form_pct+'% (indicador del proveedor)';
  if(s?.played!=null)msg+='\n📊 '+label+' temporada: '+s.played+' PJ, '+(s.avg_scored??'—')+' GF/PJ, '+(s.avg_conceded??'—')+' GC/PJ';
  const xi=a.lineups?.[side];
  if(xi?.starting?.length)msg+='\n🧩 '+label+' '+h(xi.formation||'once reportado')+': '+xi.starting.slice(0,11).map(h).join(', ');
 }
 msg+='\n🧩 Alineaciones: '+h(status[a.status?.lineups]||'no disponibles');
 return msg+'\n<i>Lesiones y onces sujetos a actualización. Sin garantías de resultado.</i>';
}
export function telegramMatchContext(p){
 const c=p?.football_details?.match_context;if(!c)return '';
 return (c.round?'\n🏆 Jornada: '+h(c.round):'')+(c.venue?'\n🏟 Estadio: '+h(c.venue):'')+(c.city?' · '+h(c.city):'');
}
export function telegramVipPost(p){
 return `♛ <b>FIJAS DE ÉLITE · VIP</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league)}${h(telegramMatchSchedule(p.match_date))}\n🎯 <b>${h(p.market)}:</b> ${h(p.selection)}\n📊 Cuota: ${p.odds!=null && Number.isFinite(Number(p.odds))?Number(p.odds).toFixed(2):'No disponible (sin cuota verificada)'}${telegramMatchContext(p)}${telegramGoalsSummary(p)}${telegramAdvancedSummary(p)}\n\n<b>Análisis y riesgos:</b>\n${h(String(p.analysis||'').slice(0,2300))}\n\nInformación deportiva, no una garantía de resultado.`;
}
export async function telegramApi(method,payload={},env=process.env){
 if(!env.TELEGRAM_BOT_TOKEN)throw Error('Bot de Telegram no configurado');
 const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(14000)
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.ok)throw Error(`Telegram ${method}: ${String(data?.description||'respuesta inválida').slice(0,160)}`);
 return data.result;
}
/** Public preview of a VIP pick: only a confirmed match title for automatic
 * fixture-based predictions, league, scheduled start, and a link to the VIP area.
 * NEVER include market, choice, odds, probability, score, or analysis.
 * Manual titles are untrusted and could contain the actual bet; omit them. */
export function telegramVipPublicPreview(p,base){
 const url=String(base||'').replace(/\/$/,'')+'/clientes.html';
 const matchName=String(p?.title||'').trim();
 // Auto-generated titles are known to contain only home and away team names.
 const fixture=p?.auto_generated===true && /^[^\n|:]{2,70}\s+vs\.?\s+[^\n|:]{2,70}$/i.test(matchName)
  ?`\n⚽ <b>${h(matchName)}</b>`:'';
 const league=p?.league?`\n🏆 ${h(String(p.league).slice(0,120))}`:'';
 const schedule=p?.match_date?h(telegramMatchSchedule(p.match_date)):'';
 return `🔒 <b>FIJAS DE ÉLITE · ADELANTO VIP</b>\n\n👑 ¡Nuevo pronóstico exclusivo publicado!${fixture}${league}${schedule}\n\n🔐 La selección, cuota, mercados de goles, marcador estimado y análisis están disponibles solo en el canal VIP.\n\n✨ Consulta los planes y tu acceso: ${h(url)}\n\n<i>Pronósticos con riesgo: no hay resultados garantizados.</i>`;
}

/** Claim the right to announce this individual prediction once in MySQL.
 * A failed/ambiguous Telegram response is not blindly retried to avoid spam.
 * This is at-most-once delivery; all calls must supply a database connection. */
export async function maybeSendVipTeaser(p,env,db){
 if(!db||!env.TELEGRAM_FREE_CHAT_ID||!/^\d{1,18}$/.test(String(p.id??'')))return false;
 const [claim]=await db.execute("INSERT IGNORE INTO telegram_vip_public_announcements (prediction_id,state) VALUES (?, 'reserved')",[p.id]);
 if(Number(claim.affectedRows)!==1)return false;
 try{
  const sent=await telegramApi('sendMessage',{chat_id:env.TELEGRAM_FREE_CHAT_ID,
   text:telegramVipPublicPreview(p,env.PUBLIC_BASE_URL||'https://lafijasdeelite-production.up.railway.app'),
   parse_mode:'HTML',disable_web_page_preview:true},env);
  await db.execute("UPDATE telegram_vip_public_announcements SET state='sent',sent_at=UTC_TIMESTAMP(),telegram_message_id=? WHERE prediction_id=?",[sent?.message_id||null,p.id]);
  return true;
 }catch(error){
  await db.execute("UPDATE telegram_vip_public_announcements SET state='failed' WHERE prediction_id=?",[p.id]).catch(()=>{});
  console.error('Adelanto público VIP no enviado:',error.message);
  return false;
 }
}

export async function sendPredictionToTelegram(p,env=process.env,{db=null}={}){
 const publicChat=env.TELEGRAM_FREE_CHAT_ID;
 const vipChat=env.TELEGRAM_VIP_CHAT_ID;
 if(!env.TELEGRAM_BOT_TOKEN)return {state:'not_configured'};
 if(p.visibility==='vip'){
  if(!vipChat||!/^[A-Za-z0-9_-]{24,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET||''))return {state:'not_configured'};
  const sent=await telegramApi('sendMessage',{chat_id:vipChat,text:telegramVipPost(p),parse_mode:'HTML',disable_web_page_preview:true,protect_content:true},env);
  await recordPredictionTelegramMessage(db,p.id,'vip',vipChat,sent?.message_id);
  // Full VIP content stays private. A minimal preview accompanies EACH unique VIP publication.
  try{await maybeSendVipTeaser(p,env,db);}catch(error){console.error('VIP teaser no disponible:',error.message);}
  return {state:'sent'};
 }
 if(!publicChat)return {state:'not_configured'};
 // The public group explicitly receives complete FREE picks, manual or automatic.
 const sent=await telegramApi('sendMessage',{chat_id:publicChat,text:telegramFreeAutoPost(p),parse_mode:'HTML',disable_web_page_preview:true},env);
 await recordPredictionTelegramMessage(db,p.id,'free',publicChat,sent?.message_id);
 return {state:'sent'};
}

export function telegramLinkStart(text){
 const match=/^\/start(?:@\w+)?\s+([a-f0-9]{48})\s*$/i.exec(String(text||''));
 return match?.[1]||null;
}
export function telegramWebhookSecretValid(provided,secret){
 if(!secret||secret.length<24||typeof provided!=='string')return false;
 return crypto.timingSafeEqual(Buffer.from(sha256(provided)),Buffer.from(sha256(secret)));
}
