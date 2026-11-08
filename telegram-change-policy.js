// Security rules for VIP Telegram account changes. No access is granted by this module.
export const TELEGRAM_CHANGE_COOLDOWN_DAYS=30;
export const TELEGRAM_CHANGE_TOKEN_MINUTES=10;
export const TELEGRAM_CHANGE_REISSUE_MINUTES=30;
export function changeCooldownMinutes(value){
 if(value===null||value===undefined)return 0;
 const n=Number(value);
 return Number.isFinite(n)?Math.max(0,Math.ceil(n)):0;
}
export function changeIsAllowed({hasVip,hasLink,pending,cooldownMinutes,reissueMinutes}){
 if(!hasVip)return {allowed:false,error:'Necesitas una membresía VIP activa para cambiar tu Telegram.',status:403};
 if(!hasLink)return {allowed:false,error:'Primero vincula tu cuenta de Telegram.',status:409};
 if(changeCooldownMinutes(cooldownMinutes)>0&&!pending)return {allowed:false,error:`Por seguridad, solo puedes cambiar de Telegram una vez cada ${TELEGRAM_CHANGE_COOLDOWN_DAYS} días. Faltan aproximadamente ${changeCooldownMinutes(cooldownMinutes)} minutos. Si perdiste tu cuenta, solicita una excepción al dueño.`,status:429};
 if(pending&&changeCooldownMinutes(reissueMinutes)>0)return {allowed:false,error:`Ya tienes un cambio en curso. Podrás generar un enlace nuevo en aproximadamente ${changeCooldownMinutes(reissueMinutes)} minutos.`,status:429};
 return {allowed:true};
}
export const telegramChangeToken=()=>({bytes:24,expiresMinutes:TELEGRAM_CHANGE_TOKEN_MINUTES});
