/**
 * Display entitlement through confirmed future renewals without granting VIP
 * before the first membership is actually active. DB rows are authoritative.
 * A future renewal is already recorded with status=active and starts_at equal
 * to the expiry of the preceding membership. It must extend the displayed
 * expiry immediately, not wait for its future starts_at date.
 */
export function buildMembershipSummary(current, horizon, scheduledCount=0, nowMs=Date.now()) {
 if (!current) return null;
 const presentEnd=new Date(current.ends_at).getTime();
 const latestEnd=horizon?new Date(horizon.ends_at).getTime():presentEnd;
 const effectiveEnd=Number.isFinite(latestEnd)&&latestEnd>presentEnd?horizon.ends_at:current.ends_at;
 const endMs=new Date(effectiveEnd).getTime();
 return {
  plan:current.plan,
  ends_at:effectiveEnd,
  current_ends_at:current.ends_at,
  days_left:Number.isFinite(endMs)?Math.max(0,Math.ceil((endMs-nowMs)/86400000)):0,
  renewals_scheduled:Math.max(0,Number(scheduledCount)||0)
 };
}
