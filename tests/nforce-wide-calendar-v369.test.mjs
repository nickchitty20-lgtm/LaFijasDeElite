import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchWideCalendar,normalizeWideFixture,importWideCalendar,WIDE_SUPPORTED_COMPETITIONS} from '../src/api-football-wide.js';
import {VIP_POLICY} from '../src/nforce-vip-gate.js';
import {VIP_RISK_POLICY,NATIONAL_VIP_RISK_POLICY,MODEL_VERSION} from '../src/nforce-model.js';
import {readWideSource,saveWideSource} from '../src/nforce-source-settings.js';

const now=new Date('2026-11-11T15:00:00Z');
const raw=(id=901,opts={})=>({fixture:{id,date:'2026-11-18T19:00:00+00:00',status:{short:'NS'}},
 league:{id:39,name:'Premier League',season:2026},teams:{home:{name:'Arsenal'},away:{name:'Chelsea'}},...opts});
const fixture=()=>normalizeWideFixture(raw(),{now});
const fromRepo=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');

test('mapea solo competiciones con historial y partidos NS futuros con hora, sin inventar resultados',()=>{
 const e=fixture();assert.equal(e.competition,'en.1');assert.equal(e.source_path,'secondary/api-football-wide');
 assert.equal(e.scheduled_time_known,true);assert.equal(e.home_goals,null);assert.equal(e.away_goals,null);
 assert.ok(WIDE_SUPPORTED_COMPETITIONS.length>20);
 for(const candidate of [raw(902,{fixture:{id:902,date:'2026-11-18T19:00:00Z',status:{short:'FT'}}}),
  raw(903,{league:{id:999999,season:2026}}),raw(904,{fixture:{id:904,date:'2026-11-18T19:00:00Z',status:{short:'TBD'}}}),
  raw(905,{fixture:{id:905,date:'2026-11-10T19:00:00Z',status:{short:'NS'}}})])
  assert.equal(normalizeWideFixture(candidate,{now}),null);
});

test('aprovecha un rango de 30 días para el plan extendido en UNA sola solicitud',async()=>{
 const calls=[];
 const request=async(endpoint,params,env)=>{calls.push({endpoint,params,env});return [raw()];};
 const env={FOOTBALL_API_KEY:'private-secret',FOOTBALL_SCHEDULE_PLAN:'extended'};
 const report=await fetchWideCalendar({request,now,env});
 assert.equal(calls.length,1);assert.equal(calls[0].endpoint,'fixtures');
 assert.deepEqual(calls[0].params,{from:'2026-11-11',to:'2026-12-11'});
 assert.equal(report.discarded,0);assert.equal(report.events.length,1);assert.equal(report.limited,false);
});

test('en plan gratuito no finge cobertura extendida ni consume consultas para múltiples ligas',async()=>{
 const calls=[];
 const report=await fetchWideCalendar({now,env:{FOOTBALL_API_KEY:'x',FOOTBALL_SCHEDULE_PLAN:'free'},request:async(_,params)=>{
  calls.push(params);return [raw(901,{fixture:{id:901,date:'2026-11-12T19:00:00Z',status:{short:'NS'}}})];
 }});
 assert.deepEqual(calls,[{date:'2026-11-12'}]);
 assert.equal(report.plan,'free');assert.equal(report.limited,true);
 assert.equal(report.events.length,1);
});

test('no publica ni verifica NS: importación solo guarda calendario y deduplica con otras fuentes',async()=>{
 let source=[];const sql=[];
 const conn={query:async(q)=>{
  if(q.includes('nforce_wide_calendar_requests'))return [[{total:0}]];
  return [source.map(x=>({...x}))];
 },execute:async(query,args=[])=>{
  sql.push(query);
  if(query.includes('INSERT IGNORE INTO nforce_matches'))source.push({id:args[0],source_key:args[1],competition:args[2],home_team:args[6],away_team:args[7],match_date:args[8],kickoff:args[9],scheduled_time_known:1});
  return [{affectedRows:1}];
 }};
 const fetchCalendar=async()=>({events:[fixture()],received:1,unmapped:0,limited:false});
 const enabled={conn,now,enabled:true,env:{FOOTBALL_API_KEY:'key',FOOTBALL_SCHEDULE_PLAN:'extended'},fetchCalendar};
 const first=await importWideCalendar(enabled);
 assert.equal(first.inserted,1);assert.equal(first.matched,0);
 const second=await importWideCalendar(enabled);
 assert.equal(second.inserted,0);assert.equal(second.matched,1);
 assert.equal(sql.some(s=>s.includes('INSERT INTO nforce_fixture_schedules')),false);
 assert.equal(sql.some(s=>s.includes('UPDATE predictions')),false);
});

test('falla cerrado por clave ausente, fuente desactivada o cuota diaria agotada',async()=>{
 const conn={query:async()=>[[{total:6}]],execute:async()=>{throw Error('No debe ejecutar SQL');}};
 assert.equal((await importWideCalendar({conn,enabled:false})).requests,0);
 assert.equal((await importWideCalendar({conn,enabled:true,env:{}})).requests,0);
 const limit=await importWideCalendar({conn,enabled:true,env:{FOOTBALL_API_KEY:'k'}});
 assert.equal(limit.limited,true);assert.equal(limit.requests,0);
});

test('perfil VIP v1.9 equilibrado conserva filtros y validación de contexto',()=>{
 assert.equal(MODEL_VERSION,'nforce-poisson-1.9');
 assert.equal(VIP_RISK_POLICY.minTeam,16);assert.equal(VIP_RISK_POLICY.minQuality,81);
 assert.equal(VIP_RISK_POLICY.maxFormAgeDays,35);assert.equal(NATIONAL_VIP_RISK_POLICY.maxFormAgeDays,180);
 assert.equal(VIP_POLICY.minMarket,32);assert.ok(VIP_POLICY.minWilsonLower>=55);
 assert.ok(VIP_POLICY.minBrierSkill>0);assert.ok(VIP_POLICY.minOverall>VIP_POLICY.minMarket);
 const backend=fromRepo('src/nforce-engine.js');
 assert.match(backend,/Number\(metric\?\.evaluated\|\|0\)<VIP_POLICY\.minMarket/);
 assert.match(backend,/evaluateVipEvidence\(row,validation/);
 assert.match(backend,/canAutoPublishCandidate\(row\)/);
});

test('fuente IV solo controlada por el propietario y nunca expone clave en el HTML',async()=>{
 const html=fromRepo('views/panel.html'),ui=fromRepo('public/app.js'),backend=fromRepo('src/nforce-engine.js'),migrate=fromRepo('src/init-db.js');
 assert.match(html,/sportsWideToggle/);assert.match(ui,/sources\/wide-calendar/);
 assert.match(backend,/app\.post\(api\('sources\/wide-calendar'\),authenticate/);
 assert.match(backend,/if\(!owner\(req\)\)return res\.status\(403\)/);
 assert.match(migrate,/apisportswide/);assert.match(migrate,/CREATE TABLE IF NOT EXISTS nforce_wide_calendar_requests/);
 assert.doesNotMatch(html,/private-secret/);
 const db={query:async()=>[[{source_id:'apisportswide',enabled:1,updated_at:null}]]};
 assert.equal((await readWideSource(db)).enabled,true);
 let state=0,logs=0;
 const conn={beginTransaction:async()=>{},execute:async(sql,args)=>{
  if(sql.includes('SELECT enabled'))return [[{enabled:state}]];
  if(sql.startsWith('UPDATE nforce_source_settings'))state=args[0];
  if(sql.includes('INSERT INTO audit_logs'))logs++;
  return [{}];},commit:async()=>{},rollback:async()=>{},release:()=>{}};
 const saved=await saveWideSource({getConnection:async()=>conn},{enabled:true,actorId:4});
 assert.equal(saved.changed,true);assert.equal(state,1);assert.equal(logs,1);
 await assert.rejects(()=>saveWideSource({getConnection:async()=>conn},{enabled:'true',actorId:4}),/booleano/);
});
