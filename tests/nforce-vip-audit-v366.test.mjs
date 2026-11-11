import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreDistribution,makeCandidate,MODEL_VERSION} from '../src/nforce-model.js';
import {summarizeVipScan,summarizeVipDatabase} from '../src/nforce-vip-diagnostic.js';

function validVipDraft(){
 const h=1.8,a=.6,p={home:0,draw:0,away:0},totals={over15:0,over25:0,under25:0,btts:0};
 for(const c of scoreDistribution(h,a)){
  p[c.home>c.away?'home':c.home<c.away?'away':'draw']+=c.p;
  if(c.home+c.away>=2)totals.over15+=c.p;
  if(c.home+c.away>=3)totals.over25+=c.p;else totals.under25+=c.p;
  if(c.home>0&&c.away>0)totals.btts+=c.p;
 }
 const pct=n=>Number((n*100).toFixed(1));
 const model={model:MODEL_VERSION,lambda:{home:h,away:a},previous_lambda:{home:h*.98,away:a*1.02},
  selected:'home',confidence:pct(p.home),margin:pct(p.home-Math.max(p.draw,p.away)),
  probabilities:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,pct(v)])),
  totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,pct(v)])),
  opponent_model:{active:true},quality:93,score:'2-1',score_probability:12,
  sample:{home:27,away:26,league:220,home_venue:12,away_venue:12,home_effective:18,away_effective:17,age_home_days:3,age_away_days:5},
  leagueBaseline:{home:42,draw:25,away:33,over15:68,over25:54,under25:46,btts:52,noBtts:48,oneX:67,xTwo:58,oneTwo:75}};
 const match={id:89,home:'Local',away:'Visitante',kickoff:'2026-12-09T19:00:00Z',scheduled_time_known:true,league:'Liga',season:'2026'};
 const c=makeCandidate(match,model);
 assert.equal(c.visibility,'vip');
 return {...c,status:'draft'};
}
const now=new Date('2026-11-11T12:00:00Z');

test('diagnóstico VIP separa partidos de rechazos por mercado',()=>{
 const report=summarizeVipScan({ok:true,fixtures_in_window:3,modeled:2,eligible_by_category:{vip:0,gold:1},
  insufficient_history:1,below_filters:1,vip_rejections_by_market_reason:{insufficient_recent_evidence:12,fragile_prediction:3}});
 assert.equal(report.modeled,2);assert.equal(report.eligible_vip,0);
 assert.match(report.meaning,/NO|no son|No son/i);
 assert.equal(report.rejection_by_market[0].count,12);
});
test('sin datos de Railway el diagnóstico no inventa por qué hay cero VIP',()=>{
 const report=summarizeVipDatabase({asOf:now});
 assert.match(report.diagnosis,/falta un escaneo reciente/);
 assert.equal(report.validated,0);
});
test('VIP real detectada, pero falta backtest: bloqueada y motivo explícito',()=>{
 const row=validVipDraft();
 const report=summarizeVipDatabase({rows:[row],total:{vip_drafts:1,total_drafts:1},asOf:now,scan:{ok:true,fixtures_in_window:1,modeled:1,eligible_by_category:{vip:1}}});
 assert.equal(report.publishable_by_model,1);
 assert.equal(report.validated,0);
 assert.equal(report.blocked_by_backtest,1);
 assert.equal(report.validation_reasons.missing_backtest,1);
});
test('muestra histórica suficiente puede validar VIP sin crear pronósticos artificiales',()=>{
 const row=validVipDraft();const pick=JSON.parse(row.evidence_json).pick;
 const validation={model_version:MODEL_VERSION,created_at:now,evaluated:130,metrics_json:{model:MODEL_VERSION,
  by_market:{[pick.key]:{evaluated:60,correct:48,mean_forecast:Number(pick.probability)-3,
   mean_baseline:Number(pick.baseline)-5,brier:.12,baseline_brier:.3}}}};
 const report=summarizeVipDatabase({rows:[row],total:{vip_drafts:1,total_drafts:1},validation,asOf:now,telegramReady:true});
 assert.equal(report.validated,1,JSON.stringify(report));
 assert.equal(report.examples.length,0);
 assert.match(report.diagnosis,/VIP validadas/);
});
test('reanalizar candidato desactualizado sigue obligatorio; ninguna vía de publicación nueva',()=>{
 const row=validVipDraft();row.evidence_json=JSON.stringify({...JSON.parse(row.evidence_json),model:{model:'viejo'}});
 const report=summarizeVipDatabase({rows:[row],total:{vip_drafts:1,total_drafts:1},asOf:now});
 assert.equal(report.validated,0);assert.equal(report.blocked_by_model,1);
});
