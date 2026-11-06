/** Statistical filters, not promises of wins or financial returns. */
export const FREE_MIN_PROBABILITY=40;
export const FREE_MAX_PROBABILITY=50;
export const VIP_MIN_PROBABILITY=72;

function evidenceData(value){
 try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}
}

export function canAutoPublishCandidate(row){
 if(!row||row.status!=='draft'||row.market!=='Resultado final 1X2')return false;
 const probability=Number(row.provider_probability);
 const data=evidenceData(row.evidence_json);
 if(!Number.isFinite(probability)||Number(data.evidence_count)<2)return false;
 if(row.visibility==='free')return probability>=FREE_MIN_PROBABILITY && probability<=FREE_MAX_PROBABILITY && Number(data.margin)>=12;
 if(row.visibility==='vip')return probability>=VIP_MIN_PROBABILITY && Number(data.margin)>=18 &&
   row.odds!=null && Number.isFinite(Number(row.odds)) && Number(row.odds)>=1.01;
 return false;
}

