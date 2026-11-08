// Pure PayPal payment invariants; no mutable secrets or database state.
export const paypalEnvironment = value => value === 'live' ? 'live' : 'sandbox';
export function usdCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s=String(value);
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(s)) return null;
  const [whole,decimal='']=s.split('.');
  const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  return Number.isSafeInteger(cents)?cents:null;
}
export function validatePaypalCapture(order, orderId, paymentId, expectedUsd) {
  if (!order || order.id!==orderId || order.status!=='COMPLETED') return null;
  const units=order.purchase_units;
  if (!Array.isArray(units)||units.length!==1) return null;
  const unit=units[0];
  if (String(unit.custom_id)!==String(paymentId) || !unit.custom_id) return null;
  const captures=unit.payments?.captures;
  if (!Array.isArray(captures)||captures.length!==1) return null;
  const capture=captures[0];
  if (!capture.id || capture.status!=='COMPLETED' || capture.amount?.currency_code!=='USD' || unit.amount?.currency_code!=='USD') return null;
  const actual=usdCents(capture.amount.value),declared=usdCents(unit.amount.value),expected=usdCents(expectedUsd);
  if (actual===null||declared===null||expected===null||actual!==expected||declared!==expected||expected<1) return null;
  return {captureId:capture.id,amountUsd:(expected/100).toFixed(2)};
}
export function paypalReadiness(env) {
  const mode=paypalEnvironment(env.PAYPAL_MODE);
  const missing=[];
  if(String(env.PAYPAL_ENABLE||'').toLowerCase()!=='true')missing.push('PAYPAL_ENABLE (debe ser true)');
  if(!env.PAYPAL_CLIENT_ID?.trim())missing.push('PAYPAL_CLIENT_ID');
  if(!env.PAYPAL_CLIENT_SECRET?.trim())missing.push('PAYPAL_CLIENT_SECRET');
  const rate=Number(env.PAYPAL_PEN_PER_USD);
  if(!Number.isFinite(rate)||rate<=0)missing.push('PAYPAL_PEN_PER_USD');
  try {const url=new URL(env.PUBLIC_BASE_URL);if(url.protocol!=='https:' && url.hostname!=='localhost')throw Error();}
  catch{missing.push('PUBLIC_BASE_URL (HTTPS obligatorio)');}
  if(mode==='live') {
    if(!env.PAYPAL_WEBHOOK_ID?.trim())missing.push('PAYPAL_WEBHOOK_ID (Live)');
    if(env.PAYPAL_LIVE_RELEASE_ACK!=='true')missing.push('PAYPAL_LIVE_RELEASE_ACK=true (activación explícita del dueño)');
  }
  return {mode,missing,ready:missing.length===0};
}
export function refundState(totalRefundedUsd, capturedUsd) {
  const refunded=usdCents(totalRefundedUsd),captured=usdCents(capturedUsd);
  if(refunded===null || captured===null || captured===0)return 'review';
  if(refunded===0)return 'captured';
  return refunded>=captured?'refunded':'partially_refunded';
}

export function captureIdFromRefund(refund) {
  const byId=refund?.supplementary_data?.related_ids?.capture_id;
  if(byId&&/^[A-Z0-9-]{5,100}$/i.test(byId))return byId;
  for(const link of refund?.links||[]){
    if(link.rel!=='up')continue;
    const m=/\/v2\/payments\/captures\/([A-Z0-9-]{5,100})(?:\?|$)/i.exec(link.href||'');
    if(m)return m[1];
  }
  return null;
}
