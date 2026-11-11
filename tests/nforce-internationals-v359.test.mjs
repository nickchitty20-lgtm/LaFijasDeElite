import test from 'node:test';
import assert from 'node:assert/strict';
import {nationalDatasets,NATIONAL_COMPETITIONS,canonicalNationalTeam,offsetKickoff} from '../src/nforce-internationals.js';
import {normalizeOpenFootball,fetchOpenFootball} from '../src/nforce-data.js';
import {modelReadiness,estimateMatch,makeCandidate} from '../src/nforce-model.js';
import {normalizeScheduleFixture,independentScheduleCoverage,installLiveSchedule} from '../src/live-schedule.js';

const date=new Date('2026-11-11T10:00:00Z');
const national=nationalDatasets(date);
const find=(code,season)=>national.find(x=>x.code===code&&x.season===String(season));

test('11 competiciones nacionales con rutas auditables, sin URL libre ni clubes eliminados',()=>{
 assert.equal(NATIONAL_COMPETITIONS.length,11);
 assert.equal(new Set(NATIONAL_COMPETITIONS.map(x=>x.code)).size,11);
 assert.ok(find('int.worldcup',2026));assert.ok(find('int.euro',2028));
 assert.ok(find('int.friendly',2026));assert.ok(find('int.wcqual',2025));
 assert.equal(find('int.friendly',2026).path,'friendly_2026_friendly.json');
 assert.equal(canonicalNationalTeam('USA'),'United States');
 assert.equal(canonicalNationalTeam('Côte d’Ivoire'),'Ivory Coast');
 assert.equal(canonicalNationalTeam('Czechia'),'Czech Republic');
 assert.equal(canonicalNationalTeam('Uruguay'),'Uruguay');
});

test('Copa Mundial: UTC± explícito y marcador FT sin marcar partidos futuros como finalizados',()=>{
 const ds=find('int.worldcup',2026);
 assert.equal(offsetKickoff('2026-06-11','13:00 UTC-6').toISOString(),'2026-06-11T19:00:00.000Z');
 assert.equal(offsetKickoff('2026-06-11','15:30 UTC+05:30').toISOString(),'2026-06-11T10:00:00.000Z');
 assert.equal(offsetKickoff('2026-06-11','15:30 UTC+15'),null);
 const rows=normalizeOpenFootball({matches:[
  {date:'2026-06-11',time:'13:00 UTC-6',team1:'Mexico',team2:'South Africa',score:{ft:[2,0]}},
  {date:'2026-12-11',time:'13:00 UTC-6',team1:'USA',team2:'Czechia',score:{ft:[4,1]}},
 ]},ds,date);
 assert.equal(rows[0].kickoff,'2026-06-11T19:00:00.000Z');
 assert.equal(rows[0].home_goals,2);
 assert.equal(rows[1].home,'United States');
 assert.equal(rows[1].away,'Czech Republic');
 assert.equal(rows[1].home_goals,null);
});

test('Amistosos y eliminatorias sin hora: registros históricos sí, propuesta publicable no',()=>{
 const ds=find('int.friendly',2026);
 const rows=normalizeOpenFootball({matches:[
  {date:'2026-03-28',team1:'Senegal',team2:'Peru',score:[2,0]},
  {date:'2026-11-13',team1:'Brazil',team2:'Peru'},
  {date:'2026-11-14',time:'18:00',team1:'Argentina',team2:'Peru'}
 ]},ds,date);
 assert.equal(rows.length,3);
 assert.equal(rows[0].home_goals,2);
 assert.equal(rows[0].kickoff,null);
 for(const row of rows)assert.equal(row.scheduled_time_known,false);
 assert.equal(makeCandidate({...rows[1],kickoff:null},null),null);
});

test('Fuente de selecciones autorizada antes de fetch; invalida cualquier ruta arbitraria',async()=>{
 const ds=find('int.friendly',2026);let seen='';
 const feed={name:'Friendly 2026',matches:[{date:'2026-03-28',team1:'Peru',team2:'Chile',score:[1,0]}]};
 const fetched=await fetchOpenFootball(ds,{fetcher:async(url)=>{
  seen=url;return {ok:true,headers:{get:()=>null},body:null,text:async()=>JSON.stringify(feed)};
 }});
 assert.match(seen,/^https:\/\/openfootball\.github\.io\/internationals\/friendly_2026_friendly\.json$/);
 assert.equal(fetched[0].home_goals,1);
 await assert.rejects(fetchOpenFootball({...ds,path:'../../secret.json'},
  {fetcher:async()=>{throw Error('NO');}}),/no autorizada/);
});

test('modelo de selecciones agrupa torneos sin mezclar clubes y sin reducir mínimos',()=>{
 const names=['Peru','Argentina','Brazil','Chile','Uruguay','Colombia','Ecuador','Bolivia','Mexico','USA','Canada','Paraguay'];
 const rows=[];const kickoff=Date.parse('2026-11-12T20:00:00Z');
 for(let i=0;i<190;i++){
  const a=names[i%names.length],b=names[(i+5)%names.length];
  rows.push({competition:['int.friendly','int.wcqual','int.copa'][i%3],
   home:a,away:b,kickoff:new Date(kickoff-(190-i)*2*86400000).toISOString(),
   home_goals:i%3,away_goals:(i+1)%3});
 }
 const target={competition:'int.friendly',home:'Peru',away:'Argentina',kickoff:new Date(kickoff).toISOString()};
 const readiness=modelReadiness(target,rows,kickoff);
 assert.equal(readiness.ready,true,JSON.stringify({reason:readiness.reason,sample:readiness.sample}));
 assert.equal(readiness.pool,'selecciones');
 assert.ok(readiness.sample.league>=150);
 const estimate=estimateMatch(target,rows,kickoff);
 assert.ok(estimate);
 assert.equal(estimate.history_group,'selecciones');
 const clubs=rows.map(m=>({...m,competition:'en.1'}));
 assert.equal(modelReadiness(target,clubs,kickoff).ready,false);
});

test('verificador admite los torneos nacionales pero exige NS y fecha dentro del plan',()=>{
 const coverage=independentScheduleCoverage({competition:'int.friendly',kickoff:'2026-11-11T20:00:00Z'},
  {now:date,env:{FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'mock'}});
 assert.equal(coverage.required,true);
 assert.equal(normalizeScheduleFixture({fixture:{id:777,date:'2026-11-11T20:00:00Z',status:{short:'NS'}},
  league:{id:10},teams:{home:{name:'USA'},away:{name:'Mexico'}}}).league,'int.friendly');
 assert.equal(normalizeScheduleFixture({fixture:{id:777,date:'2026-11-11T20:00:00Z',status:{short:'NS'}},
  league:{id:999999},teams:{home:{name:'USA'},away:{name:'Mexico'}}}),null);
});

function liveHarness({local=[],fixtures=[]}={}){
 const writes=[];
 const db={getConnection:async()=>({
  async query(sql){
   if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
   if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
   if(sql.includes('COUNT(*) AS calls'))return [[{calls:0}]];
   if(sql.includes('GROUP BY day_utc'))return [[]];
   if(sql.includes('FROM nforce_matches m'))return [local];
   throw Error('Consulta no prevista: '+sql.slice(0,100));
  },
  async execute(sql,args=[]){writes.push({sql,args});return [{affectedRows:1}];},release(){}
 })};
 const app={get(){},post(){}};
 const updater=installLiveSchedule(app,{db,authenticate(){},now:()=>date,
  env:{FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'mock'},
  request:async(_path,{date:requested})=>requested==='2026-11-11'?fixtures:[]});
 return {updater,writes};
}
const nationalRaw=(status='NS',kickoff='2026-11-11T20:00:00Z')=>({
 fixture:{id:1223377,date:kickoff,status:{short:status}},league:{id:10},
 teams:{home:{name:'Peru'},away:{name:'Uruguay'}},score:{fulltime:{home:1,away:0}}
});

test('verificador incorpora un partido de selecciones con hora real NS, sin crear apuestas',async()=>{
 const h=liveHarness({fixtures:[nationalRaw(),'unknown']});
 const result=await h.updater.sync();
 assert.equal(result.national_fixtures_discovered,1);
 const inserts=h.writes.filter(x=>x.sql.includes('INSERT IGNORE INTO nforce_matches'));
 assert.equal(inserts.length,1);
 assert.equal(inserts[0].args[2],'int.friendly');
 assert.ok(h.writes.some(x=>x.sql.includes('nforce_fixture_schedules')));
 assert.equal(h.writes.some(x=>x.sql.includes('football_candidates')||x.sql.includes('predictions')),false);
});

test('resultado FT de selección se registra solo con marcador 90 minutos, nunca penales',async()=>{
 const local=[{id:123,competition:'int.friendly',home_team:'Peru',away_team:'Uruguay',
  kickoff:new Date('2026-11-10T20:00:00Z'),match_date:new Date('2026-11-10T00:00:00Z')}];
 const h=liveHarness({local,fixtures:[nationalRaw('FT','2026-11-10T20:00:00Z')]});
 await h.updater.sync();
 const scores=h.writes.filter(x=>x.sql.includes('UPDATE nforce_matches SET home_goals'));
 assert.equal(scores.length,1);
 assert.deepEqual(scores[0].args,[1,0,123]);
 const h2=liveHarness({local,fixtures:[nationalRaw('PEN','2026-11-10T20:00:00Z')]});
 await h2.updater.sync();
 assert.equal(h2.writes.some(x=>x.sql.includes('UPDATE nforce_matches SET home_goals')),false);
});
