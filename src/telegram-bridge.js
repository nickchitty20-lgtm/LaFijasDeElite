import crypto from 'node:crypto';

// Never put TELEGRAM_BOT_TOKEN or webhook secrets into browser responses/logs.
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const safeTelegramId = value => /^\d{1,16}$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const isMemberStatus = status => ['member','administrator','creator'].includes(status);
export const isPublicTelegramContentSafe = message => !/[\n]🎯|[\n]📊 Cuota:|[\n]Análisis:/.test(message);
export const h = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function telegramPublicNotice(p,base){
 const label=p.visibility==='vip'?'🔒 NUEVO VIP':'⚽ NUEVO PRONÓSTICO GRATIS';
 const location=`${base.replace(/\/$/,'')}/clientes.html`;
 return `${label}\n🏆 Liga: ${h(p.league)}\n\n🔐 Consulta los detalles iniciando sesión en Fijas de Élite.\n${h(location)}\n\nLos pronósticos no garantizan resultados.`;
}
export function telegramFreeAutoPost(p){
 return `⚽ <b>FIJAS DE ÉLITE · GRATIS</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league)}\n📅 ${h(p.match_date)} UTC\n🎯 ${h(p.market)}: <b>${h(p.selection)}</b>\n\n${h(String(p.analysis||'').slice(0,1150))}\n\nAnálisis estadístico, no garantía. Pronósticos con riesgo de fallo.`;
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
export function telegramVipPost(p){
 return `♛ <b>FIJAS DE ÉLITE · VIP</b>\n<b>${h(p.title)}</b>\n🏆 ${h(p.league)}\n📅 ${h(p.match_date)} UTC\n🎯 <b>${h(p.market)}:</b> ${h(p.selection)}\n📊 Cuota: ${p.odds!=null && Number.isFinite(Number(p.odds))?Number(p.odds).toFixed(2):'No disponible (sin cuota verificada)'}${telegramGoalsSummary(p)}\n\n<b>Análisis y riesgos:</b>\n${h(String(p.analysis||'').slice(0,2300))}\n\nInformación deportiva, no una garantía de resultado.`;
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
export async function sendPredictionToTelegram(p,env=process.env){
 const publicChat=env.TELEGRAM_FREE_CHAT_ID;
 const vipChat=env.TELEGRAM_VIP_CHAT_ID;
 if(!env.TELEGRAM_BOT_TOKEN)return {state:'not_configured'};
 if(p.visibility==='vip'){
  if(!vipChat||!/^[A-Za-z0-9_-]{24,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET||''))return {state:'not_configured'};
  await telegramApi('sendMessage',{chat_id:vipChat,text:telegramVipPost(p),parse_mode:'HTML',disable_web_page_preview:true,protect_content:true},env);
  if(publicChat){
   try{await telegramApi('sendMessage',{chat_id:publicChat,text:telegramPublicNotice(p,env.PUBLIC_BASE_URL||'https://lafijasdeelite-production.up.railway.app'),parse_mode:'HTML',disable_web_page_preview:true},env);}
   catch(error){console.error('Telegram aviso público VIP no enviado:',error.message);}
  }
  return {state:'sent'};
 }
 if(!publicChat)return {state:'not_configured'};
 // The open community never receives complete free picks or VIP picks.
 await telegramApi('sendMessage',{chat_id:publicChat,text:(p.auto_generated&&env.FOOTBALL_PUBLIC_FREE_PICKS==='true'?telegramFreeAutoPost(p):telegramPublicNotice(p,env.PUBLIC_BASE_URL||'https://lafijasdeelite-production.up.railway.app')),parse_mode:'HTML',disable_web_page_preview:true},env);
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
