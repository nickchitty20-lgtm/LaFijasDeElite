// Security logic independent of Telegram / database drivers for local tests.
export const noticeKindColumn=Object.freeze({vip_activated:'vip_enabled',vip_expiring:'expiry_enabled',new_prediction:'picks_enabled'});
export function formatPredictionNotice(visibility,webUrl){
 return visibility==='vip'
  ?`♛ Nuevo pronóstico VIP en Fijas de Élite. Consulta el canal privado o tu panel: ${webUrl}`
  :`⚽ Hay un nuevo pronóstico gratuito en Fijas de Élite. Inicia sesión para consultarlo: ${webUrl}`;
}
export function noticeShouldSend({active,linked,pendingChange,optedIn,eligible=true}){
 return Boolean(active&&linked&&!pendingChange&&optedIn&&eligible);
}
