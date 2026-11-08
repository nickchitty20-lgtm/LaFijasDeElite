import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedDatasets,seasonForDate,zonedKickoff,normalizeOpenFootball,stableFixtureId,fetchOpenFootball} from '../src/nforce-data.js';
import {estimateMatch,makeCandidate,walkForwardBacktest,scoreDistribution,MODEL_VERSION,poisson,modelReadiness,fulltime,fixtureTimestamp,lowScoreFactor,selectMarket,selectedMarketWon} from '../src/nforce-model.js';
import {canAutoPublishCandidate} from '../src/football-publication-policy.js';
import {publishedFootballDetails} from '../src/football-report.js';
import {telegramVipPublicPreview,telegramVipPost,telegramFreeAutoPost} from '../src/telegram-bridge.js';
import {importDecision} from '../src/nforce-engine.js';

const dataset={code:'en.1',name:'Premier League',zone:'Europe/London',season:'2026-27',path:'2026-27/en.1.json'};
const at='2026-11-10T20:00:00Z';
const teams=Array.from({length:12},(_,i)=>'Club '+String.fromCharCode(65+i));
function history(count=240){
 const rows=[];
 for(let i=0;i<count;i++){
  const home=teams[i%teams.length],away=teams[(i+1+Math.floor(i/12)%10)%teams.length];
  if(home===away)continue;
  const date=new Date(Date.parse(at)-(count-i)*11*3600000);
  rows.push({id:i+1,competition:'en.1',home,away,kickoff:date.toISOString(),
   home_goals:i%4===0?3:2,away_goals:i%3===0?2:0});
 }
 return rows;
}
test('Dataset OpenFootball CC0: allowlist estricta, temporadas correctas',()=>{
 assert.equal(seasonForDate(new Date('2026-11-06T00:00:00Z')),2026);
 const paths=allowedDatasets(new Date('2026-11-06')).map(s=>s.path);
 assert.ok(paths.includes('2026-27/en.1.json'));
 assert.ok(paths.includes('2025-26/es.1.json'));
 assert.equal(paths.length,10);
});
test('Horas Europe/London: verano BST, invierno GMT y DST inexistente',()=>{
 assert.equal(zonedKickoff('2026-07-10','20:00','Europe/London').toISOString(),'2026-07-10T19:00:00.000Z');
 assert.equal(zonedKickoff('2026-11-10','20:00','Europe/London').toISOString(),'2026-11-10T20:00:00.000Z');
 assert.equal(zonedKickoff('2026-03-29','01:30','Europe/London'),null);
 assert.equal(zonedKickoff('2026-02-30','20:00','Europe/London'),null);
 assert.equal(zonedKickoff('2026-11-10','24:00','Europe/London'),null);
});
test('Resultados FT solamente; no inventa scores ni horarios',()=>{
 const matches=normalizeOpenFootball({matches:[
  {date:'2026-09-01',time:'20:00',team1:'Alpha',team2:'Beta',score:{ft:[2,1]}},
  {date:'2026-11-10',team1:'Beta',team2:'Gamma',score:[0,0]},
  {date:'2026-11-10',time:'20:00',team1:'Delta',team2:'Alpha',score:{ft:[4,0]}},
 ]},dataset,new Date('2026-11-06T12:00:00Z'));
 assert.equal(matches.length,3);
 assert.deepEqual([matches[0].home_goals,matches[0].away_goals],[2,1]);
 assert.equal(matches[1].kickoff,null);assert.equal(matches[1].scheduled_time_known,false);
 assert.equal(matches[2].home_goals,null);assert.equal(matches[2].away_goals,null);
});
test('Fixture ID estable ante reprogramación, sin colisones obvias',()=>{
 const base={date:'2026-11-10',time:'20:00',team1:'Alpha',team2:'Beta'};
 const a=normalizeOpenFootball({matches:[base]},dataset)[0];
 const b=normalizeOpenFootball({matches:[{...base,date:'2026-11-11'}]},dataset)[0];
 assert.equal(a.id,b.id);
 assert.ok(Number.isSafeInteger(stableFixtureId(a.source_key)));
});
test('No permite URLs externas arbitrarias al importar',async()=>{
 await assert.rejects(fetchOpenFootball({...dataset,path:'https://evil.test/other.json'}, {fetcher:async()=>{throw Error('No debería llamarse');}}),/no autorizada/);
});
test('Fuente de prueba importada, sin fetch de APIs deportivas',async()=>{
 const sample=JSON.stringify({name:'Test',matches:[{date:'2026-11-10',time:'20:00',team1:'Local',team2:'Visitante'}]});
 let url;
 const records=await fetchOpenFootball(dataset,{fetcher:async input=>{url=input;return {
  ok:true,headers:{get:()=>null},body:null,text:async()=>sample};}});
 assert.equal(records.length,1);
 assert.ok(url.startsWith('https://raw.githubusercontent.com/openfootball/football.json/master/'));
});
test('Matriz de Poisson normalizada y probabilidades no negativas',()=>{
 const cells=scoreDistribution(1.8,1.1);const sum=cells.reduce((n,c)=>n+c.p,0);
 assert.ok(Math.abs(1-sum)<1e-9);assert.ok(cells.every(c=>c.p>=0&&c.p<=1));
});
test('Modelo exige historial y respeta corte temporal',()=>{
 const m={competition:'en.1',home:teams[0],away:teams[1],kickoff:at};
 assert.equal(estimateMatch(m,[]),null);
 const all=history();const a=estimateMatch(m,all);assert.ok(a,a?'':'No se calcularon tasas');
 assert.equal(a.model,MODEL_VERSION);
 assert.ok(a.probabilities.home+a.probabilities.draw+a.probabilities.away>=99.5);
 assert.ok(a.probabilities.home+a.probabilities.draw+a.probabilities.away<=100.5);
 const mutated=all.map(x=>({...x}));mutated.push({competition:'en.1',home:teams[0],away:teams[1],kickoff:'2026-11-11T01:00:00Z',home_goals:25,away_goals:0});
 assert.deepEqual(estimateMatch(m,mutated),a,'El futuro no puede contaminar el pronóstico');
});
/** Internally consistent fixtures: cannot invent a 90% probability that
 * contradicts its Poisson goal model just to pass the VIP risk filter. */
function robustFixtureModel(h,a,overrides={}){
 const r=n=>Number((100*n).toFixed(1));
 const probs={home:0,draw:0,away:0};
 const totals={over15:0,over25:0,under25:0,btts:0};
 for(const c of scoreDistribution(h,a)){
  probs[c.home>c.away?'home':c.home<c.away?'away':'draw']+=c.p;
  if(c.home+c.away>=2)totals.over15+=c.p;
  if(c.home+c.away>=3)totals.over25+=c.p;else totals.under25+=c.p;
  if(c.home>0&&c.away>0)totals.btts+=c.p;
 }
 const order=Object.keys(probs).sort((x,y)=>probs[y]-probs[x]);
 return {model:MODEL_VERSION,quality:92,confidence:r(probs[order[0]]),margin:r(probs[order[0]]-probs[order[1]]),selected:order[0],
  probabilities:Object.fromEntries(Object.entries(probs).map(([k,v])=>[k,r(v)])),
  totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,r(v)])),
  lambda:{home:h,away:a},previous_lambda:{home:Number((h*.98).toFixed(3)),away:Number((a*1.02).toFixed(3))},
  opponent_model:{active:true},score:'2-0',score_probability:11,
  sample:{home:26,away:25,league:210,home_venue:12,away_venue:11,home_effective:18,away_effective:17,age_home_days:5,age_away_days:6},
  leagueBaseline:{home:42,draw:25,away:33,over15:68,over25:54,under25:46,btts:52,noBtts:48,oneX:67,xTwo:58,oneTwo:75},
  ...overrides};
}

test('Una propuesta propia conserva la selección VIP y oculta datos en el adelanto público',()=>{
 const m={id:12345,scheduled_time_known:true,competition:'en.1',season:'2026-27',round:'Matchday 10',home:'Club A',away:'Club B',league:'Premier League',
  kickoff:'2026-11-10T20:00:00Z',source_path:dataset.path};
 const model=robustFixtureModel(2.8,0.5);
 const candidate=makeCandidate(m,model);
 assert.equal(candidate.visibility,'vip');assert.equal(candidate.selection,'Club A');assert.equal(candidate.odds,null);
 assert.equal(canAutoPublishCandidate({...candidate,status:'draft'}),true);
 const details=publishedFootballDetails(candidate.evidence_json);
 assert.equal(details.model_goals.over25,model.totals.over25);
 assert.equal(details.provider_1x2.home,model.probabilities.home);
 const payload={id:77,auto_generated:true,title:'Club A vs Club B',visibility:'vip',league:'Premier League',
  match_date:'2026-11-10 20:00:00',market:candidate.market,selection:candidate.selection,analysis:candidate.analysis,football_details:details};
 const preview=telegramVipPublicPreview(payload,'https://site.example');
 assert.ok(preview.includes('Club A vs Club B'));
 assert.ok(!preview.includes(`${model.confidence}%`));
 assert.ok(!preview.includes('1X2 · Selección'));
 assert.ok(!preview.includes('Marcador estadístico'));
 const privatePost=telegramVipPost(payload);
 assert.ok(privatePost.includes('Club A'));
 assert.ok(privatePost.includes(`${model.totals.over25}%`));
 assert.ok(privatePost.includes('2-0'));
});
test('Ficha gratuita de alto riesgo, no promete garantías',()=>{
 const m={id:4444,scheduled_time_known:true,competition:'en.1',season:'2026-27',home:'Club A',away:'Club C',league:'Premier League',kickoff:at};
 const model={model:MODEL_VERSION,quality:74,selected:'away',confidence:46,margin:9,lambda:{home:1,away:1.1},
  probabilities:{home:37,draw:17,away:46},totals:{over15:65,over25:44,over35:19,btts:49},score:'1-1',score_probability:14,
  sample:{home:14,away:16,league:120}};
 const c=makeCandidate(m,model);assert.equal(c.visibility,'free');assert.ok(c.analysis.includes('SIN CALIBRAR'));
 assert.equal(canAutoPublishCandidate({...c,status:'draft'}),true);
 const text=telegramFreeAutoPost({title:'Club A vs Club C',league:'Premier League',match_date:'2026-11-10 20:00:00',market:c.market,selection:c.selection,
  estimated_probability:c.provider_probability,analysis:c.analysis});
 assert.match(text,/RIESGO ALTO/);
});
test('Backtesting walk-forward: métricas sin rentabilidad inventada',()=>{
 const rows=history(480);
 const r=walkForwardBacktest(rows,{maxGames:270,now:new Date('2026-11-30T00:00:00Z')});
 assert.ok(r.attempted>0);assert.ok(r.evaluated>0);assert.ok(r.brier>=0&&r.logloss>=0);
 assert.ok(r.accuracy>=0&&r.accuracy<=100);
 assert.equal(r.method.includes('cronológico'),true);
 assert.ok(!('roi' in r));
});
test('Cooldown de importación: 2 horas, fallos reintentan después',()=>{
 const t=Date.parse('2026-11-06T22:00:00Z');
 assert.equal(importDecision(null,t).due,true);
 assert.equal(importDecision({status:'completed',started_at:'2026-11-06 21:00:00'},t).due,false);
 assert.equal(importDecision({status:'failed',started_at:'2026-11-06 19:00:00'},t).due,true);
});

test('Las probabilidades ajustadas de bajo marcador se normalizan y aumentan 0-0 contra Poisson simple',()=>{
 const lambda=1.3,mu=1.1;
 const grid=scoreDistribution(lambda,mu);
 assert.ok(Math.abs(grid.reduce((t,v)=>t+v.p,0)-1)<1e-10);
 assert.ok(grid.every(c=>c.p>=0));
 assert.ok(lowScoreFactor(0,0,lambda,mu)>1);
 const raw00=poisson(lambda,0)*poisson(mu,0);
 assert.ok(grid.find(x=>x.home===0&&x.away===0).p>raw00);
});

test('Rechaza resultados negativos, fechas sin sentido y datos recientes insuficientes',()=>{
 assert.equal(fulltime({home_goals:-1,away_goals:0}),false);
 assert.equal(fulltime({home_goals:null,away_goals:0}),false);
 assert.equal(fulltime({home_goals:2,away_goals:1}),true);
 assert.equal(modelReadiness({competition:'en.1',home:'A',away:'B',kickoff:'2026-11-11T20:00:00Z'},[],Date.parse('2026-11-11T20:00:00Z')).reason,'league_history');
 assert.equal(fixtureTimestamp({kickoff:'2026-11-11T20:00:00+02:00'}),Date.parse('2026-11-11T18:00:00Z'));
 assert.equal(fixtureTimestamp({date:'2026-11-11'}),Date.parse('2026-11-11T23:59:59.999Z'));
});

test('Backtesting informa calibración por banda y desempeño gratis/VIP sin confundirlo con predicción',()=>{
 const r=walkForwardBacktest(history(480),{maxGames:270,now:new Date('2026-11-30T00:00:00Z')});
 assert.equal(r.model,MODEL_VERSION);
 assert.ok(r.evaluated>0);
 assert.ok(Object.keys(r.calibration).length);
 assert.ok(r.segments.free.evaluated>=0&&r.segments.vip.evaluated>=0);
 assert.equal(Object.values(r.calibration).reduce((sum,b)=>sum+b.evaluated,0),r.evaluated);
});


test('VIP multimerkado: evita falsos positivos y solo acepta mercados estables',()=>{
 const m={id:883,scheduled_time_known:true,home:'Local',away:'Visita',league:'Demo',kickoff:at};
 const model=robustFixtureModel(1.7,1.5,{leagueBaseline:{home:43,draw:25,away:32,
  over15:83,over25:54,under25:46,btts:52,noBtts:48,oneX:68,xTwo:57,oneTwo:75}});
 assert.notEqual(selectMarket(m,model)?.visibility,'vip','Sin ventaja sobre la liga no crea VIP');
 model.leagueBaseline.over15=68;
 const chosen=selectMarket(m,model);
 assert.equal(chosen.visibility,'vip');
 assert.equal(chosen.key,'over15');
 assert.equal(chosen.market,'Total goles');
 assert.equal(chosen.selection,'Más de 1.5');
 assert.ok(chosen.robustness.worst_scenario>=76);
 const candidate=makeCandidate(m,model);
 assert.equal(candidate.visibility,'vip');
 assert.equal(selectedMarketWon(candidate,{...m,home_goals:2,away_goals:0}),true);
 assert.equal(selectedMarketWon(candidate,{...m,home_goals:1,away_goals:0}),false);
 assert.equal(canAutoPublishCandidate({...candidate,status:'draft'}),true);
 assert.equal(canAutoPublishCandidate({...candidate,selection:'Menos de 1.5',status:'draft'}),false);
});

test('Doble oportunidad: 1X aprobado solo con respaldo y escenario conservador',()=>{
 const model=robustFixtureModel(1.8,0.6);
 const pick=selectMarket({home:'A',away:'B'},model);
 assert.equal(pick.key,'1X');
 assert.ok(pick.probability>=86);
 assert.equal(pick.visibility,'vip');
 assert.ok(pick.robustness.worst_scenario>=76);
});
