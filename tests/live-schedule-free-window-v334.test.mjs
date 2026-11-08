import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleDatesForPlan,allowedDateRangeFromError,installLiveSchedule} from '../src/live-schedule.js';

test('plan gratuito nunca consulta fuera de ayer, hoy y mañana (UTC)',()=>{
 assert.deepEqual(scheduleDatesForPlan('2026-11-08T00:30:00Z').map(x=>x.date),[
  '2026-11-07','2026-11-08','2026-11-09']);
 assert.deepEqual(scheduleDatesForPlan('2026-12-31T23:59:00Z').map(x=>x.date),[
  '2026-12-30','2026-12-31','2027-01-01']);
 assert.deepEqual(scheduleDatesForPlan('2026-11-08T12:00:00Z','extended').map(x=>x.date),[
  '2026-11-08','2026-11-09','2026-11-10','2026-11-11']);
});
test('interpreta el rango informado por un proveedor sin inventar fechas',()=>{
 assert.deepEqual(allowedDateRangeFromError(new Error('API-Football: {"plan":"Free plans do not have access to this date, try from 2026-11-07 to 2026-11-09."}')),
  {from:'2026-11-07',to:'2026-11-09'});
 assert.equal(allowedDateRangeFromError('fetch failed'),null);
});
function fakeDb(){
 return {getConnection:async()=>({
  async query(sql){
   if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
   if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
   if(sql.includes('COUNT(*) AS calls'))return [[{calls:0}]];
   if(sql.includes('GROUP BY day_utc'))return [[]];
   if(sql.includes('FROM nforce_matches m'))return [[]];
   throw Error('Unexpected SQL: '+sql);
  },
  async execute(){return [{affectedRows:1}]},release(){}
 })};
}
test('sincronización free omite días +2 y +3 y mantiene el análisis predictivo independiente',async()=>{
 const requested=[];
 const updater=installLiveSchedule({get(){}},{db:fakeDb(),authenticate(){},
  now:()=>new Date('2026-11-08T12:00:00Z'),
  env:{FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'mock'},
  request:async(_,params)=>{requested.push(params.date);if(params.date>'2026-11-09')throw Error('fecha no permitida');return []}});
 const result=await updater.sync();
 assert.equal(result.ok,true);
 assert.equal(result.requests,3);
 assert.deepEqual(requested,['2026-11-07','2026-11-08','2026-11-09']);
});
test('aprende un rango más estrecho, evita reintentos fuera del rango en el mismo día',async()=>{
 const requested=[];
 const updater=installLiveSchedule({get(){}},{db:fakeDb(),authenticate(){},
  now:()=>new Date('2026-11-08T12:00:00Z'),
  env:{FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'mock'},
  request:async(_,params)=>{
   requested.push(params.date);
   if(params.date==='2026-11-09')throw new Error('API-Football: {"plan":"Free plans do not have access to this date, try from 2026-11-07 to 2026-11-08."}');
   return [];
  }});
 await updater.sync({force:true});
 await updater.sync({force:true});
 assert.deepEqual(requested,['2026-11-07','2026-11-08','2026-11-09','2026-11-07','2026-11-08']);
});

test('el panel explica el rango de fechas sin confundir configuración con sincronización real',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/Fechas consultables \(UTC\)/);
 assert.match(js,/Calendario con incidencia/);
});
