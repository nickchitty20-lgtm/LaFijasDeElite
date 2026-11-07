import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFinalScore,eligibleResult,createNforceSettlement} from '../src/nforce-settlement.js';
import {summaryFromGroups,publicRecentResults} from '../src/performance-stats.js';
import {readFileSync} from 'node:fs';

const base={market:'Resultado final 1X2',selection:'Arsenal',homeTeam:'Arsenal',awayTeam:'Chelsea',homeGoals:3,awayGoals:1};
const pick=changes=>evaluateFinalScore({...base,...changes});

test('1X2 con marcador FT: gana, pierde y empate sin inventar pick',()=>{
 assert.equal(pick({}).outcome,'won');
 assert.equal(pick({homeGoals:0,awayGoals:2}).outcome,'lost');
 assert.equal(pick({selection:'Empate',homeGoals:2,awayGoals:2}).outcome,'won');
 assert.equal(pick({selection:'2',homeGoals:2,awayGoals:1}).outcome,'lost');
 assert.equal(pick({selection:'Real Madrid'}),null);
 assert.equal(pick({homeGoals:null}),null);
});
test('goles over/under 2.5 y asiáticos enteros; no apuesta diferente de la publicada',()=>{
 assert.equal(pick({market:'Total goles',selection:'Más de 2.5',homeGoals:2,awayGoals:1}).outcome,'won');
 assert.equal(pick({market:'Total goles',selection:'Under 2.5',homeGoals:2,awayGoals:1}).outcome,'lost');
 assert.equal(pick({market:'Más de 2.5 goles',selection:'Menos de 3.5',homeGoals:2,awayGoals:0}),null);
 assert.equal(pick({market:'Más de 2.5 goles',selection:'Menos de 2.5',homeGoals:2,awayGoals:0}),null);
 assert.equal(pick({market:'Total goles',selection:'Más de 2.0',homeGoals:1,awayGoals:1}).outcome,'void');
 assert.equal(pick({market:'Goles local',selection:'Más de 1.5'}),null);
 assert.equal(pick({market:'Total goles',selection:'2.5'}),null);
});
test('BTTS sí/no; mercados ambiguos permanecen pendientes',()=>{
 assert.equal(pick({market:'Ambos marcan',selection:'Sí'}).outcome,'won');
 assert.equal(pick({market:'Ambos marcan',selection:'No'}).outcome,'lost');
 assert.equal(pick({market:'BTTS',selection:'No',homeGoals:3,awayGoals:0}).outcome,'won');
 assert.equal(pick({market:'Doble oportunidad',selection:'1X'}),null);
 assert.equal(pick({market:'Resultado exacto',selection:'3-1'}),null);
});
const instant=new Date('2026-11-06T21:00:00Z');
const valid={outcome:'pending',kickoff:'2026-11-06T17:00:00Z',published_at:'2026-11-06T14:00:00Z',match_date:'2026-11-06T17:00:00Z',source_checked_at:'2026-11-06T20:30:00Z',scheduled_time_known:1,home_goals:1,away_goals:0};
test('sólo cotejar tras al menos 2 horas, calendario estable y fuente actualizada',()=>{
 assert.equal(eligibleResult(valid,instant),true);
 assert.equal(eligibleResult({...valid,home_goals:null},instant),false);
 assert.equal(eligibleResult({...valid,kickoff:'2026-11-06T20:00:00Z'},instant),false);
 assert.equal(eligibleResult({...valid,match_date:'2026-11-05T09:00:00Z'},instant),false);
 assert.equal(eligibleResult({...valid,match_date:'2026-11-06T16:30:00Z'},instant),false);
 assert.equal(eligibleResult({...valid,published_at:'2026-11-06T19:00:00Z'},instant),false);
 assert.equal(eligibleResult({...valid,source_checked_at:'2026-11-03T20:30:00Z'},instant),false);
 assert.equal(eligibleResult({...valid,outcome:'won'},instant),false);
 assert.equal(eligibleResult({...valid,scheduled_time_known:0},instant),false);
});
test('cotejo: transacción, auditoría, fuentes y no sobrescribir admin ni reejecutar cambios',async()=>{
 const rows=[
  {...valid,id:10,market:'Resultado final 1X2',selection:'Arsenal',homeTeam:'Arsenal',awayTeam:'Chelsea',home_goals:1,away_goals:0},
  {...valid,id:11,market:'Resultado final 1X2',selection:'Chelsea',homeTeam:'Arsenal',awayTeam:'Chelsea',home_goals:1,away_goals:0},
  {...valid,id:12,market:'Doble oportunidad',selection:'1X'},
  {...valid,id:13,market:'Resultado final 1X2',selection:'Arsenal',homeTeam:'Arsenal',awayTeam:'Chelsea',home_goals:1,away_goals:0,outcome:'won'},
 ];
 const effects=[],audits=[];
 let connection={
  async query(sql){if(sql.includes('GET_LOCK'))return [[{acquired:1}]];if(sql.includes('RELEASE_LOCK'))return [[{acquired:1}]];throw Error('SQL lock inesperado');},
  async execute(sql,args=[]){
   if(sql.includes('FROM football_candidates c'))return [rows.filter(r=>r.outcome==='pending')];
   if(sql.includes('FROM predictions WHERE id='))return [[rows.find(r=>r.id===args[0])]];
   if(sql.startsWith('UPDATE predictions')){
    const target=rows.find(r=>r.id===args[3]);if(target?.outcome!=='pending')return [{affectedRows:0}];
    target.outcome=args[0];effects.push({id:target.id,outcome:args[0],source:args[1],score:args[2]});return [{affectedRows:1}];
   }
   if(sql.includes('INSERT INTO audit_logs')){audits.push(args);return [{affectedRows:1}];}
   throw Error('SQL inesperado '+sql.slice(0,70));
  },
  async beginTransaction(){},async commit(){},async rollback(){},release(){}
 };
 const db={getConnection:async()=>connection};
 const worker=createNforceSettlement({db,now:()=>instant});
 const first=await worker.run();
 assert.equal(first.settled,2);assert.equal(first.won,1);assert.equal(first.lost,1);assert.equal(first.unsupported,1);
 assert.equal(effects.length,2);assert.equal(audits.length,2);assert.equal(effects[0].score,'1-0');
 assert.equal(effects[0].source,'nforce-openfootball');assert.equal(rows[3].outcome,'won');
 const repeated=await worker.run();assert.equal(repeated.settled,0);assert.equal(audits.length,2);
});
test('comparativa en primera pantalla y etiquetas de origen sin revelar cuotas VIP',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/landing.js',import.meta.url),'utf8');
 const a=html.indexOf('id="performanceQuickCards"');
 assert.ok(a>html.indexOf('class="hero wrap"')&&a<html.indexOf('class="metrics wrap"'));
 assert.match(js,/loadQuickPerformance/);assert.match(js,/source_checked/);
 const s=summaryFromGroups([{visibility:'vip',total:1,won:1,lost:0,void:0,source_checked:1,manual_checked:0}]);
 assert.equal(s.by_visibility.vip.source_checked,1);
 const recent=publicRecentResults([{id:4,visibility:'vip',outcome:'won',title:'Arsenal vs Chelsea',settlement_source:'nforce-openfootball',settlement_score:'3-0',market:'1X2',selection:'Chelsea',analysis:'privada',odds:20}]);
 assert.equal(recent[0].score,'3-0');assert.equal(recent[0].result_source,'automatic');
 assert.ok(!('selection' in recent[0]));assert.ok(!('odds' in recent[0]));assert.ok(!('analysis' in recent[0]));
});
