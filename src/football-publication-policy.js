import {selectMarket,MODEL_VERSION} from './nforce-model.js';
import {GOLD_ROLLOUT} from './nforce-gold-transition.js';
/** A selected outcome is an estimated 1X2 probability, NOT real hit rate. */
export const FREE_MIN_PROBABILITY=40;
export const FREE_MAX_PROBABILITY=68;
export const VIP_MIN_PROBABILITY=63;
export const FREE_MIN_MARGIN=8;
export const VIP_MIN_MARGIN=12;

function evidenceData(value){
 try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}
}
export function canAutoPublishCandidate(row){
 if(!row||row.status!=='draft'||(row.provider!=='nforce-openfootball'&&row.market!=='Resultado final 1X2'))return false;
 const probability=Number(row.provider_probability);
 if(row.provider==='nforce-openfootball'){
  const d=evidenceData(row.evidence_json),m=d.model;
  if(m?.model!==MODEL_VERSION||!m.sample||!Number.isFinite(probability))return false;
  const expected=selectMarket({home:row.home_team,away:row.away_team},m);
  const expectedVisibility=expected?.visibility==='free' && d.distribution?.rollout===GOLD_ROLLOUT?'gold':expected?.visibility;
  return Boolean(expected&&expectedVisibility===row.visibility&&expected.market===row.market&&
   expected.selection===row.selection&&Math.abs(expected.probability-probability)<0.11&&
   d.pick?.key===expected.key);
 }

 const data=evidenceData(row.evidence_json);
 if(!Number.isFinite(probability)||Number(data.evidence_count)<2)return false;
 if(row.visibility==='free')return probability>=FREE_MIN_PROBABILITY && probability<=FREE_MAX_PROBABILITY && Number(data.margin)>=FREE_MIN_MARGIN;
 // A bookmaker quote is optional. Missing odds are prominently displayed as
 // "No disponible", never fabricated, and do NOT prevent publication.
 if(row.visibility==='vip')return probability>=VIP_MIN_PROBABILITY && Number(data.margin)>=VIP_MIN_MARGIN;
 return false;
}
