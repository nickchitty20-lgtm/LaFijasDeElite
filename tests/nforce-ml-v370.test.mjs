import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_MODEL_VERSION,featureVector,trainAiForecastModels,predictAiForecast} from '../src/nforce-ml.js';
import {walkForwardBacktest} from '../src/nforce-model.js';

function forecast(home=45,draw=25,away=30){
 return {probabilities:{home,draw,away},lambda:{home:1.3,away:1.1},
  sample:{home_effective:14,away_effective:13,age_home_days:12,age_away_days:18},quality:84};
}
function samples(n,context='club'){
 const start=Date.UTC(2024,0,1);
 return Array.from({length:n},(_,i)=>{
  const home=34+(i%4)*8,draw=22+(i%3)*2,away=100-home-draw;
  return {context,kickoff:start+i*86400000,forecast:forecast(home,draw,away),actual:i%5===0?'draw':i%2===0?'home':'away'};
 });
}

test('La IA no entrena ni inventa probabilidades sin muestra histórica',()=>{
 const learned=trainAiForecastModels(samples(12));
 assert.equal(learned.club.status,'insufficient_data');
 assert.equal(learned.national.status,'insufficient_data');
 assert.equal(predictAiForecast(forecast(),learned.club),null);
});

test('La IA entrena dos grupos independientes y separa el holdout cronológico',()=>{
 const learned=trainAiForecastModels([...samples(120),...samples(64,'national')]);
 for(const [context,total] of [['club',120],['national',64]]){
  const model=learned[context];
  assert.equal(model.version,AI_MODEL_VERSION);
  assert.equal(model.available,total);
  assert.ok(model.training>=45&&model.holdout>=15);
  assert.equal(model.training+model.holdout,total);
  assert.equal(model.approved_for_publication,false);
  assert.ok(Number.isFinite(model.holdout_hybrid_brier));
  assert.ok(Number.isFinite(model.holdout_baseline_brier));
  assert.ok(model.weights.every(row=>row.length===8&&row.every(Number.isFinite)));
  const prediction=predictAiForecast(forecast(),model);
  assert.ok(prediction);
  for(const key of ['poisson','ai','hybrid']){
   for(const x of Object.values(prediction[key]))assert.ok(x>=0&&x<=100);
   assert.ok(Math.abs(Object.values(prediction[key]).reduce((a,b)=>a+b,0)-100)<=0.2);
  }
  assert.equal(prediction.publication_authorized,false);
 }
});

test('La IA no acepta características no finitas ni pesos manipulados',()=>{
 const model=trainAiForecastModels(samples(110)).club;
 assert.equal(featureVector({...forecast(),quality:NaN}),null);
 assert.equal(predictAiForecast({...forecast(),quality:NaN},model),null);
 assert.equal(predictAiForecast(forecast(),{...model,weights:[[1,2],[1,2],[1,2]]}),null);
 assert.equal(predictAiForecast(forecast(),{...model,weights:[[1e10,...Array(7).fill(0)],...model.weights.slice(1)]}),null);
});

test('Walk-forward devuelve datos de entrenamiento para IA sin aprobar publicaciones',()=>{
 const result=walkForwardBacktest([]);
 assert.equal(result.ai_models.club.status,'insufficient_data');
 assert.equal(result.ai_models.national.status,'insufficient_data');
 assert.equal(result.validated,false);
});
