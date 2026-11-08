// Payment records are financial evidence and must never be physically deleted.
// A pending PayPal order may still be captured by the buyer or the provider.
export function evaluateMembershipArchive(payments) {
 const rows=Array.isArray(payments)?payments:[];
 return {
  blockedByPaypal:rows.some(p=>p.method==='card'&&p.status==='pending'),
  hasVerifiedPayment:rows.some(p=>p.status==='verified'),
  pendingManualPayments:rows.filter(p=>p.method!=='card'&&p.status==='pending').length
 };
}
