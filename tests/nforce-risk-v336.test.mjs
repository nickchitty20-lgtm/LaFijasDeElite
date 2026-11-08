import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreDistribution,selectMarket,vipRiskAssessment,makeCandidate,VIP_RISK_POLICY,MODEL_VERSION} from '../src/nforce-model.js';
import {canAutoPublishCandidate} from '../src/football-publication-policy.js';
import {publishedFootballDetails} from '../src/football-report.js';

function genuineModel(h=1.8,a=.6){
 const p={home:0,draw:0,away:0},t={over15:0,over25:0,under25:0,btts:0};
 for(const cell of scoreDistribution(h,a)){
  p[cell.home>cell.away?'home':cell.home<cell.away?'away':'draw']+=cell.p;
  if(cell.home+cell.away>=2)t.over15+=cell.p;
  if(cell.home+cell.away>=3)t.over25+=cell.p;else t.under25+=cell.p;
  if(cell.home>0&&cell.away>0)t.btts+=cell.p;
 }
 const r=v=>Number((v*100).toFixed(1)),order=Object.keys(p).sort((x,y)=>p[y]-p[x]);
 return {model:MODEL_VERSION,lambda:{home:h,away:a},previous_lambda:{home:h*.98,away:a*1.02},
  selected:order[0],confidence:r(p[order[0]]),margin:r(p[order[0]]-p[order[1]]),
  probabilities:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,r(v)])),
  totals:Object.fromEntries(Object.entries(t).map(([k,v])=>[k,r(v)])),
  opponent_model:{active:true},quality:93,score:'2-1',score_probability:12,
  sample:{home:27,away:26,league:220,home_venue:12,away_venue:12,home_effective:18,away_effective:17,age_home_days:3,age_away_days:5},
  leagueBaseline:{home:42,draw:25,away:33,over15:68,over25:54,under25:46,btts:52,noBtts:48,oneX:67,xTwo:58,oneTwo:75}};
}
const match={id:63,home:'Alpha',away:'Beta',kickoff:'2026-11-10T18:00:00Z',scheduled_time_known:true,league:'Demo',season:'2026'};

test('modelo 1.5 no asciende a VIP solo por porcentaje alto si falta historial reciente',()=>{
 const strong=genuineModel();
 const top=selectMarket(match,strong);
 assert.equal(top.visibility,'vip');
 assert.ok(top.robustness.worst_scenario>=VIP_RISK_POLICY.minStressed);
 for(const sample of [
  {...strong.sample,home:12}, {...strong.sample,home_venue:0},
  {...strong.sample,home_effective:5}, {...strong.sample,age_away_days:90}]){
  const bad=selectMarket(match,{...strong,sample});
  assert.notEqual(bad?.visibility,'vip');
 }
 assert.notEqual(selectMarket(match,{...strong,opponent_model:{active:false}})?.visibility,'vip');
 assert.notEqual(selectMarket(match,{...strong,quality:75})?.visibility,'vip');
});

test('probabilidades no compatibles con los goles esperados no se consideran VIP',()=>{
 const model=genuineModel();
 const fake={...model,probabilities:{...model.probabilities,home:99,draw:1,away:0},confidence:99,margin:98};
 assert.notEqual(selectMarket(match,fake)?.visibility,'vip');
 const excessive={...model,previous_lambda:{home:.65,away:2.7}};
 assert.notEqual(selectMarket(match,excessive)?.visibility,'vip');
 const r=vipRiskAssessment({key:'1X',probability:99,baseline:67},model);
 assert.equal(r.code,'inconsistent_probability');
});

test('VIP robusta trazable; modificaciones manuales de selección no pasan el filtro',()=>{
 const candidate=makeCandidate(match,genuineModel());
 assert.equal(candidate.visibility,'vip');
 assert.equal(canAutoPublishCandidate({...candidate,status:'draft'}),true);
 assert.equal(canAutoPublishCandidate({...candidate,status:'draft',selection:'X2'}),false);
 const evidence=JSON.parse(candidate.evidence_json);
 assert.equal(evidence.pick.robustness.approved,true);
 assert.ok(evidence.pick.robustness.worst_scenario>0);
 assert.match(candidate.analysis,/Prueba de sensibilidad/);
 assert.match(candidate.analysis,/NO intervalo de confianza/);
 assert.ok(publishedFootballDetails(candidate.evidence_json)?.model_goals);
});
