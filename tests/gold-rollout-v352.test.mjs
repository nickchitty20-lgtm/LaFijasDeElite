import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyAutomaticCandidate,shouldBlockLegacyFreeDraft,GOLD_ROLLOUT} from '../src/nforce-gold-transition.js';
import {canAutoPublishCandidate} from '../src/football-publication-policy.js';
import {VIP_PRICE_TARGETS,VIP_PRICE_MIGRATION,applyVipPriceIncrease} from '../src/vip-pricing.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('automatically generated FREE proposal is delivered as GOLD without altering probabilities or outcome evidence',()=>{
 const free={visibility:'free',provider_probability:48.2,selection:'Equipo A',analysis:'Cribado GRATIS multimerkado. Esta propuesta gratuita tiene alta incertidumbre.',evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.6'},pick:{probability:48.2}})};
 const classified=classifyAutomaticCandidate(free);
 assert.equal(classified.visibility,'gold');
 assert.equal(free.visibility,'free');
 assert.equal(classified.provider_probability,48.2);
 assert.equal(classified.selection,'Equipo A');
 assert.equal(JSON.parse(classified.evidence_json).distribution.rollout,GOLD_ROLLOUT);
 assert.equal(JSON.parse(classified.evidence_json).pick.probability,48.2);
 assert.match(classified.analysis,/GOLD/);
 assert.doesNotMatch(classified.analysis,/propuesta gratuita/);
});
test('GOLD can pass unchanged statistical publication checks without being mistaken for free or VIP',async()=>{
 const m={model:'nforce-poisson-1.6',sample:{home:20,away:20,league:140},
  lambda:{home:1.6,away:1.3},previous_lambda:{home:1.568,away:1.326},
  probabilities:{home:45,draw:26,away:29},totals:{over15:78,over25:60,under25:40,btts:65},
  selected:'home',confidence:45,margin:16,quality:78,score:'1-1',score_probability:12,
  leagueBaseline:{home:45,draw:25,away:30,over15:63,over25:85,under25:85,btts:88,noBtts:88,oneX:90,xTwo:90,oneTwo:90}};
 // Publication evidence must originate from N-FORCE's own market selector.
 const {makeCandidate}=await import('../src/nforce-model.js');
 const match={id:7,home:'Local',away:'Visita',league:'Demo',competition:'demo',season:'2026',
  kickoff:'2026-11-22T19:00:00Z',scheduled_time_known:true};
 const selected=makeCandidate(match,m);
 assert.ok(selected,'El modelo debe producir un pronóstico para esta prueba');
 const paid=classifyAutomaticCandidate(selected);
 assert.equal(canAutoPublishCandidate({...paid,status:'draft'}),true);
 const withoutEvidence={...paid,evidence_json:JSON.stringify({...JSON.parse(paid.evidence_json),distribution:undefined})};
 assert.equal(canAutoPublishCandidate({...withoutEvidence,status:'draft'}),false);
});
test('VIP stays VIP, legacy FREE already published is never retroactively changed' ,()=>{
 const vip={visibility:'vip',status:'draft'};
 assert.equal(classifyAutomaticCandidate(vip),vip);
 assert.equal(shouldBlockLegacyFreeDraft({status:'draft',visibility:'free',provider:'nforce-openfootball'}),true);
 assert.equal(shouldBlockLegacyFreeDraft({status:'published',visibility:'free',provider:'nforce-openfootball'}),false);
 assert.equal(shouldBlockLegacyFreeDraft({status:'draft',visibility:'gold',provider:'nforce-openfootball'}),false);
});
test('both scan and manual refresh map current free-market candidates to paid GOLD, and publishing guards stale FREE drafts',()=>{
 const engine=source('src/nforce-engine.js');
 assert.match(engine,/classifyAutomaticCandidate\(makeCandidate\(m,model,marketDiagnostics\)\)/);
 assert.match(engine,/classifyAutomaticCandidate\(makeCandidate\(fixture,model\)\)/);
 assert.match(engine,/shouldBlockLegacyFreeDraft\(row\)/);
 assert.match(engine,/categoryCounts=\{free:0,gold:0,vip:0\}/);
 assert.match(source('src/server.js'),/p.visibility==='gold'\?queueGoldPrediction/);
});
test('VIP pricing policy increases new plan prices, without repricing old payments, and is applied only once',async()=>{
 assert.deepEqual(VIP_PRICE_TARGETS,{7:89.9,30:249.9,90:649.9});
 const calls=[];let once=true;
 const conn={
  query:async sql=>{calls.push(sql);return [[]]},
  beginTransaction:async()=>{calls.push('begin');},
  execute:async(sql,args)=>{calls.push([sql,args]);return [{affectedRows:sql.startsWith('INSERT IGNORE')?(once?1:0):3}];},
  commit:async()=>{calls.push('commit')},rollback:async()=>{calls.push('rollback')}
 };
 const result=await applyVipPriceIncrease(conn);
 assert.deepEqual(result,{applied:true,updated:3});
 assert.ok(calls.some(x=>Array.isArray(x)&&x[0].includes('UPDATE plans')&&x[0].includes("tier='vip'")));
 assert.ok(!calls.some(x=>Array.isArray(x)&&/UPDATE (payments|memberships)/.test(x[0])));
 once=false;calls.length=0;
 assert.deepEqual(await applyVipPriceIncrease(conn),{applied:false,updated:0});
 assert.ok(!calls.some(x=>Array.isArray(x)&&x[0].includes('UPDATE plans')));
 assert.ok(calls.some(x=>Array.isArray(x)&&x[1]?.[0]===VIP_PRICE_MIGRATION));
});
