/**
 * N-FORCE ML 0.1: tiny, regularised multinomial logistic classifier.
 * It learns from genuine previously finished matches and time-ordered
 * out-of-sample holdouts. No external AI service, names, odds or prompt input.
 *
 * This is an owner-only RESEARCH forecast. It cannot approve a pick or modify
 * the publish/settlement flow. A lower Brier on one holdout is not proof of
 * future accuracy; promotion into automated decisions requires more evidence.
 */
export const AI_MODEL_VERSION='nforce-ml-0.1';
const clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
const round=(v,places=4)=>Number(v.toFixed(places));
const KEYS=['home','draw','away'];
const VECTOR_SIZE=8;
const MIX=0.30;

/** Features available at prediction time only; no future goals or outcomes. */
export function featureVector(forecast){
 const p=forecast?.probabilities||{},s=forecast?.sample||{},l=forecast?.lambda||{};
 const values=[
  1,
  clamp((Number(p.home)-Number(p.away))/100),
  clamp((Number(p.draw)-26)/36),
  clamp((Number(l.home)-Number(l.away))/3),
  clamp((Number(l.home)+Number(l.away)-2.5)/3),
  clamp((Number(s.home_effective)-Number(s.away_effective))/15),
  clamp((Number(forecast.quality)-70)/35),
  clamp((Number(s.age_away_days)-Number(s.age_home_days))/180)
 ];
 return values.every(Number.isFinite)?values:null;
}
const baseProbabilities=f=>KEYS.map(k=>Number(f.probabilities?.[k])/100);
const validProbabilities=p=>p.length===3&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<0.02;
const normalise=p=>{const sum=p.reduce((a,b)=>a+b,0);return p.map(x=>x/sum);};
const softmax=scores=>{const top=Math.max(...scores),exp=scores.map(v=>Math.exp(Math.max(-80,v-top)));return normalise(exp);};
const score=(weights,features)=>softmax(weights.map(row=>row.reduce((acc,w,j)=>acc+w*features[j],0)));

/** Deterministic full-batch gradient descent; L2 regularisation prevents extreme weights. */
function fit(samples,{epochs=260,learningRate=0.17,l2=0.08}={}){
 const weights=Array.from({length:3},()=>Array(VECTOR_SIZE).fill(0));
 for(let epoch=0;epoch<epochs;epoch++){
  const gradient=Array.from({length:3},()=>Array(VECTOR_SIZE).fill(0));
  for(const item of samples){
   const p=score(weights,item.features);
   for(let k=0;k<3;k++){
    const delta=p[k]-Number(item.label===k);
    for(let j=0;j<VECTOR_SIZE;j++)gradient[k][j]+=delta*item.features[j];
   }
  }
  const step=learningRate/Math.max(1,samples.length);
  for(let k=0;k<3;k++)for(let j=0;j<VECTOR_SIZE;j++){
   weights[k][j]-=step*(gradient[k][j]+l2*weights[k][j]);
   weights[k][j]=clamp(weights[k][j],-6,6);
  }
 }
 return weights;
}
const brier=(probs,label)=>probs.reduce((sum,p,k)=>sum+(p-Number(k===label))**2,0);
const interpolate=(a,b,m=MIX)=>a.map((p,k)=>(1-m)*p+m*b[k]);

/**
 * Input rows are historical walk-forward forecasts, each computed only from
 * earlier matches. Split by kickoff before fitting, separately by context.
 */
export function trainAiForecastModels(rows=[]){
 const outputs={};
 for(const context of ['club','national']){
  const data=rows.filter(item=>item.context===context&&Number.isFinite(Number(item.kickoff))&&KEYS.includes(item.actual))
   .map(item=>({kickoff:Number(item.kickoff),features:featureVector(item.forecast),base:baseProbabilities(item.forecast),label:KEYS.indexOf(item.actual)}))
   .filter(item=>item.features&&validProbabilities(item.base))
   .sort((a,b)=>a.kickoff-b.kickoff);
  const minTotal=context==='national'?60:100,minTraining=context==='national'?45:75;
  const split=Math.floor(data.length*0.75),training=data.slice(0,split),holdout=data.slice(split);
  const enough=data.length>=minTotal&&training.length>=minTraining&&holdout.length>=15;
  if(!enough){outputs[context]={version:AI_MODEL_VERSION,status:'insufficient_data',available:data.length,
   required:minTotal,training:training.length,holdout:holdout.length,approved_for_publication:false};continue;}
  const initialWeights=fit(training);
  let oldBrier=0,aiBrier=0,hybridBrier=0;
  for(const item of holdout){
   const prediction=score(initialWeights,item.features);
   oldBrier+=brier(item.base,item.label);aiBrier+=brier(prediction,item.label);
   hybridBrier+=brier(interpolate(item.base,prediction),item.label);
  }
  const total=holdout.length,baseline=oldBrier/total,hybrid=hybridBrier/total;
  // Decide from chronological holdout, never from the training set.
  const beatsBaseline=hybrid<=baseline-0.005;
  // Retrain on all available past matches *after* evaluating the holdout.
  const finalWeights=fit(data);
  outputs[context]={version:AI_MODEL_VERSION,status:beatsBaseline?'promising_holdout':'no_improvement',
   training:training.length,holdout:total,available:data.length,
   holdout_baseline_brier:round(baseline),holdout_ai_brier:round(aiBrier/total),
   holdout_hybrid_brier:round(hybrid),holdout_delta:round(hybrid-baseline),
   holdout_last_match:new Date(holdout.at(-1).kickoff).toISOString(),
   trained_through:new Date(data.at(-1).kickoff).toISOString(),
   weights:finalWeights,blend:MIX,approved_for_publication:false,
   note:'Solo prueba retrospectiva cronológica. Ningún resultado futuro ni tasa de acierto garantizados.'};
 }
 return outputs;
}

/** The independent AI forecast is never substituted for the official Poisson. */
export function predictAiForecast(forecast,artifact){
 if(!forecast||artifact?.version!==AI_MODEL_VERSION||!Array.isArray(artifact.weights)||artifact.weights.length!==3)return null;
 const x=featureVector(forecast),base=baseProbabilities(forecast);
 if(!x||!validProbabilities(base)||artifact.weights.some(w=>!Array.isArray(w)||w.length!==VECTOR_SIZE||w.some(v=>!Number.isFinite(v)||Math.abs(v)>6)))return null;
 const learned=score(artifact.weights,x),blend=interpolate(base,learned);
 const pack=arr=>Object.fromEntries(KEYS.map((key,j)=>[key,round(100*arr[j],1)]));
 return {version:AI_MODEL_VERSION,status:artifact.status,poisson:pack(base),ai:pack(learned),
  hybrid:pack(blend),holdout:artifact.holdout,holdout_delta:artifact.holdout_delta,
  publication_authorized:false,explanation:'Comparación experimental. No aprueba pronósticos ni altera GOLD/VIP.'};
}
