import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeScheduleFixture,linkSchedules,schedulePresentation,installLiveSchedule} from '../src/live-schedule.js';
import {peruLocalToUtc,formatPeruKickoff} from '../src/match-schedule.js';
const t=Date.parse('2026-11-08T12:00:00Z');
const game=(id=555,date='2026-11-08T16:15:00+00:00',status='NS')=>({
 fixture:{id,date,status:{short:status}},league:{id:61},teams:{home:{name:'Le Havre'},away:{name:'FC Lorient'}}
});
const local={id:101,competition:'fr.1',home_team:'Le Havre AC',away_team:'FC Lorient',
 match_date:'2026-11-08',kickoff:'2026-11-08 15:15:00'};
test('liga, clubes y fecha respaldan una vinculación unívoca; se rechazan empates ambiguos',()=>{
 assert.equal(normalizeScheduleFixture(game()).kickoff,'2026-11-08T16:15:00.000Z');
 assert.equal(linkSchedules([local],[game()]).length,1);
 assert.equal(linkSchedules([local],[game(),game(556)]).length,0);
 assert.equal(linkSchedules([local],[{...game(),league:{id:7}}]).length,0);
 assert.equal(linkSchedules([local],[game(557,'2026-11-18T16:15:00Z')]).length,0);
 assert.equal(normalizeScheduleFixture(game(558,'2026-11-08T16:15:00Z','TBD')).kickoff,null);
 assert.equal(normalizeScheduleFixture(game(559,'garbage')),null);
});
test('horas en Perú se convierten a UTC, sin doble conversión ni hora ficticia',()=>{
 assert.equal(peruLocalToUtc('2026-11-08T11:15'),'2026-11-08T16:15:00.000Z');
 assert.match(formatPeruKickoff(peruLocalToUtc('2026-11-08T11:15')),/11:15/);
 assert.equal(peruLocalToUtc('2026-02-31T12:00'),null);
 assert.equal(peruLocalToUtc('2026-11-08T25:00'),null);
});
test('sin comprobación reciente no se promete comienzo ni estado en vivo',()=>{
 const raw={kickoff:'2026-11-08T16:15:00Z',status:'NS',verified_at:'2026-11-08T11:30:00Z'};
 assert.equal(schedulePresentation(raw,{now:t,liveConfigured:true}).schedule_verified,true);
 assert.equal(schedulePresentation(raw,{now:t+2*3600000,liveConfigured:true}).schedule_verified,false);
 assert.equal(schedulePresentation(raw,{now:t,liveConfigured:false}).schedule_verified,false);
 assert.equal(schedulePresentation({...raw,status:'FT'},{now:t,liveConfigured:true}).status,'FT');
 assert.equal(schedulePresentation({...raw,status:'PST'},{now:t,liveConfigured:true}).status,'PST');
 assert.match(schedulePresentation(raw,{now:t,liveConfigured:false}).message,/sin fuente/i);
});
test('API pública solo devuelve horarios y estados, nunca el pronóstico VIP',async()=>{
 const routes=new Map(),past=new Date('2026-11-08T11:40:00Z');
 let dbRead=0;const db={
  async query(sql,args){dbRead++;if(sql.includes('FROM predictions p')){
   assert.equal(args[0],'nforce-openfootball');assert.equal(args[1],'22');
   return [[{id:22,original_kickoff:new Date('2026-11-08T15:00:00Z'),verified_kickoff:new Date('2026-11-08T16:15:00Z'),status:'NS',verified_at:past}]];
  }throw Error('unexpected query');}
 };
 const app={get(path,...handlers){routes.set(path,handlers.at(-1));}};
 installLiveSchedule(app,{db,authenticate:()=>{},now:()=>new Date(t),env:{FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'test-only'}});
 const response={statusCode:200,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(data){this.body=data;return this;}};
 await routes.get('/api/schedules/live')({query:{ids:'22'}},response);
 assert.equal(response.statusCode,200);assert.equal(response.body.schedules[0].kickoff,'2026-11-08T16:15:00.000Z');
 assert.equal(response.body.schedules[0].schedule_verified,true);
 assert.equal(JSON.stringify(response.body).includes('selection'),false);
 assert.equal(JSON.stringify(response.body).includes('analysis'),false);
 assert.equal(JSON.stringify(response.body).includes('telegram'),false);
 assert.equal(dbRead,1);
});
test('sin API configurada el sincronizador no hace peticiones a terceros',async()=>{
 const app={get(){}};let requests=0;
 const updater=installLiveSchedule(app,{db:{},authenticate(){},env:{FOOTBALL_SCHEDULE_LIVE:'false'},request:async()=>{requests++;}});
 assert.equal((await updater.sync()).skipped,true);
 assert.equal(requests,0);
});
test('las vistas muestran estado no verificado y consultan el backend (sin falsear countdown)',()=>{
 const js=readFileSync(new URL('../public/match-schedule.js',import.meta.url),'utf8');
 const db=readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
 assert.match(db,/timezone: 'Z'/);
 assert.match(js,/Horario sin confirmación reciente/);
 assert.match(js,/\/api\/schedules\/live\?ids=/);
 assert.match(js,/if\(!verified\)/);
 assert.match(panel,/liveScheduleStatus/);
});
test('un calendario confirmado modifica solo el inicio programado, sin tocar resultados ni selecciones',async()=>{
 const at=new Date('2026-11-08T12:00:00Z');
 const queries=[],writes=[],requested=[];
 const db={getConnection:async()=>({
  async query(sql,args=[]){queries.push(sql);
   if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
   if(sql.includes('RELEASE_LOCK'))return [[{result:1}]];
   if(sql.includes('COUNT(*) AS calls'))return [[{calls:0}]];
   if(sql.includes('GROUP BY day_utc'))return [[]];
   if(sql.includes('FROM nforce_matches m'))return [[{...local}]];
   throw Error('unexpected query '+sql);
  },
  async execute(sql,args=[]){writes.push({sql,args});return [{affectedRows:1}];},
  release(){}
 })};
 const app={get(){}};
 const updater=installLiveSchedule(app,{db,authenticate(){},now:()=>at,env:{FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'mock'},
  request:async(endpoint,params)=>{assert.equal(endpoint,'fixtures');requested.push(params.date);return params.date==='2026-11-08'?[game()]:[];}});
 const report=await updater.sync();
 assert.equal(report.ok,true);assert.equal(report.matched,1);
 assert.equal(requested.length,4);
 assert.equal(writes.filter(x=>x.sql.includes('nforce_fixture_schedules')).length,1);
 const dateUpdate=writes.find(x=>x.sql.includes('UPDATE predictions p'));
 assert.ok(dateUpdate);
 assert.equal(dateUpdate.args[0],'2026-11-08 16:15:00');
 assert.match(dateUpdate.sql,/SET p\.match_date=\?/);
 assert.doesNotMatch(dateUpdate.sql,/SET (?:p\.)?(?:outcome|selection|analysis)=/);
});
