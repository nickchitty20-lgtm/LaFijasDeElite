import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateMatch,modelReadiness,fixtureTimestamp,vipSampleGaps,VIP_RISK_POLICY,NATIONAL_VIP_RISK_POLICY,
  NATIONAL_MODEL_SETTINGS,MODEL_VERSION,walkForwardBacktest} from '../src/nforce-model.js';
import {fitOpponentRatings} from '../src/nforce-strength.js';
import {evaluateVipEvidence} from '../src/nforce-vip-gate.js';

const DAY=86400000;
const iso=d=>new Date(d).toISOString();
const teams=['Argentina','France','Spain','Croatia','Germany','Brazil','England','Turkey'];
const base=Date.parse('2026-07-25T12:00:00Z');
function internationalHistory(n=210){
 return Array.from({length:n},(_,i)=>{
  const home=teams[i%8],away=teams[(i+1+(Math.floor(i/8)%6))%8];
  return {competition:i%3===0?'int.friendly':i%3===1?'int.wcqual':'int.unl',
   home,away,date:iso(base-(n-i)*3*DAY).slice(0,10),kickoff:null,
   home_goals:i%4,away_goals:(i+1)%3};
 }).filter(m=>m.home!==m.away);
}

test('v1.9: partidos internacionales con fecha pero sin hora participan en el ajuste de rivales, sin datos futuros',()=>{
 const history=internationalHistory();
 const target={competition:'int.unl',home:'Argentina',away:'France',kickoff:'2026-11-14T17:00:00Z'};
 const report=modelReadiness(target,history);
 assert.equal(report.ready,true,JSON.stringify(report));
 const before=estimateMatch(target,history);
 assert.ok(before);
 assert.equal(before.history_group,'selecciones');
 assert.equal(before.decay_days,NATIONAL_MODEL_SETTINGS.decayDays);
 assert.equal(before.opponent_model.active,true,'El archivo internacional con fecha sola debe alimentar el ajuste de rivales');
 const withFuture=estimateMatch(target,[...history,{...history[0],date:'2026-11-16',home_goals:25,away_goals:0}]);
 assert.deepEqual(withFuture,before,'No incorporar resultados después del corte');
 assert.equal(fixtureTimestamp(history[0]),Date.parse(`${history[0].date}T23:59:59.999Z`));
});

test('VIP internacionales: la ventana de actividad difiere de clubes; muestra, calidad y robustez no cambian',()=>{
 assert.equal(NATIONAL_VIP_RISK_POLICY.maxFormAgeDays,NATIONAL_MODEL_SETTINGS.freshDays);
 assert.equal(VIP_RISK_POLICY.maxFormAgeDays,35);
 for(const key of ['minTeam','minLeague','minVenue','minEffective','minQuality','maxStressDrop','minStressed','minBaselineEdge'])
  assert.deepEqual(NATIONAL_VIP_RISK_POLICY[key],VIP_RISK_POLICY[key]);
 const model={history_group:'selecciones',quality:92,opponent_model:{active:true},sample:{
  home:24,away:23,league:250,home_venue:9,away_venue:9,home_effective:16,away_effective:15,
  age_home_days:121,age_away_days:134}};
 assert.deepEqual(vipSampleGaps(model),[]);
 const clubGaps=vipSampleGaps({...model,history_group:'liga'}).map(g=>g.code);
 assert.deepEqual(clubGaps,['home_form_days','away_form_days']);
 assert.equal(vipSampleGaps({...model,quality:72}).some(g=>g.code==='quality'),true);
 assert.equal(vipSampleGaps({...model,opponent_model:{active:false}}).some(g=>g.code==='opponent_model'),true);
});

test('VIP: los éxitos de clubes no sirven para autorizar selecciones sin backtest específico',()=>{
 const candidate={visibility:'vip',evidence_json:{model:{model:MODEL_VERSION,history_group:'selecciones'},pick:{key:'1X'}}};
 const strong={evaluated:65,correct:53,mean_forecast:82,mean_baseline:67,brier:0.14,baseline_brier:0.23};
 const validation={model_version:MODEL_VERSION,evaluated:180,created_at:new Date('2026-11-11T10:00:00Z'),
  metrics_json:{model:MODEL_VERSION,by_market:{'1X':strong},segments:{vip:{evaluated:30},free:{evaluated:40}}}};
 const now=new Date('2026-11-11T12:00:00Z');
 assert.equal(evaluateVipEvidence(candidate,validation,{asOf:now}).code,'missing_context_backtest');
 const few={...validation,metrics_json:{...validation.metrics_json,by_context:{club:{evaluated:150,by_market:{'1X':strong}},national:{evaluated:24,by_market:{'1X':strong}}}}};
 assert.equal(evaluateVipEvidence(candidate,few,{asOf:now}).code,'low_context_sample');
 const qualified={...validation,metrics_json:{...validation.metrics_json,by_context:{
  club:{evaluated:150,by_market:{'1X':strong}},national:{evaluated:90,by_market:{'1X':strong}}}}};
 assert.equal(evaluateVipEvidence(candidate,qualified,{asOf:now}).approved,true);
 const insufficient={...qualified,metrics_json:{...qualified.metrics_json,by_context:{...qualified.metrics_json.by_context,
  national:{evaluated:90,by_market:{'1X':{...strong,evaluated:12,correct:11}}}}}};
 assert.equal(evaluateVipEvidence(candidate,insufficient,{asOf:now}).code,'low_market_sample');
});

test('Backtest separado por clubes y selecciones informa cohortes no mezcladas',()=>{
 const international=internationalHistory(175);
 const clubDates=Array.from({length:170},(_,i)=>({competition:'en.1',home:teams[i%8],away:teams[(i+3)%8],
  kickoff:iso(Date.parse('2026-08-01T12:00:00Z')-(170-i)*3*DAY),home_goals:i%4,away_goals:i%2}));
 const report=walkForwardBacktest([...international,...clubDates],{maxGames:80,now:new Date('2026-11-11T12:00:00Z')});
 assert.equal(report.attempted,160);
 assert.ok(report.by_context.national.evaluated>0);
 assert.ok(report.by_context.club.evaluated>0);
 assert.equal(report.by_context.national.evaluated+report.by_context.club.evaluated,report.evaluated);
 for(const group of Object.values(report.by_context)){
  assert.ok(group.evaluated>=0);
  assert.ok(group.by_market&&group.segments);
 }
});

test('Ajuste de rivales solo admite resultados con fecha íntegra y previa al corte',()=>{
 const cutoff=Date.parse('2026-11-11T12:00:00Z');
 const before=internationalHistory();
 const fit=fitOpponentRatings(before,cutoff,1.5,1.1,{fixtureTime:fixtureTimestamp,halfLife:360*Math.LN2});
 assert.ok(fit&&fit.trainedMatches>30);
 const after=fitOpponentRatings([...before,{...before[0],date:'2026-11-11',home_goals:25}],cutoff,1.5,1.1,
  {fixtureTime:fixtureTimestamp,halfLife:360*Math.LN2});
 assert.equal(after.trainedMatches,fit.trainedMatches);
 assert.equal(fitOpponentRatings(before,cutoff,1.5,1.1),null,'Sin hora no se debe inferir un horario de inicio en la ruta original');
});
