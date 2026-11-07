import crypto from 'node:crypto';
import {publicAnalysisText} from './public-branding.js';
import {telegramMatchSchedule} from './match-schedule.js';
import {recordPredictionTelegramMessage} from './prediction-removal.js';
import {freeTelegramDestination,safeTelegramPublicUrl} from './telegram-public.js';

// Never put TELEGRAM_BOT_TOKEN or webhook secrets into browser responses/logs.
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const safeTelegramId = value => /^\d{1,16}$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const isMemberStatus = status => ['member','administrator','creator'].includes(status);
export const isPublicTelegramContentSafe = message => !/[\n]🎯|[\n]📊 Cuota:|[\n]Análisis:/.test(message);
export const h = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** Always link Telegram announcements to the public landing page, never the customer area. */
export function telegramHomeUrl(base){
 try{
  const u=new URL(String(base||'https://lafijasdeelite-production.up.railway.app'));
  if(!['https:','http:'].includes(u.protocol))throw new Error('invalid protocol');
  return u.origin+'/';
 }catch{return 'https://lafijasdeelite-production.up.railway.app/';}
}
/** Deliberately short discussion-group notices: no pick, odds, analysis,
 * predicted score or other VIP-only details. The FREE link is to the official
 * channel; the VIP link is to the PUBLIC website landing page. */
export function telegramCommunityNotice(visibility,{channelUrl='',baseUrl=''}={}){
 if(visibility==='free'){
  const link=safeTelegramPublicUrl(channelUrl);
  if(!link)return '';
  return `⚽ ¡Se publicó una nueva fija GRATIS!\n📢 Revísala en nuestro canal oficial:\n${link}\n\n⚠️ Pronósticos sin garantía.`;
 }
 if(visibility==='vip')return `👑 ¡Se publicó una nueva fija VIP!\n🔒 Accede desde nuestra web:\n${telegramHomeUrl(baseUrl)}\n\n⚠️ Pronósticos sin garantía.`;
 return '';
}

export function telegramPublicNotice(p,base){
 const label=p.visibility==='vip'?'🔒 NUEVO VIP':'⚽ NUEVO PRONÓSTICO GRATIS';
 const location=telegramHomeUrl(base);
 return `${label}\n🏆 Liga: ${h(p.league)}${h(telegramMatchSchedule(p.match_date))}\n\n🔐 Consulta los detalles iniciando sesión en Fijas de Élite.\n${h(location)}\n\nLos pronósticos no garantizan resultados.`;
}
export function telegramFreeAutoPost(p,base){
 const n=Number(p.estimated_probability);
 const verified=p.estimated_probability!=null && Number.isFinite(n)&&n>=0&&n<=100;
 const confidence=verified?`\n📈 Probabilidad estimada: ${n.toFixed(1)}% (NO es porcentaje de aciertos real).`:'';
 return `⚽ <b>FIJAS DE ÉLITE · CANAL GRATIS</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league)}${h(telegramMatchSchedule(p.match_date))}\n🎯 ${h(p.market)}: <b>${h(p.selection)}</b>${confidence}\n⚠️ <b>RIESGO ALTO · NO ES UNA FIJA SEGURA</b>\n\n${h(publicAnalysisText(p.analysis).slice(0,1400))}\n\nEstimación estadística no calibrada, no garantía de acierto. No apuestes dinero que no puedas perder.\n\n🔗 Sitio oficial: ${h(telegramHomeUrl(base))}`;
}
export function telegramGoalsSummary(p){
 const f=p?.football_details;
 if(!f)return '';
 const line=(label,v)=>`\n• ${label}: ${h(v||'sin estimación')}`;
 const hist=f.historical;
 const msg='\n\n<b>⚽ MERCADOS DE GOLES (estimaciones)</b>'+line('Total',f.total_line?.market_label)+line('Local',f.home_line?.market_label)+line('Visitante',f.away_line?.market_label)+
  (f.model_goals?line('Más de 1.5',`${f.model_goals.over15}%`)+line('Más de 3.5',`${f.model_goals.over35}%`):'')+
  line('Ambos anotan',f.model_goals?.btts!=null?`${f.model_goals.btts}% según N-FORCE`:hist?`${hist.both_scored}/${hist.games} antecedentes`:'Sin datos suficientes')+
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
 return `♛ <b>FIJAS DE ÉLITE · VIP</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league)}${h(telegramMatchSchedule(p.match_date))}\n🎯 <b>${h(p.market)}:</b> ${h(p.selection)}\n📊 Cuota: ${p.odds!=null && Number.isFinite(Number(p.odds))?Number(p.odds).toFixed(2):'No disponible (sin cuota verificada)'}${telegramMatchContext(p)}${telegramGoalsSummary(p)}${telegramAdvancedSummary(p)}\n\n<b>Análisis y riesgos:</b>\n${h(publicAnalysisText(p.analysis).slice(0,2300))}\n\nInformación deportiva, no una garantía de resultado.`;
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
 const url=telegramHomeUrl(base);
 const matchName=String(p?.title||'').trim();
 // Auto-generated titles are known to contain only home and away team names.
 const fixture=p?.auto_generated===true && /^[^\n|:]{2,70}\s+vs\.?\s+[^\n|:]{2,70}$/i.test(matchName)
  ?`\n⚽ <b>${h(matchName)}</b>`:'';
 const league=p?.league?`\n🏆 ${h(String(p.league).slice(0,120))}`:'';
 const schedule=p?.match_date?h(telegramMatchSchedule(p.match_date)):'';
 return `🔒 <b>FIJAS DE ÉLITE · ADELANTO VIP</b>\n\n👑 ¡Nuevo pronóstico exclusivo publicado!${fixture}${league}${schedule}\n\n🔐 La selección, cuota, mercados de goles, marcador estimado y análisis están disponibles solo en el canal VIP.\n\n✨ Consulta los planes y tu acceso: ${h(url)}\n\n<i>Pronósticos con riesgo: no hay resultados garantizados.</i>`;
}

/** Resolve and verify the actual FREE destination before posting. Never trust a
 * channel-shaped ID alone: it may be mistyped or belong to a different chat.
 * Telegram's response must identify a channel, and when a public username is
 * configured it must be the same channel. Does not send a message. */
export async function inspectFreeTelegramChannel(env=process.env,{checkPermissions=false}={}){
 const target=freeTelegramDestination(env);
 if(!env.TELEGRAM_BOT_TOKEN)return {ready:false,reason:'Falta TELEGRAM_BOT_TOKEN en Railway.'};
 if(!target)return {ready:false,reason:'Configura TELEGRAM_FREE_CHANNEL_URL o TELEGRAM_FREE_CHANNEL_CHAT_ID. El grupo GRATIS no se usa para publicar.'};
 try{
  const chat=await telegramApi('getChat',{chat_id:target},env);
  if(chat?.type!=='channel')return {ready:false,reason:'El destino configurado no es un canal de Telegram.',target};
  const expected=env.TELEGRAM_FREE_CHANNEL_URL;
  if(expected){
   const u=safeTelegramPublicUrl(expected);
   const username=u?new URL(u).pathname.slice(1).replace(/\/$/,''):'';
   if(username && !username.startsWith('+') && String(chat.username||'').toLowerCase()!==username.toLowerCase())
    return {ready:false,reason:'El ID del canal no coincide con el enlace público configurado.',target};
  }
  if(checkPermissions){
   const bot=await telegramApi('getMe',{},env);
   const member=await telegramApi('getChatMember',{chat_id:chat.id,user_id:bot.id},env);
   if(!['administrator','creator'].includes(member?.status))
    return {ready:false,reason:'Agrega el bot como administrador del canal.',target};
   if(member.status==='administrator' && member.can_post_messages!==true)
    return {ready:false,reason:'El bot es administrador, pero le falta permiso para publicar mensajes.',target};
  }
  return {ready:true,chat_id:String(chat.id),title:String(chat.title||'Canal'),username:String(chat.username||''),target};
 }catch(error){
  // Only Telegram's error description is exposed; never expose tokens or URLs with credentials.
  return {ready:false,reason:String(error?.message||'No se pudo verificar el canal.').slice(0,200),target};
 }
}

/** Claim the right to announce this individual prediction once in MySQL.
 * A failed/ambiguous Telegram response is not blindly retried to avoid spam.
 * This is at-most-once delivery; all calls must supply a database connection. */
export async function maybeSendVipTeaser(p,env,db){
 if(!db||!freeTelegramDestination(env)||!/^\d{1,18}$/.test(String(p.id??'')))return false;
 const verified=await inspectFreeTelegramChannel(env);
 if(!verified.ready){console.error('Adelanto VIP al canal no disponible:',verified.reason);return false;}
 const publicChat=verified.chat_id;
 const [claim]=await db.execute("INSERT IGNORE INTO telegram_vip_public_announcements (prediction_id,state,chat_id) VALUES (?, 'reserved', ?)",[p.id,publicChat]);
 if(Number(claim.affectedRows)!==1)return false;
 try{
  const sent=await telegramApi('sendMessage',{chat_id:publicChat,
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

/** A separate, opt-in community group gets only a short announcement AFTER
 * successful delivery to the primary channel. Never falls back to this group
 * for a full pick. A unique MySQL reservation avoids repeated/spam messages.
 * Ambiguous Telegram failures are NOT retried automatically (at-most-once).
 */
export async function maybeSendCommunityNotice(p,env=process.env,db,{channelUsername=''}={}){
 const target=String(env.TELEGRAM_FREE_CHAT_ID||'').trim();
 if(!db||!env.TELEGRAM_BOT_TOKEN||!/^(?:-\d{5,16}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(target)||
    !/^\d{1,18}$/.test(String(p?.id??''))||!['free','vip'].includes(p?.visibility))return false;
 const fallbackUsername=/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(channelUsername)?channelUsername:'';
 const channelUrl=safeTelegramPublicUrl(env.TELEGRAM_FREE_CHANNEL_URL)||
  (fallbackUsername?`https://t.me/${fallbackUsername}`:'');
 const text=telegramCommunityNotice(p.visibility,{channelUrl,baseUrl:env.PUBLIC_BASE_URL});
 if(!text)return false; // Without a public channel link, do not send a broken FREE CTA.
 try{
  const chat=await telegramApi('getChat',{chat_id:target},env);
  if(!['group','supergroup'].includes(chat?.type)){
   console.error('Aviso de comunidad omitido: TELEGRAM_FREE_CHAT_ID no es un grupo.');
   return false;
  }
  const id=String(chat.id);
  if(id===String(env.TELEGRAM_VIP_CHAT_ID||'')){
   console.error('Aviso de comunidad omitido: el grupo coincide con el destino VIP.');
   return false;
  }
  const [claim]=await db.execute(`INSERT IGNORE INTO telegram_community_announcements
    (prediction_id,visibility,chat_id,state) VALUES (?,?,?,'reserved')`,[p.id,p.visibility,id]);
  if(Number(claim.affectedRows)!==1)return false;
  try{
   const sent=await telegramApi('sendMessage',{chat_id:id,text,disable_web_page_preview:true},env);
   await db.execute("UPDATE telegram_community_announcements SET state='sent',sent_at=UTC_TIMESTAMP(),message_id=? WHERE prediction_id=?",[sent?.message_id||null,p.id]);
   return true;
  }catch(error){
   await db.execute("UPDATE telegram_community_announcements SET state='failed' WHERE prediction_id=?",[p.id]).catch(()=>{});
   console.error('No se pudo avisar a la comunidad:',error.message);
   return false;
  }
 }catch(error){
  console.error('No se pudo comprobar o reservar el aviso de comunidad:',error.message);
  return false;
 }
}

export async function sendPredictionToTelegram(p,env=process.env,{db=null}={}){
 const publicChat=freeTelegramDestination(env);
 const vipChat=env.TELEGRAM_VIP_CHAT_ID;
 if(!env.TELEGRAM_BOT_TOKEN)return {state:'not_configured'};
 if(p.visibility==='vip'){
  if(!vipChat||String(vipChat)===String(publicChat)||String(vipChat)===String(env.TELEGRAM_FREE_CHANNEL_CHAT_ID||'')||!/^[A-Za-z0-9_-]{24,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET||''))return {state:'not_configured'};
  // Public @username and private numeric ID can refer to the SAME chat.
  // Prevent any full VIP content from being sent to that channel.
  if(publicChat.startsWith('@')){
   const verifiedPublic=await inspectFreeTelegramChannel(env);
   if(verifiedPublic.ready&&verifiedPublic.chat_id===String(vipChat))return {state:'not_configured'};
  }
  const sent=await telegramApi('sendMessage',{chat_id:vipChat,text:telegramVipPost(p),parse_mode:'HTML',disable_web_page_preview:true,protect_content:true},env);
  await recordPredictionTelegramMessage(db,p.id,'vip',vipChat,sent?.message_id);
  // Full VIP content stays private. A minimal preview accompanies EACH unique VIP publication.
  try{await maybeSendVipTeaser(p,env,db);}catch(error){console.error('VIP teaser no disponible:',error.message);}
  // The group receives only a link to the web, never the private VIP pick.
  await maybeSendCommunityNotice(p,env,db);
  return {state:'sent'};
 }
 if(!publicChat)return {state:'not_configured'};
 const verified=await inspectFreeTelegramChannel(env);
 if(!verified.ready)throw Error('No se pudo publicar en el canal GRATIS: '+verified.reason);
 // Never send FREE predictions to the discussion group, even on failure.
 const sent=await telegramApi('sendMessage',{chat_id:verified.chat_id,text:telegramFreeAutoPost(p,env.PUBLIC_BASE_URL),parse_mode:'HTML',disable_web_page_preview:true},env);
 await recordPredictionTelegramMessage(db,p.id,'free',verified.chat_id,sent?.message_id);
 // The group receives only a short link to the FREE channel.
 await maybeSendCommunityNotice(p,env,db,{channelUsername:verified.username});
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
