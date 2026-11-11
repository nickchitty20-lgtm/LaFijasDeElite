import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTomorrowCalendar,summarizeCalendarAudit} from '../src/nforce-fixture-audit.js';
import {fetchWideCalendar,importWideCalendar} from '../src/api-football-wide.js';
import {readFileSync} from 'node:fs';
const now=new Date('2026-11-11T21:00:00Z');
const fixture=(id,league,home,away,status='NS',date='2026-11-12T18:00:00Z')=>({
 fixture:{id,date,status:{short:status}},league:{id:league,name:league===5?'UEFA Nations League':'Other League',season:2026},
 teams:{home:{name:home},away:{name:away}}});
const known=fixture(1002,5,'Türkiye','Belgium');
const unknown=fixture(1003,50231,'Some Other Team','Other Team');
const finished=fixture(1004,5,'England','Croatia','FT');

test('auditoría detecta Nations League de mañana y diferencias entre API y MySQL, sin crear pronósticos',async()=>{
 const summary=summarizeCalendarAudit([known,unknown,finished],[],{now});
 assert.equal(summary.date_utc,'2026-11-12');
 assert.equal(summary.received,3);
 assert.equal(summary.missing_in_mysql,1);
 assert.equal(summary.unmapped,1);
 assert.equal(summary.excluded,1);
 assert.match(summary.diagnosis,/todavía no están en MySQL/);
 const withDb=summarizeCalendarAudit([known], [{competition:'int.unl',home_team:'Turkey',away_team:'Belgium',match_date:'2026-11-12'}],{now});
 assert.equal(withDb.in_mysql,1);
 assert.equal(withDb.missing_in_mysql,0);
});

test('auditoría consulta solo la fecha de mañana con una llamada y falla si no hay clave',async()=>{
 const calls=[];
 await assert.rejects(()=>auditTomorrowCalendar({env:{},now}),/Falta FOOTBALL_API_KEY/);
 const r=await auditTomorrowCalendar({env:{FOOTBALL_API_KEY:'test'},now,request:async(endpoint,params)=>{
  calls.push({endpoint,params});return [known,unknown];
 }});
 assert.deepEqual(calls,[{endpoint:'fixtures',params:{date:'2026-11-12'}}]);
 assert.equal(r.missing_in_mysql,1);
});

test('el calendario gratuito importa tanto hoy como mañana sin confirmar horarios en vivo',async()=>{
 const calls=[];
 const today=fixture(999,5,'Italy','France','NS','2026-11-11T23:00:00Z');
 const tomorrow=known;
 const response=await fetchWideCalendar({now,env:{FOOTBALL_API_KEY:'test'},request:async(_,params)=>{
  calls.push(params.date);return params.date==='2026-11-11'?[today]:[tomorrow];
 }});
 assert.deepEqual(calls,['2026-11-11','2026-11-12']);
 assert.equal(response.events.length,2);
 assert.equal(response.events[0].scheduled_time_known,true);
 assert.equal(response.errors.length,0);
 const queries=[];
 const conn={query:async(q)=>q.includes('nforce_wide_calendar_requests')?[[{total:0}]]:[[]],
 execute:async(q)=>{queries.push(q);return [{affectedRows:1}];}};
 const result=await importWideCalendar({conn,now,enabled:true,env:{FOOTBALL_API_KEY:'test'},fetchCalendar:async()=>response});
 assert.equal(result.inserted,2);assert.equal(result.requests,2);
 assert.equal(queries.filter(x=>x.includes('nforce_wide_calendar_requests')).length,2);
 assert.equal(queries.some(x=>x.includes('nforce_fixture_schedules')),false);
});

test('el panel incluye auditoría de mañana solo para propietario',()=>{
 const backend=readFileSync(new URL('../src/nforce-engine.js',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
 assert.match(backend,/app\.get\(api\('calendar-audit'\),authenticate/);
 assert.match(backend,/if\(!owner\(req\)\)return res\.status\(403\)/);
 assert.match(frontend,/api\/admin\/football\/calendar-audit/);
 assert.match(html,/sportsTomorrowAudit/);
});
