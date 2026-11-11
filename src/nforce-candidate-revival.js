/** Reevaluate N-FORCE candidates only after a real version/format incompatibility.
 * A fresh scan MUST produce an eligible candidate; this module never publishes
 * or changes an existing prediction. Manual rejections from v3.5.5 onward are
 * explicitly tagged so later upgrades cannot silently reverse owner decisions.
 */
export const CANDIDATE_REVIEW_BUILD='3.5.5';
const versionParts=(value,prefix)=>{
 const text=String(value||'');
 const matched=(prefix==='model'?/^nforce-poisson-(\d+)\.(\d+)(?:\.(\d+))?$/:/^(\d+)\.(\d+)\.(\d+)$/).exec(text);
 return matched?[Number(matched[1]),Number(matched[2]),Number(matched[3]||0)]:null;
};
const compareVersions=(older,current,prefix)=>{
 const a=versionParts(older,prefix),b=versionParts(current,prefix);
 if(!a||!b)return false;
 for(let i=0;i<a.length;i++){
  if(a[i]<b[i])return true;
  if(a[i]>b[i])return false;
 }
 return false;
};
const parseEvidence=evidence=>{
 try{return typeof evidence==='string'?JSON.parse(evidence):evidence||{};}catch{return {};}
};
export function candidateModelVersion(evidence){
 const value=parseEvidence(evidence)?.model?.model;
 return typeof value==='string'?value:null;
}
export function discardedInBuild(evidence){
 const value=parseEvidence(evidence)?.discarded_in_build;
 return typeof value==='string'?value:null;
}
export function discardReason(evidence){
 const value=parseEvidence(evidence)?.discard_reason;
 return typeof value==='string'?value:null;
}
export const isOlderModelVersion=(stored,current)=>compareVersions(stored,current,'model');
export const isOlderBuildVersion=(stored,current)=>compareVersions(stored,current,'build');

/** Old OPEN-profile candidates need the newer GOLD distribution rules. */
export function hasLegacyDistribution(row){
 if(row?.provider!=='nforce-openfootball'||row?.visibility!=='free')return false;
 const evidence=parseEvidence(row.evidence_json);
 return evidence.distribution?.delivered_tier!=='gold';
}
export function hasVersionIncompatibility(row,currentModelVersion){
 const stored=candidateModelVersion(row?.evidence_json);
 return Boolean(stored && isOlderModelVersion(stored,currentModelVersion))||hasLegacyDistribution(row);
}
/** Called only for an explicit owner discard action. */
export function reasonForDiscard(row,currentModelVersion){
 return hasVersionIncompatibility(row,currentModelVersion)?'version_incompatible':'manual';
}
export function canReopenOldDiscard(row,currentModelVersion,currentBuild=CANDIDATE_REVIEW_BUILD){
 if(!row||row.status!=='discarded'||row.prediction_id!=null||row.published_at!=null)return false;
 const model=candidateModelVersion(row.evidence_json);
 if(!versionParts(model,'model')||!versionParts(currentModelVersion,'model'))return false;
 if(isOlderModelVersion(currentModelVersion,model))return false; // never downgrade
 const reason=discardReason(row.evidence_json);
 if(reason==='manual')return false;
 if(reason && reason!=='version_incompatible')return false;
 const build=discardedInBuild(row.evidence_json);
 // Explicit incompatibilities can be reconsidered next scan when a freshly
 // calculated compatible candidate exists, including the same app build.
 if(reason==='version_incompatible')return hasVersionIncompatibility(row,currentModelVersion)||Boolean(build&&isOlderBuildVersion(build,currentBuild));
 // Old releases lacked a reason marker. Their historical discards are only
 // reconsidered for demonstrably outdated models or FREE -> GOLD migration.
 // Same-model manual discards are intentionally NOT revived on app upgrade.
 return hasVersionIncompatibility(row,currentModelVersion);
}
