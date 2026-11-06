/** A selected outcome is an estimated 1X2 probability, NOT real hit rate. */
export const FREE_MIN_PROBABILITY=40;
export const FREE_MAX_PROBABILITY=50;
export const VIP_MIN_PROBABILITY=63;
export const FREE_MIN_MARGIN=8;
export const VIP_MIN_MARGIN=12;

function evidenceData(value){
 try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}
}
export function canAutoPublishCandidate(row){
 if(!row||row.status!=='draft'||row.market!=='Resultado final 1X2')return false;
 const probability=Number(row.provider_probability);
 if(row.provider==='nforce-openfootball'){
  const d=evidenceData(row.evidence_json);
  if(d.model?.model!=='nforce-poisson-1.1'||!Number.isFinite(probability)||!d.model?.sample)return false;
  if(Number(d.model.sample.home)<7||Number(d.model.sample.away)<7||Number(d.model.sample.league)<36)return false;
  if(!Number.isFinite(Number(d.model.quality))||Number(d.model.quality)<45)return false;
  if(row.visibility==='vip')return probability>=62&&Number(d.model.margin)>=12&&Number(d.model.sample.home)>=10&&Number(d.model.sample.away)>=10&&Number(d.model.quality)>=58;
  return row.visibility==='free'&&probability>=40&&probability<=50&&Number(d.model.margin)>=6;
 }

 const data=evidenceData(row.evidence_json);
 if(!Number.isFinite(probability)||Number(data.evidence_count)<2)return false;
 if(row.visibility==='free')return probability>=FREE_MIN_PROBABILITY && probability<=FREE_MAX_PROBABILITY && Number(data.margin)>=FREE_MIN_MARGIN;
 // A bookmaker quote is optional. Missing odds are prominently displayed as
 // "No disponible", never fabricated, and do NOT prevent publication.
 if(row.visibility==='vip')return probability>=VIP_MIN_PROBABILITY && Number(data.margin)>=VIP_MIN_MARGIN;
 return false;
}
