// A change in rank zero never grants channel access by itself.
// Telegram may unban a previously blocked identity, but the normal VIP
// eligibility and time-limited invitation checks are still mandatory.
export function rank0ActionForTransition(previousStatus, nextStatus) {
 if(nextStatus==='blacklisted') return 'ban';
 if(previousStatus==='blacklisted'&&nextStatus==='active') return 'unban';
 return null;
}
export function rank0ActionMatchesStatus(action,accountStatus){
 return (action==='ban'&&accountStatus==='blacklisted') || (action==='unban'&&accountStatus==='active');
}
export function rank0DesiredAction(accountStatus){return accountStatus==='blacklisted'?'ban':'unban';}
