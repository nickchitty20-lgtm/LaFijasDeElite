import test from 'node:test';
import assert from 'node:assert/strict';
import {SECONDARY_COMPETITIONS,normalizeSecondaryEvent,reconcileSecondaryEvents,fetchSecondaryLeague,importSecondaryFixtures} from '../src/secondary-fixtures.js';
const now=new Date('2026-11-11T12:00:00Z');
const example=(overrides={})=>({idLeague:'4328',idEvent:'123456789',strSport:'Soccer',
 strHomeTeam:'Arsenal',strAwayTeam:'Chelsea',dateEvent:'2026-11-16',
 strTimestamp:'2026-11-16T20:00:00+00:00',strStatus:'Not Started',...overrides});

test('complementary leagues: domestic and national competitions are explicit, unique',()=>{
 assert.ok(SECONDARY_COMPETITIONS.length>=20);
 assert.equal(new Set(SECONDARY_COMPETITIONS.map(x=>x.id)).size,SECONDARY_COMPETITIONS.length);
 assert.ok(SECONDARY_COMPETITIONS.some(x=>x.code==='int.friendly'));
});
test('normalizes an actual UTC fixture without treating it as a live verification',()=>{
 const e=normalizeSecondaryEvent(example(),'en.1',now);
 assert.equal(e.competition,'en.1');assert.equal(e.kickoff,'2026-11-16T20:00:00.000Z');
 assert.equal(e.source_path,'secondary/thesportsdb');
 assert.equal(e.home_goals,null);assert.equal(e.away_goals,null);
 assert.equal(e.scheduled_time_known,true);
 assert.equal(normalizeSecondaryEvent(example(),'en.1',now).id,e.id);
});
test('rejects no UTC clock, result, unknown league, no-teams, dates past and final',()=>{
 for(const v of [
 {strTimestamp:null},{strTimestamp:'2026-11-16T20:00:00'},
 {strTimestamp:'2026-11-10T20:00:00+00:00',dateEvent:'2026-11-10'},
 {strTimestamp:'2026-12-20T20:00:00+00:00',dateEvent:'2026-12-20'},
 {strStatus:'Match Finished'},{strStatus:'Postponed'},{strStatus:'HT'},{strStatus:'TBD'},{strPostponed:'yes'},
 {intHomeScore:'2'},{strAwayTeam:'Arsenal'},
 {strSport:'Ice Hockey'}, {idLeague:'123456'}]){
  assert.equal(normalizeSecondaryEvent(example(v),'en.1',now),null,JSON.stringify(v));
 }
});
test('parses TheSportsDB UTC timestamps without Z only with matching UTC date and time',()=>{
 const actual=example({strTimestamp:'2026-11-16T20:00:00',strTime:'20:00:00',strStatus:'NS'});
 assert.equal(normalizeSecondaryEvent(actual,'en.1',now)?.kickoff,'2026-11-16T20:00:00.000Z');
 assert.equal(normalizeSecondaryEvent({...actual,strTime:'11:00:00'},'en.1',now),null);
 assert.equal(normalizeSecondaryEvent({...actual,strTimestamp:'2026-11-16T99:00:00'},'en.1',now),null);
});
test('national team classification is league-id based and canonicalizes aliases',()=>{
 const e=normalizeSecondaryEvent(example({idLeague:'4562',strHomeTeam:'USA',strAwayTeam:'Iran'}),'int.friendly',now);
 assert.equal(e.home,'United States'); assert.equal(e.league,'Amistosos internacionales');
 assert.equal(normalizeSecondaryEvent(example(),'int.friendly',now),null);
});
test('deduplicates existing local fixture with same teams and league',()=>{
 const e=normalizeSecondaryEvent(example(),'en.1',now);
 const old={id:455,competition:'en.1',home_team:'Arsenal FC',away_team:'Chelsea FC',match_date:'2026-11-16',kickoff:null};
 const r=reconcileSecondaryEvents([e],[old]);
 assert.equal(r.updates.length,1);assert.equal(r.inserts.length,0);
 const ambiguous=reconcileSecondaryEvents([e],[old,{...old,id:456}]);
 assert.equal(ambiguous.ambiguous.length,1);assert.equal(ambiguous.inserts.length,0);
 const rescheduled=reconcileSecondaryEvents([{...e,kickoff:'2026-11-20T20:00:00.000Z'}],
  [{...old,source_key:e.source_key}]);
 assert.equal(rescheduled.updates.length,1);assert.equal(rescheduled.inserts.length,0);
});
test('fetcher targets only whitelisted endpoint and handles trimmed and invalid payloads',async()=>{
 const urls=[];
 const fetcher=async url=>{urls.push(url);return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({events:[example()]})};};
 const ev=await fetchSecondaryLeague('en.1',{fetcher,now});
 assert.equal(ev.length,1);assert.match(urls[0],/\/api\/v1\/json\/123\/eventsnextleague\.php\?id=4328$/);
 await assert.rejects(()=>fetchSecondaryLeague('unknown',{fetcher,now}),/no admitida/);
 await assert.rejects(()=>fetchSecondaryLeague('en.1',{fetcher,key:'../abc',now}),/inválida/);
 const missing=await fetchSecondaryLeague('en.1',{fetcher:async()=>({ok:true,headers:{get:()=>null},text:async()=>'{"events":null}' }),now});
 assert.equal(missing.length,0);
});
test('secondary import is opt-in; mock DB inserts new events without score or NS status',async()=>{
 const calls=[],rows=[];
 const conn={query:async sql=>{calls.push(sql);return [rows.map(x=>({...x}))]},execute:async(sql,args)=>{calls.push(sql);if(sql.includes('INSERT IGNORE'))rows.push({id:args[0],competition:args[2],home_team:args[6],away_team:args[7],match_date:args[8],kickoff:args[9]});return [{affectedRows:1}]}};
 const off=await importSecondaryFixtures({conn,now,env:{FOOTBALL_SECONDARY_SCHEDULE:'false'}});
 assert.equal(off.enabled,false);assert.equal(calls.length,0);
 const mock=async(code)=>code==='en.1'?[normalizeSecondaryEvent(example(),'en.1',now)]:[];
 const on=await importSecondaryFixtures({conn,now,fetchLeague:mock,env:{FOOTBALL_SECONDARY_SCHEDULE:'true'}});
 assert.equal(on.inserted,1);assert.equal(on.matched,0);assert.equal(on.requests,SECONDARY_COMPETITIONS.length);
 assert.equal(calls.filter(x=>x.includes('nforce_fixture_schedules')&&x.includes('INSERT')).length,0);
 const repeat=await importSecondaryFixtures({conn,now,fetchLeague:mock,env:{FOOTBALL_SECONDARY_SCHEDULE:'true'}});
 assert.equal(repeat.inserted,0);assert.equal(repeat.matched,1);
});
