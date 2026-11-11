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
 return `✅ FIJAS DE ÉLITE · GOLD\n\nTu cuenta ${name?'@'+name:'de Telegram'} fue verificada y autorizada en la lista blanca GOLD. 💎\n\nRecibirás aquí los nuevos pronósticos GOLD completos mientras tengas GOLD o VIP vigente. Las selecciones VIP se mantienen exclusivamente en el canal VIP.\n\n⚽ Los pronósticos son estimaciones y no garantizan resultados.`;
}
