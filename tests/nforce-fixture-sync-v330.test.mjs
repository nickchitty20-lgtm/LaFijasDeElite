import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixturePhase,validateManualFixtureUpdate,reconcileLinkedFixtureTimes} from '../src/nforce-fixture-sync.js';

const now=new Date('2026-11-07T16:00:00Z');
const match={kickoff:'2026-11-07T17:30:00Z',home_goals:null,away_goals:null,scheduled_time_known:1};
test('future schedule can be shown as scheduled, but never as verified live',()=>{
 assert.deepEqual(fixturePhase(match,now),{status:'scheduled',verified:false,label:'Programado · horario sin confirmación independiente'});
 const stale={...match,kickoff:'2026-11-07T15:00:00Z'};
 assert.equal(fixturePhase(stale,now).status,'unconfirmed');
});
test('a finished state requires a score, not elapsed clock time',()=>{
 assert.equal(fixturePhase({...match,kickoff:'2026-11-07T14:00:00Z',home_goals:1,away_goals:2},now).status,'finished');
 assert.equal(fixturePhase({...match,kickoff:'2026-11-07T14:00:00Z',home_goals:1,away_goals:null},now).status,'unconfirmed');
});
test('postponed and cancelled are not shown as finished even if an old score lingers',()=>{
 for(const state of ['postponed','cancelled']){
  assert.equal(fixturePhase({...match,override_status:state,home_goals:1,away_goals:0},now).status,state);
 }
});
test('manual live confirmation expires automatically to unknown',()=>{
 const row={...match,kickoff:'2026-11-07T14:00:00Z',override_status:'live',override_checked_at:'2026-11-07T15:30:00Z'};
 assert.equal(fixturePhase(row,now).status,'live');
 assert.equal(fixturePhase(row,new Date('2026-11-07T17:05:00Z')).status,'unconfirmed');
});
test('a corrected kickoff takes precedence over imported stale kickoff',()=>{
 assert.equal(fixturePhase({...match,kickoff:'2026-11-07T15:00:00Z',effective_kickoff:'2026-11-07T17:30:00Z'},now).status,'scheduled');
});
test('manual verified schedule must have an explicit UTC offset and valid range',()=>{
 assert.deepEqual(validateManualFixtureUpdate({action:'clear'},now),{action:'clear',status:null,kickoff:null});
 assert.deepEqual(validateManualFixtureUpdate({status:'scheduled',kickoff:'2026-11-07T12:30:00-05:00'},now),{action:'set',status:'scheduled',kickoff:'2026-11-07 17:30:00'});
 assert.throws(()=>validateManualFixtureUpdate({status:'scheduled',kickoff:'2026-11-07T12:30:00'},now),/ISO 8601/);
 assert.throws(()=>validateManualFixtureUpdate({status:'scheduled',kickoff:'2026-11-07T14:00:00Z'},now),/futuro/);
 assert.throws(()=>validateManualFixtureUpdate({status:'unsupported'},now),/inválido/);
});
test('live status cannot be declared for tomorrow or ancient fixtures',()=>{
 assert.throws(()=>validateManualFixtureUpdate({status:'live',kickoff:'2026-11-08T16:00:00Z'},now),/EN VIVO/);
 assert.throws(()=>validateManualFixtureUpdate({status:'live',kickoff:'2026-11-06T16:00:00Z'},now),/EN VIVO/);
 assert.equal(validateManualFixtureUpdate({status:'live',kickoff:'2026-11-07T15:00:00Z'},now).status,'live');
});
test('published pending fixtures keep prediction and candidate times in sync; settled never change',async()=>{
 const calls=[];
 const conn={execute:async(sql,args)=>{calls.push({sql,args});return [{affectedRows:calls.length===1?2:3}];}};
 const result=await reconcileLinkedFixtureTimes(conn,'nforce-openfootball');
 assert.deepEqual(result,{published_updated:2,drafts_updated:3});
 assert.match(calls[0].sql,/p\.outcome='pending'/);
 assert.match(calls[0].sql,/p\.match_date=/);
 assert.doesNotMatch(calls[0].sql.split('WHERE')[0],/p\.outcome=|p\.selection=|p\.published_at=/);
 assert.match(calls[1].sql,/c\.status='draft'/);
 assert.match(calls[1].sql,/schedule_changed/);
 assert.ok(calls.every(x=>x.args[0]==='nforce-openfootball'));
});
test('the importer reconciles and refreshes cards without altering markets and selections',()=>{
 const server=readFileSync(new URL('../src/nforce-engine.js',import.meta.url),'utf8');
 assert.match(server,/reconcileLinkedFixtureTimes\(conn,NFORCE_PROVIDER\)/);
 assert.match(server,/COALESCE\(m\.override_kickoff,m\.kickoff\) AS effective_kickoff/);
 assert.match(server,/fixturePhase\(/);
 assert.match(server,/fixtures\/:id\/schedule/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/Verificar \/ corregir horario/);
 assert.match(app,/America\/Lima/);
 assert.match(app,/match_status_label/);
 const settle=readFileSync(new URL('../src/nforce-settlement.js',import.meta.url),'utf8');
 assert.match(settle,/override_status/);
});

test('customer API exposes only a safe fixture state for locked VIP picks',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/const fixtureInfo=matchPhase/);
 assert.match(server,/locked:true,\.\.\.fixtureInfo/);
 assert.match(server,/fixture_provider,effective_kickoff,override_status/);
 const client=readFileSync(new URL('../public/clientes.js',import.meta.url),'utf8');
 assert.match(client,/fixture_status_label/);
});
