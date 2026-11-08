import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInjuries,parseLineups,parseSeasonStats,createAdvancedSnapshot,fetchAdvancedSnapshot,advancedReportForPublic,advancedAnalysisLines} from '../src/football-advanced.js';
import {createAssessment} from '../src/football-analysis.js';
import {publishedFootballDetails} from '../src/football-report.js';
import {telegramAdvancedSummary} from '../src/telegram-bridge.js';
const fixture={fixture:{id:222,date:'2026-11-06T18:35:00Z'},league:{id:39,season:2026,name:'Liga A'},teams:{home:{id:11,name:'A'},away:{id:22,name:'B'}}};
const prediction={predictions:{percent:{home:'76%',draw:'14%',away:'10%'},goals:{home:'-3.5',away:'-1.5'}},teams:{home:{last_5:{form:'80%',goals:{for:{total:8},against:{total:2}}}},away:{last_5:{form:'40%',goals:{for:{total:3},against:{total:8}}}}},comparison:{att:{home:'60%',away:'40%'},def:{home:'65%',away:'35%'}}};
const abs=[{team:{id:11},player:{id:1,name:'Jugador A',type:'Missing Fixture',reason:'Suspensión'}},{team:{id:22},player:{id:2,name:'Jugador B',type:'Questionable',reason:'Muscular'}}];
const lineup=[{team:{id:11},formation:'4-3-3',coach:{name:'Entrenador A'},startXI:Array.from({length:11},(_,i)=>({player:{name:`A${i}`}}))},{team:{id:22},formation:'4-4-2',startXI:Array.from({length:11},(_,i)=>({player:{name:`B${i}`}}))}];
const teamStats={fixtures:{played:{total:10},wins:{total:6},draws:{total:3},loses:{total:1}},goals:{for:{average:{total:'1.7'}},against:{average:{total:'0.8'}}}};
test('bajas reportadas y dudas se separan por ID y se deduplican',()=>{
 const r=parseInjuries([...abs,abs[0]],11,22);assert.equal(r.reported,2);assert.equal(r.home[0].name,'Jugador A');assert.equal(r.away[0].type,'Questionable');
 assert.equal(parseInjuries(null,11,22).status,'unavailable');assert.equal(parseInjuries([],11,22).status,'no_records');
});
test('alineaciones nunca se marcan disponibles si faltan jugadores',()=>{
 assert.equal(parseLineups(lineup,11,22,{requested:true}).status,'available');
 assert.equal(parseLineups([lineup[0]],11,22,{requested:true}).status,'partial');
 assert.equal(parseLineups([],11,22,{requested:true}).status,'no_records');
 assert.equal(parseLineups([],11,22,{requested:false,expectedSoon:true}).status,'pending');
});
test('estadísticas por temporada solo con muestra reportada',()=>{
 assert.deepEqual(parseSeasonStats(teamStats),{played:10,wins:6,draws:3,losses:1,avg_scored:1.7,avg_conceded:0.8,form:null});
 assert.equal(parseSeasonStats({}),null);
});
test('estudio avanzado se guarda, se filtra para cliente y llega a Telegram VIP',()=>{
 const adv=createAdvancedSnapshot({fixture,prediction,injuries:abs,lineups:lineup,seasonHome:teamStats,seasonAway:teamStats,
  injuriesRequested:true,lineupsRequested:true,statsRequested:true,now:new Date('2026-11-06T18:00:00Z')});
 assert.equal(adv.status.lineups,'available');assert.equal(adv.form.home.form_pct,80);assert.equal(adv.status.season,'available');
 const result=createAssessment(fixture,prediction,{advanced:adv});assert.equal(result.visibility,'vip');
 assert.match(result.analysis,/Jugador A/);assert.match(result.analysis,/temporada/);
 const published=publishedFootballDetails(result.raw_evidence);assert.equal(published.advanced.lineups.home.starting.length,11);
 assert.match(telegramAdvancedSummary({football_details:published}),/ESTUDIO AVANZADO/);
});
test('no se inventa evidencia cuando fallan endpoints suplementarios',async()=>{
 const calls=[];
 const api=async(path,params)=>{calls.push([path,params]);throw Error('API plan limit')};
 const a=await fetchAdvancedSnapshot({fixture,prediction,api,now:new Date('2026-11-06T17:00:00Z')});
 assert.equal(a.status.injuries,'unavailable');assert.equal(a.status.lineups,'unavailable');assert.equal(a.status.season,'unavailable');
 assert.equal(a.fetch_warnings.length,3);assert.deepEqual(calls.map(x=>x[0]),['injuries','teams/statistics','teams/statistics']);
 assert.match(advancedAnalysisLines(a).join(' '),/ausencia de reportes NO prueba/);
});
test('consulta alineaciones cerca del inicio y respeta condición de Liga/Temporada',async()=>{
 const calls=[];
 const api=async(path)=>{calls.push(path);return path==='fixtures/lineups'?lineup:path==='injuries'?abs:teamStats;};
 const a=await fetchAdvancedSnapshot({fixture,prediction,api,now:new Date('2026-11-06T18:00:00Z')});
 assert.equal(a.status.lineups,'available');assert.equal(a.status.season,'available');assert.equal(calls.length,4);
});
test('salida pública sanitiza y limita valores ajenos',()=>{
 const result=advancedReportForPublic({status:{injuries:'available'},injuries:{reported:1,home:[{name:'<script>X',type:'Missing Fixture',reason:'A'}]},lineups:{home:{starting:['<b>x']}}});
 assert.equal(result.injuries.home[0].name,'script X');assert.equal(result.lineups.home.starting[0],'b x');
});
