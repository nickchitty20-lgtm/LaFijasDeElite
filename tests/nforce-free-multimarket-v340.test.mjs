import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreDistribution, selectMarket, makeCandidate, selectedMarketWon, MODEL_VERSION} from '../src/nforce-model.js';
import {canAutoPublishCandidate} from '../src/football-publication-policy.js';
import {evaluateFinalScore} from '../src/nforce-settlement.js';

const r=x=>Number((100*x).toFixed(1));
function fixtureModel(home=1.6,away=1.3){
 const p={home:0,draw:0,away:0},t={over15:0,over25:0,under25:0,btts:0};
 for(const c of scoreDistribution(home,away)){
  p[c.home>c.away?'home':c.home<c.away?'away':'draw']+=c.p;
  if(c.home+c.away>=2)t.over15+=c.p;
  if(c.home+c.away>=3)t.over25+=c.p;
  else t.under25+=c.p;
  if(c.home&&c.away)t.btts+=c.p;
 }
 const order=Object.keys(p).sort((a,b)=>p[b]-p[a]);
 return {model:MODEL_VERSION,lambda:{home,away},previous_lambda:{home:home*0.98,away:away*1.02},
  probabilities:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,r(v)])),
  totals:Object.fromEntries(Object.entries(t).map(([k,v])=>[k,r(v)])),
  selected:order[0],confidence:r(p[order[0]]),margin:r(p[order[0]]-p[order[1]]),
  opponent_model:{active:true},quality:78,sample:{home:16,away:16,league:120},
  score:'1-1',score_probability:12,leagueBaseline:{home:45,draw:25,away:30,over15:63,over25:85,
   under25:85,btts:88,noBtts:88,oneX:90,xTwo:90,oneTwo:90}};
}
const match={id:12345,home:'Equipo A',away:'Equipo B',league:'Demo',competition:'demo',season:'2026',
 kickoff:'2026-11-19T14:00:00Z',scheduled_time_known:true};
test('GRATIS evalúa goles incluso cuando VIP rechaza historial reciente insuficiente',()=>{
 const m=fixtureModel(); const pick=selectMarket(match,m);
 assert.equal(pick.visibility,'free');assert.equal(pick.market,'Total goles');
 assert.equal(pick.selection,'Más de 1.5');assert.ok(pick.free_screen.approved);
 const c=makeCandidate(match,m);assert.equal(c.market,'Total goles');
 assert.ok(canAutoPublishCandidate({...c,status:'draft'}));
 assert.equal(selectedMarketWon(c,{home_goals:2,away_goals:0}),true);
 assert.equal(selectedMarketWon(c,{home_goals:1,away_goals:0}),false);
 assert.equal(evaluateFinalScore({market:c.market,selection:c.selection,homeGoals:2,awayGoals:0}).outcome,'won');
});
test('GRATIS admite doble oportunidad con frecuencia de liga distinta y sin prometer acierto',()=>{
 const m=fixtureModel(1.8,0.65);m.leagueBaseline={home:85,draw:85,away:85,over15:95,over25:95,under25:95,
  btts:95,noBtts:95,oneX:60,xTwo:95,oneTwo:95};
 const p=selectMarket(match,m);
 assert.equal(p.visibility,'free');assert.equal(p.market,'Doble oportunidad');assert.equal(p.selection,'1X');
 const c=makeCandidate(match,m);
 assert.equal(selectedMarketWon(c,{home_goals:0,away_goals:0}),true);
 assert.equal(selectedMarketWon(c,{home_goals:0,away_goals:2}),false);
});
test('GRATIS admite ambos marcan con evidencia y rechaza probabilidades artificiales',()=>{
 const m=fixtureModel(1.6,1.6);m.leagueBaseline={home:85,draw:85,away:85,over15:95,over25:95,
  under25:95,btts:44,noBtts:95,oneX:95,xTwo:95,oneTwo:95};
 const p=selectMarket(match,m);
 assert.equal(p.visibility,'free');assert.equal(p.market,'Ambos marcan');assert.equal(p.selection,'Sí');
 assert.equal(selectedMarketWon(makeCandidate(match,m),{home_goals:1,away_goals:2}),true);
 const fake={...m,totals:{...m.totals,btts:99}};
 assert.notEqual(selectMarket(match,fake)?.key,'bttsYes');
});
test('Mercados alternativos GRATIS no se habilitan por un porcentaje alto sin historial, frecuencia o sensibilidad',()=>{
 const m=fixtureModel();
 for(const bad of [
  {...m,quality:48,confidence:39,margin:4},
  {...m,sample:{...m.sample,home:6},confidence:39,margin:4},
  {...m,leagueBaseline:{},confidence:39,margin:4},
  {...m,previous_lambda:undefined,confidence:39,margin:4},
 ])assert.equal(selectMarket(match,bad),null);
});
test('Diagnóstico VIP registra motivos por mercado sin alterar categoría',()=>{
 const d={};selectMarket(match,fixtureModel(),d);
 assert.ok(Object.values(d.vip_rejections).reduce((n,v)=>n+v,0)>0);
 assert.ok(Object.keys(d.vip_rejections).some(x=>x==='insufficient_recent_evidence'));
 assert.ok(d.free_eligible_markets>=1);
});
