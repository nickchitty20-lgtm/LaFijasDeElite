/** N-FORCE paid-tier rollout. Existing published FREE predictions are historical
 * and must NEVER be relabelled, concealed, or sent to paying customers as new.
 * Only fresh drafts resulting from a current N-FORCE analysis become GOLD.
 * This changes distribution, not probability, quality or model evidence.
 */
export const GOLD_ROLLOUT = 'gold-from-auto-free-v3.5.2';
export function classifyAutomaticCandidate(candidate){
 if(!candidate || candidate.visibility!=='free')return candidate;
 let evidence={};
 try{evidence=typeof candidate.evidence_json==='string'?JSON.parse(candidate.evidence_json):candidate.evidence_json||{};}catch{}
 return {...candidate,visibility:'gold',
  evidence_json:JSON.stringify({...evidence,distribution:{
   ...((evidence.distribution&&typeof evidence.distribution==='object')?evidence.distribution:{}),
   original_tier:'free',delivered_tier:'gold',rollout:GOLD_ROLLOUT}}),
  analysis:String(candidate.analysis||'')
    .replaceAll('Cribado GRATIS multimerkado','Cribado estadístico multimerkado')
    .replaceAll('Esta propuesta gratuita tiene alta incertidumbre.','Esta propuesta GOLD también implica riesgo elevado; no hay aciertos garantizados.')};
}
export function shouldBlockLegacyFreeDraft(row){
 return row?.provider==='nforce-openfootball' && row?.status==='draft' && row?.visibility==='free';
}
