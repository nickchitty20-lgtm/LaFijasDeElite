// Security logic independent of Telegram / database drivers for local tests.
export const noticeKindColumn=Object.freeze({vip_activated:'vip_enabled',vip_expiring:'expiry_enabled',new_prediction:'picks_enabled'});
export function formatPredictionNotice(visibility,webUrl){
 return visibility==='vip'
  ?`👑 FIJAS DE ÉLITE · VIP\n📣 Nueva selección VIP publicada.\n🔐 Accede desde tu canal privado o consulta tu panel: ${webUrl}`
  :`⚽ FIJAS DE ÉLITE · OFICIAL\n📣 Nuevo pronóstico gratuito disponible.\n🔎 Inicia sesión para conocer el informe: ${webUrl}`;
}
export function noticeShouldSend({active,linked,pendingChange,optedIn,eligible=true}){
 return Boolean(active&&linked&&!pendingChange&&optedIn&&eligible);
}
