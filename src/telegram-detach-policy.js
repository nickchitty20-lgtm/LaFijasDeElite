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

// The creator explicitly authorizes keeping ONE previous member while re-linking.
// The exemption stops if the client loses VIP or is moved to Rank 0.
export function shouldPreserveOwnerMember(ownerPreserved,accountStatus,hasActiveVip){
 return Boolean(ownerPreserved) && accountStatus==='active' && Boolean(hasActiveVip);
}
export function ownerForceCanProceed({isOwner,hasLinkedTelegram,alreadyPreserved,accountStatus}){
 return Boolean(isOwner)&&Boolean(hasLinkedTelegram)&&!alreadyPreserved&&accountStatus==='active';
}
