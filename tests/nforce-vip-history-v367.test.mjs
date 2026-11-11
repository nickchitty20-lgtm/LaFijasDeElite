import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowedDatasets,fetchOpenFootball,HISTORICAL_SEASONS,LEAGUES} from '../src/nforce-data.js';
import {MODEL_VERSION,MODEL_SETTINGS,modelReadiness,estimateMatch,vipSampleGaps,VIP_RISK_POLICY} from '../src/nforce-model.js';
import {summarizeVipScan} from '../src/nforce-vip-diagnostic.js';

const date=new Date('2026-11-11T12:00:00Z');
const past=(n)=>new Date(date.getTime()-n*86400000).toISOString();

test('historial: tres temporadas por liga, sin URL arbitraria ni temporadas futuras',async()=>{
 const datasets=allowedDatasets(date),paths=datasets.map(x=>x.path);
 assert.equal(HISTORICAL_SEASONS,3);
 assert.equal(datasets.length,LEAGUES.length*3);
 assert.ok(paths.includes('2024-25/en.1.json'));
 assert.ok(paths.includes('2025-26/en.1.json'));
 assert.ok(paths.includes('2026-27/en.1.json'));
 assert.ok(paths.includes('2024/br.1.json'));
 assert.ok(paths.includes('2025/br.1.json'));
 assert.ok(paths.includes('2026/br.1.json'));
 assert.ok(!paths.includes('2027-28/en.1.json'));
 let calls=0;
 await assert.rejects(fetchOpenFootball({...datasets[0],path:'2021-22/en.1.json'}, {fetcher:async()=>{calls++;}}),/no autorizada/);
 assert.equal(calls,0);
});

test('modelo usa partido antiguo real dentro de 900 días, pero exige actividad reciente',()=>{
 assert.equal(MODEL_SETTINGS.lookbackDays,900);
 assert.equal(MODEL_SETTINGS.freshDays,90);
 assert.equal(MODEL_VERSION,'nforce-poisson-1.7');
 const teams=['A','B','C','D','E','F'];
 const older=Array.from({length:72},(_,i)=>({competition:'en.1',home:teams[i%6],away:teams[(i+1+i%5)%6],
  kickoff:past(820-i*2),home_goals:1+i%3,away_goals:i%2})).filter(x=>x.home!==x.away);
 const current=Array.from({length:18},(_,i)=>({competition:'en.1',home:teams[i%6],away:teams[(i+1)%6],
  kickoff:past(25-i),home_goals:1+i%3,away_goals:i%2}));
 const target={competition:'en.1',home:'A',away:'B',kickoff:past(-2)};
 const before=modelReadiness(target,current);
 assert.equal(before.ready,false);
 const after=modelReadiness(target,[...older,...current]);
 assert.equal(after.ready,true,JSON.stringify(after));
 const model=estimateMatch(target,[...older,...current]);
 assert.ok(model&&model.sample.home>=MODEL_SETTINGS.minTeam);
 const withFuture=estimateMatch(target,[...older,...current,
  {...current[0],kickoff:past(-4),home_goals:20,away_goals:0}]);
 assert.deepEqual(model,withFuture,'Un resultado posterior al inicio no puede contaminar el modelo');
});

test('faltantes VIP detallan únicamente umbrales reales sin alterar la política',()=>{
 const model={quality:85,sample:{home:17,away:24,league:130,home_venue:3,away_venue:7,
  home_effective:10,away_effective:12,age_home_days:9,age_away_days:32},opponent_model:{active:true}};
 const gaps=vipSampleGaps(model);
 assert.deepEqual(gaps.map(g=>g.code),['quality','home_matches','league_matches','home_venue','home_effective','away_form_days']);
 assert.deepEqual(gaps.find(x=>x.code==='home_venue'),{code:'home_venue',label:'Partidos del local en casa',current:3,required:VIP_RISK_POLICY.minVenue});
 assert.deepEqual(gaps.find(x=>x.code==='away_form_days').comparison,'max');
 assert.equal(vipSampleGaps({...model,opponent_model:{active:false}}).some(x=>x.code==='opponent_model'),true);
});

test('diagnóstico separa ausencias por partido de rechazos por mercado',()=>{
 const scan=summarizeVipScan({ok:true,fixtures_in_window:28,modeled:3,
  eligible_by_category:{vip:0,gold:0},vip_sample_gap_fixtures:3,
  vip_sample_gaps_by_requirement:{home_venue:3,quality:1},
  vip_sample_gap_examples:[{match:'A vs B',missing:[{code:'home_venue',label:'Partidos del local en casa',current:4,required:6}]}],
  model_missing_examples:[{match:'C vs D',reason:'team_history',sample:{home:5,away:7,league:190},required:{home:7,away:7,league:36}}],
  vip_rejections_by_market_reason:{insufficient_recent_evidence:27}});
 assert.equal(scan.sample_gap_fixtures,3);
 assert.equal(scan.rejection_by_market[0].count,27);
 assert.equal(scan.sample_gaps_by_requirement[0].count,3);
 assert.equal(scan.sample_gap_examples[0].match,'A vs B');
 assert.equal(scan.model_missing_examples[0].reason,'team_history');
});

test('panel muestra las carencias concretas; no ofrece aprobar por bypass',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/sample_gap_examples/);
 assert.match(js,/sample_gaps_by_requirement/);
 const model=readFileSync(new URL('../src/nforce-model.js',import.meta.url),'utf8');
 assert.match(model,/Días desde último partido/);
});
