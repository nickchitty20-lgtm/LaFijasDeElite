/** Telegram GOLD enrollment: a typed @username is only a claim, never proof.
 * Identity is established from message.from.id + message.from.username when the
 * customer opens the bot using a short-lived, single-use /start token.
 */
export function normalizeTelegramUsername(value){
 if(typeof value!=='string')return null;
 const name=value.trim().replace(/^@/,'');
 return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)?name.toLowerCase():null;
}
export function telegramGoldUsernameMatches(expected,actual){
 const claimed=normalizeTelegramUsername(expected);
 return Boolean(claimed && claimed===normalizeTelegramUsername(actual));
}
export function goldAuthorizationText(username){
 const name=normalizeTelegramUsername(username);
 return `💎 FIJAS DE ÉLITE · ACCESO GOLD CONFIRMADO\n\n✅ Tu cuenta ${name?'@'+name:'de Telegram'} está verificada y autorizada en la lista blanca GOLD.\n\n🔔 Recibirás aquí los pronósticos GOLD completos mientras tu membresía GOLD o VIP permanezca activa.\n👑 Las selecciones VIP se publican exclusivamente en el canal VIP.\n\nℹ️ Las proyecciones deportivas están sujetas a incertidumbre.`;
}
