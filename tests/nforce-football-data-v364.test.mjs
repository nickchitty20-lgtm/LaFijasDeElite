import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FOOTBALL_DATA_COMPETITIONS,normalizeFootballDataMatch,fetchFootballDataFixtures,reconcileFootballDataFixtures,importFootballDataFixtures} from '../src/football-data-fixtures.js';
import {readFootballDataSource,saveFootballDataSource} from '../src/nforce-source-settings.js';
const now=new Date('2026-11-11T15:00:00Z');
const match=(overrides={})=>({id:1234,utcDate:'2026-11-17T16:00:00Z',status:'TIMED',
 competition:{code:'PL'},homeTeam:{name:'Arsenal FC'},awayTeam:{name:'Chelsea FC'},
 season:{startDate:'2026-08-12'},matchday:12,...overrides});
const fixture=()=>normalizeFootballDataMatch(match(),{now});
const fromRepo=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('lista de competiciones gratuita coincide solo con histórico compatible y no incluye Champions',()=>{
 assert.equal(FOOTBALL_DATA_COMPETITIONS.PL,'en.1');assert.equal(FOOTBALL_DATA_COMPETITIONS.WC,'int.worldcup');
 assert.equal(FOOTBALL_DATA_COMPETITIONS.CL,undefined);
 assert.equal(new Set(Object.values(FOOTBALL_DATA_COMPETITIONS)).size,Object.values(FOOTBALL_DATA_COMPETITIONS).length);
});
test('normaliza fechas confirmadas UTC y excluye goles y estado verificado',()=>{
 const e=fixture();assert.equal(e.competition,'en.1');assert.equal(e.kickoff,'2026-11-17T16:00:00.000Z');
 assert.equal(e.scheduled_time_known,true);assert.equal(e.home_goals,null);assert.equal(e.away_goals,null);
 assert.equal(e.source_path,'secondary/football-data-org');assert.equal(e.id,fixture().id);
});
test('un encuentro SCHEDULED con fecha tentativa se guarda sin hora exacta',()=>{
 const e=normalizeFootballDataMatch(match({status:'SCHEDULED'}),{now});
 assert.equal(e.kickoff,null);assert.equal(e.scheduled_time_known,false);assert.equal(e.date,'2026-11-17');
});
test('rechaza resultados, fechas pasadas, competiciones fuera de modelo, IDs y respuestas erróneas',()=>{
 const invalid=[{status:'FINISHED'},{status:'IN_PLAY'},{status:'POSTPONED'},
 {utcDate:'2026-11-08T16:00:00Z'},{utcDate:'2026-12-24T16:00:00Z'},
 {utcDate:'2026-11-17T16:00:00'},
 {id:'hacker'}, {competition:{code:'CL'}}, {homeTeam:{name:''}}, {awayTeam:{name:'Arsenal FC'}}];
 for(const change of invalid)assert.equal(normalizeFootballDataMatch(match(change),{now}),null,JSON.stringify(change));
});
test('medianoche UTC no se afirma como hora confirmada',()=>{
 const e=normalizeFootballDataMatch(match({utcDate:'2026-11-17T00:00:00Z'}),{now});
 assert.equal(e.kickoff,null);assert.equal(e.scheduled_time_known,false);
});
test('clasifica selecciones sin confundir su liga',()=>{
 const e=normalizeFootballDataMatch(match({competition:{code:'WC'},homeTeam:{name:'United States'},awayTeam:{name:'Argentina'}}),{now});
 assert.equal(e.competition,'int.worldcup');assert.ok(e.league);assert.equal(e.home,'United States');
});
test('una solicitud puede traer todos los partidos del rango sin recorrer liga por liga',async()=>{
 const requests=[];
 const fetcher=async(url,opts)=>{requests.push({url,opts});return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({matches:[match(),match({id:2,status:'SCHEDULED'}),match({id:3,competition:{code:'CL'}})]})};};
 const r=await fetchFootballDataFixtures({key:'test-key',now,fetcher});
 assert.equal(requests.length,1);assert.equal(requests[0].opts.headers['X-Auth-Token'],'test-key');
 assert.equal(new URL(requests[0].url).hostname,'api.football-data.org');
 assert.equal(new URL(requests[0].url).searchParams.get('dateFrom'),'2026-11-11');
 assert.equal(new URL(requests[0].url).searchParams.get('dateTo'),'2026-12-03');
 assert.equal(r.received,3);assert.equal(r.events.length,2);assert.equal(r.unmapped,1);assert.equal(r.undated,1);
});
test('responde con error legible a 401, 429, JSON inválido o clave ausente',async()=>{
 await assert.rejects(()=>fetchFootballDataFixtures({key:''}),/FOOTBALL_DATA_ORG_KEY/);
 for(const [status,text] of [[401,'Clave inválida'],[429,'Límite de consultas']]){
  await assert.rejects(()=>fetchFootballDataFixtures({key:'x',now,fetcher:async()=>({ok:false,status})}),new RegExp(text));
 }
 await assert.rejects(()=>fetchFootballDataFixtures({key:'x',now,fetcher:async()=>({ok:true,headers:{get:()=>null},text:async()=>'<html>'})}),/JSON inválido/);
});
test('deduplica partidos de otro proveedor y bloquea los ambiguos',()=>{
 const e=fixture();const local={id:45,source_key:'secondary-thesportsdb|11',competition:'en.1',home_team:'Arsenal',away_team:'Chelsea',match_date:'2026-11-17',kickoff:null};
 const r=reconcileFootballDataFixtures([e],[local]);assert.equal(r.matches.length,1);assert.equal(r.inserts.length,0);
 assert.equal(reconcileFootballDataFixtures([e],[local,{...local,id:46}]).ambiguous.length,1);
 const own={...local,source_key:e.source_key,id:e.id};assert.equal(reconcileFootballDataFixtures([e],[own]).matches.length,1);
});
test('importa sin clave ni petición si está apagado y reporta claramente falta de clave',async()=>{
 const conn={query:async()=>{throw Error('No debería consultar MySQL');},execute:async()=>{throw Error('No debería insertar');}};
 assert.equal((await importFootballDataFixtures({conn,enabled:false,key:'secret'})).requests,0);
 const r=await importFootballDataFixtures({conn,enabled:true,key:''});assert.equal(r.requests,0);assert.match(r.errors[0],/KEY/);
});
test('importación real usa INSERT IGNORE e impide afirmar horario para SCHEDULED',async()=>{
 const stored=[],sql=[];
 const conn={query:async()=>[stored.map(x=>({...x}))],execute:async(command,args)=>{
  sql.push({command,args});
  if(command.includes('INSERT IGNORE'))stored.push({id:args[0],source_key:args[1],competition:args[2],home_team:args[6],away_team:args[7],match_date:args[8],kickoff:args[9],scheduled_time_known:args[10]});
  return [{affectedRows:1}];
 }};
 const timed=fixture(),dateOnly=normalizeFootballDataMatch(match({id:124,status:'SCHEDULED',homeTeam:{name:'Manchester United FC'},awayTeam:{name:'Liverpool FC'}}),{now});
 const fetchSchedule=async()=>({events:[timed,dateOnly],received:2,unmapped:0,undated:1});
 const report=await importFootballDataFixtures({conn,enabled:true,key:'secret',now,fetchSchedule});
 assert.equal(report.inserted,2);assert.equal(report.without_time,1);
 assert.equal(stored.find(x=>x.source_key===dateOnly.source_key).scheduled_time_known,0);
 assert.equal(stored.find(x=>x.source_key===dateOnly.source_key).kickoff,null);
 assert.equal(sql.some(x=>x.command.includes('nforce_fixture_schedules')),false);
 const repeated=await importFootballDataFixtures({conn,enabled:true,key:'secret',now,fetchSchedule});
 assert.equal(repeated.inserted,0);assert.equal(repeated.matched,2);
});
test('sólo propietario cambia fuente, la variable se migra con INSERT IGNORE y el panel la muestra',async()=>{
 const engine=fromRepo('src/nforce-engine.js'),init=fromRepo('src/init-db.js'),html=fromRepo('views/panel.html'),ui=fromRepo('public/app.js');
 assert.match(engine,/app\.post\(api\('sources\/football-data'\),authenticate/);assert.match(engine,/saveFootballDataSource\(db/);
 assert.match(init,/\['footballdata',process\.env\.FOOTBALL_DATA_ORG_ENABLED/);
 assert.match(html,/sportsFootballDataToggle/);assert.match(ui,/sources\/football-data/);
 assert.match(engine,/football_data:footballData/);
 const db={query:async()=>[[{source_id:'footballdata',enabled:1,updated_at:null}]]};
 assert.equal((await readFootballDataSource(db)).enabled,true);
 let enabled=0;const calls=[];
 const conn={beginTransaction:async()=>{},execute:async(sql,args)=>{
  calls.push(sql);
  if(sql.startsWith('SELECT enabled'))return [[{enabled}]];
  if(sql.startsWith('UPDATE nforce_source_settings'))enabled=args[0];
  return [[]];
 },commit:async()=>{},rollback:async()=>{},release:()=>{}};
 const saved=await saveFootballDataSource({getConnection:async()=>conn},{enabled:true,actorId:5});
 assert.equal(saved.changed,true);assert.equal(enabled,1);assert.equal(calls.filter(x=>x.includes('audit_logs')).length,1);
 await assert.rejects(()=>saveFootballDataSource({getConnection:async()=>conn},{enabled:'true',actorId:5}),/booleano/);
});

test('atribución visible condicional al activar el proveedor sin filtrar tokens',()=>{
 const engine=fromRepo('src/nforce-engine.js');const landing=fromRepo('public/landing.js');
 assert.match(engine,/api\/public\/data-credit/);
 assert.match(engine,/Football data provided by the Football-Data.org API/);
 assert.match(landing,/data-credit/);assert.match(landing,/footer\.append\(credit\)/);
});
