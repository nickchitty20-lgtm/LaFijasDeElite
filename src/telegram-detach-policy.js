// A detach is identity unlinking ONLY, never a Telegram channel removal.
export function shouldPreserveDetachedMember(linkStatus,accountStatus,hasActiveVip){
 return linkStatus==='detached'&&accountStatus==='active'&&Boolean(hasActiveVip);
}
export function canBeginNewTelegramLink(linkExists,cooldownMinutes){
 return !linkExists && Number(cooldownMinutes||0)<=0;
}
export function shouldReleaseDetachedReservation(linkStatus,telegramMemberStatus,isMember=true){
 return linkStatus==='detached'&&(['left','kicked'].includes(telegramMemberStatus)||(telegramMemberStatus==='restricted'&&isMember===false));
}
