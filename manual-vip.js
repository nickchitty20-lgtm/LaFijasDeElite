/** Produce an additive entitlement window using full UTC days. */
export function manualVipPeriod(lastEnd, days, now=new Date()) {
 if(!Number.isInteger(days) || days<1 || days>3650) throw new RangeError('Invalid VIP plan duration');
 const clock=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(clock.getTime()))throw new TypeError('Invalid current time');
 const previous=lastEnd?new Date(lastEnd):null;
 const start=previous && Number.isFinite(previous.getTime()) && previous>clock?previous:clock;
 const end=new Date(start.getTime()+days*24*60*60*1000);
 return {start,end};
}
