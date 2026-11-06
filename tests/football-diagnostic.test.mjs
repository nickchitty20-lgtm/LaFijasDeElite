import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseFootball} from '../src/football-diagnostic.js';

const now=new Date('2026-11-06T15:00:00.000Z');
const fixture=(date)=>({fixture:{id:501,date,status:{short:'NS'}},teams:{home:{id:1,name:'Club A'},away:{id:2,name:'Club B'}},league:{name:'Liga de ejemplo'}});
const prediction={predictions:{percent:{home:'77%',draw:'13%',away:'10%'}},teams:{home:{last_5:{form:'70%'}},away:{last_5:{form:'40%'}}},comparison:{att:{home:'65%',away:'35%'},def:{home:'57%',away:'43%'}}};

test('prueba API sin publicar; demuestra conexión y partido apto',async()=>{
 const called=[];
 const request=async(endpoint,params)=>{
  called.push([endpoint,params]);
  if(endpoint==='status')return {requests:{current:15,limit:100}};
  if(endpoint==='fixtures')return [fixture('2026-11-06T17:00:00Z')];
  if(endpoint==='predictions')return [prediction];
  throw Error('unexpected endpoint');
 };
 const r=await diagnoseFootball({now,request});
 assert.equal(r.ok,true);assert.equal(r.read_only,true);
 assert.equal(r.api_connected,true);assert.equal(r.provider_requests_limit,100);
 assert.equal(r.fixtures_in_window,1);
 assert.equal(r.sample.prediction_available,true);
 assert.equal(r.sample.passes_filters,true);
 assert.equal(r.sample.visibility,'vip');
 assert.deepEqual(called.map(c=>c[0]),['status','fixtures','predictions']);
});

test('no partidos entre 1 y 6 horas: muestra el motivo sin consultar predicciones',async()=>{
 const calls=[];
 const request=async(endpoint,params)=>{
  calls.push(endpoint);
  return endpoint==='status'?{requests:{current:2,limit:100}}:[fixture('2026-11-06T23:00:00Z')];
 };
 const r=await diagnoseFootball({now,request});
 assert.equal(r.ok,true);assert.equal(r.fixtures_in_window,0);
 assert.match(r.reason,/no hay partidos válidos/);
 assert.equal(r.sample,null);
 assert.deepEqual(calls,['status','fixtures']);
});

test('predicciones sin evidencia suficiente se informan sin fabricar propuestas',async()=>{
 const request=async(endpoint)=>endpoint==='status'?{requests:{current:0,limit:100}}:endpoint==='fixtures'?[fixture('2026-11-06T17:00:00Z')]:[{
  predictions:{percent:{home:'80%',draw:'10%',away:'10%'}}
 }];
 const r=await diagnoseFootball({now,request});
 assert.equal(r.sample.prediction_available,true);
 assert.equal(r.sample.passes_filters,false);
 assert.match(r.reason,/no cumple los filtros/);
});

test('credenciales rechazadas: error API visible, no simula éxito',async()=>{
 await assert.rejects(diagnoseFootball({now,request:async()=>{throw Error('API-Football HTTP 401')}}),/401/);
});

test('cruce de medianoche: consulta dos fechas y no más de 4 peticiones en total',async()=>{
 const late=new Date('2026-11-06T22:00:00Z');
 const dates=[];
 const request=async(endpoint,params)=>{
  if(endpoint==='fixtures'){dates.push(params.date);return [];}
  if(endpoint==='status')return {};
  throw Error('No debe llamar predicciones sin partidos');
 };
 const r=await diagnoseFootball({now:late,request});
 assert.deepEqual(dates,['2026-11-06','2026-11-07']);
 assert.equal(r.api_calls,3);
});
