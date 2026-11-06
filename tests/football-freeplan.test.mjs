import test from 'node:test';
import assert from 'node:assert/strict';
import {headToHeadParams,latestCompletedHeadToHead,createAssessment} from '../src/football-analysis.js';

const match=(id, date, status='FT')=>({
 fixture:{id,date,status:{short:status}}
});

test('plan Free: head-to-head query nunca usa el parámetro de pago last',()=>{
 assert.deepEqual(headToHeadParams('12',34),{h2h:'12-34'});
 assert.equal('last' in headToHeadParams(12,34),false);
 assert.throws(()=>headToHeadParams('invalid',34),/inválidos/);
});

test('filtra localmente cinco H2H finalizados recientes aunque el proveedor no los ordene',()=>{
 const rows=[match(1,'2024-01-01T12:00:00Z'),match(2,'2026-01-01T12:00:00Z'),match(3,'2025-04-01T12:00:00Z'),
  match(4,'2026-10-01T12:00:00Z'),match(5,'2026-02-01T12:00:00Z'),match(6,'2026-04-01T12:00:00Z'),match(7,'2026-11-11T12:00:00Z','NS')];
 const original=rows.slice();
 assert.deepEqual(latestCompletedHeadToHead(rows).map(x=>x.fixture.id),[4,6,5,2,3]);
 assert.deepEqual(rows,original);
});

test('H2H opcional puede complementar dos evidencias sin crear una cuota',()=>{
 const fixture={fixture:{id:1000,date:'2026-11-06T18:00:00Z',status:{short:'NS'}},league:{name:'Liga'},teams:{home:{name:'Local',id:10},away:{name:'Visitante',id:20}}};
 const p={predictions:{percent:{home:'77%',draw:'13%',away:'10%'}},comparison:{att:{home:'60%',away:'40%'}}};
 const history=[match(9,'2024-11-11T12:00:00Z'),match(10,'2025-11-11T12:00:00Z')];
 assert.equal(createAssessment(fixture,p),null);
 const got=createAssessment(fixture,p,{h2h:history});
 assert.equal(got?.visibility,'vip');
 assert.equal(got?.raw_evidence.h2h_count,2);
 assert.equal(got?.odds,null);
});
