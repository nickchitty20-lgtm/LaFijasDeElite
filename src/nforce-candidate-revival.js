/** Controlled reopening of previously discarded N-FORCE candidates.
 * Before v3.4.1 discard actions were not stamped with an application build;
 * such records are legacy discards. New discards always record the build, so
 * a repeat scan in the same release must respect the owner's decision.
 */
export const CANDIDATE_REVIEW_BUILD='3.4.1';
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
export const isOlderModelVersion=(stored,current)=>compareVersions(stored,current,'model');
export const isOlderBuildVersion=(stored,current)=>compareVersions(stored,current,'build');
export function canReopenOldDiscard(row,currentModelVersion,currentBuild=CANDIDATE_REVIEW_BUILD){
 if(!row||row.status!=='discarded'||row.prediction_id!=null||row.published_at!=null)return false;
 const model=candidateModelVersion(row.evidence_json);
 if(!versionParts(model,'model')||!versionParts(currentModelVersion,'model'))return false;
 const build=discardedInBuild(row.evidence_json);
 // A stamped current-build discard always wins, even if its forecast was old.
 if(build)return isOlderBuildVersion(build,currentBuild)&&!isOlderBuildVersion(currentModelVersion,model);
 // Legacy un-stamped discards necessarily pre-date the first stamping release;
 // allow one fresh evaluation, but only for a model not newer than the current.
 return !isOlderModelVersion(currentModelVersion,model);
}
