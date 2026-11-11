import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nforceSourceReadiness} from '../src/nforce-source-readiness.js';
import {installNforceEngine} from '../src/nforce-engine.js';
import {MODEL_VERSION} from '../src/nforce-model.js';

const now=new Date('2026-11-10T12:00:00Z');
const kickoff=new Date('2026-11-12T20:00:00Z');
const base={kickoff,source_checked_at:new Date('2026-11-08T00:00:00Z'),
 home_goals:null,away_goals:null,live_status:'NS',schedule_verified_at:new Date('2026-11-10T11:30:00Z')};

test('fresh independently verified NS status clears older source timestamp only when live checking is enabled',()=>{
 const valid=nforceSourceReadiness(base,kickoff,{now,requireLive:true});
 assert.equal(valid.ready,true);
 assert.equal(valid.verified_schedule,true);
 assert.equal(valid.community_fresh,false);
 const disabled=nforceSourceReadiness(base,kickoff,{now,requireLive:false});
 assert.equal(disabled.ready,false);
 assert.equal(disabled.code,'calendar_stale');
 assert.match(disabled.message,/Reanalizar esta propuesta/);
});

test('stale community and stale/missing live verification both fail closed',()=>{
 assert.equal(nforceSourceReadiness({...base,schedule_verified_at:new Date('2026-11-10T04:00:00Z')},kickoff,{now,requireLive:true}).code,'live_verification_missing');
 assert.equal(nforceSourceReadiness({...base,schedule_verified_at:null},kickoff,{now,requireLive:false}).code,'calendar_stale');
 assert.equal(nforceSourceReadiness({...base,home_goals:2},kickoff,{now,requireLive:true}).code,'started_or_finished');
 assert.equal(nforceSourceReadiness({...base,live_status:'FT'},kickoff,{now,requireLive:true}).code,'started_or_finished');
 assert.equal(nforceSourceReadiness({...base,kickoff:new Date('2026-11-12T21:00:00Z')},kickoff,{now,requireLive:true}).code,'schedule_changed');
 assert.equal(nforceSourceReadiness(base,new Date('2026-11-10T12:10:00Z'),{now,requireLive:true}).code,'kickoff_passed');
});

test('old draft publishes without creating a new candidate after explicit reanalysis, if latest verified schedule is good',async()=>{
 const oldLive=process.env.FOOTBALL_SCHEDULE_LIVE,oldKey=process.env.FOOTBALL_API_KEY,oldPlan=process.env.FOOTBALL_SCHEDULE_PLAN;
 process.env.FOOTBALL_SCHEDULE_LIVE='true';process.env.FOOTBALL_API_KEY='test-key';process.env.FOOTBALL_SCHEDULE_PLAN='extended';
 try{
  const teams=Array.from({length:12},(_,i)=>'Club '+String.fromCharCode(65+i));
  let state=123;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const historical=[];
  for(let i=0;i<280;i++){
   let h=Math.floor(random()*12),a=Math.floor(random()*11);if(a>=h)a++;
   const date=new Date(now.getTime()-(280-i)*8*3600000);
   historical.push({id:i+1,competition:'en.1',league:'Premier League',home:teams[h],away:teams[a],
    kickoff:date.toISOString(),scheduled_time_known:1,home_goals:Math.floor(random()*4),away_goals:Math.floor(random()*3),source_checked_at:now});
  }
  const fixture={...base,id:999101,competition:'en.1',league:'Premier League',home:'Club L',away:'Club B',scheduled_time_known:1};
  const row={id:101,provider:'nforce-openfootball',fixture_id:fixture.id,visibility:'free',home_team:fixture.home,away_team:fixture.away,
   league:fixture.league,kickoff,market:'1X2',selection:'Local',provider_probability:51,odds:null,
   analysis:'Borrador antiguo',evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.2'}}),status:'draft'};
  let inserted=0,sent=0;
  const conn=()=>({
   beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
   async query(sql){if(sql.includes('FROM admins'))return [[{id:5}]];throw Error('Unexpected query '+sql.slice(0,80));},
   async execute(sql,args=[]){
    if(sql.includes('SELECT * FROM football_candidates WHERE id='))return [[row]];
    if(sql.includes('FROM nforce_matches m LEFT JOIN nforce_fixture_schedules'))return [[fixture]];
    if(sql.includes('SELECT p.id FROM predictions'))return [[]];
    if(sql.includes('UPDATE football_candidates SET visibility=')){
     Object.assign(row,{visibility:args[0],home_team:args[1],away_team:args[2],league:args[3],kickoff:args[4],market:args[5],selection:args[6],provider_probability:args[7],analysis:args[8],evidence_json:args[9]});return [{affectedRows:1}];
    }
    if(sql.includes('INSERT INTO predictions')){inserted++;return [{insertId:313}];}
    if(sql.includes("UPDATE football_candidates SET status='published'")){row.status='published';return [{affectedRows:1}];}
    if(sql.includes('INSERT INTO audit_logs')||sql.includes('UPDATE predictions SET telegram_status'))return [{affectedRows:1}];
    throw Error('Unexpected execute '+sql.slice(0,100));
   }
  });
  const db={getConnection:async()=>conn(),
   query:async(sql)=>{if(sql.includes('FROM nforce_matches m LEFT JOIN nforce_fixture_schedules'))
    return [[...historical,fixture].map(m=>({...m,date_label:m.kickoff.toString().slice(0,10),round_name:'Round'}))];
    throw Error('Unexpected DB query '+sql.slice(0,80));},
   execute:async(sql,args)=>conn().execute(sql,args)};
  const engine=installNforceEngine({get(){},post(){}},{db,authenticate(){},now:()=>now,
   sendTelegram:async()=>{sent++;return {state:'sent'};}});
  await assert.rejects(()=>engine.publish(row.id,{id:5}),/versión anterior/);
  const refreshed=await engine.refreshCandidate(row.id,{id:5});
  assert.equal(refreshed.refreshed,true,JSON.stringify(refreshed));
  assert.equal(row.visibility,'gold');
  assert.equal(JSON.parse(row.evidence_json).model.model,MODEL_VERSION);
  assert.equal(inserted,0,'reanalysis does not publish');
  const result=await engine.publish(row.id,{id:5});
  assert.equal(result.published,true);
  assert.equal(result.prediction_id,313);
  assert.equal(inserted,1);
  assert.equal(sent,1);
 }finally{
  if(oldPlan===undefined)delete process.env.FOOTBALL_SCHEDULE_PLAN;else process.env.FOOTBALL_SCHEDULE_PLAN=oldPlan;
  if(oldLive===undefined)delete process.env.FOOTBALL_SCHEDULE_LIVE;else process.env.FOOTBALL_SCHEDULE_LIVE=oldLive;
  if(oldKey===undefined)delete process.env.FOOTBALL_API_KEY;else process.env.FOOTBALL_API_KEY=oldKey;
 }
});

test('admin panel shows explicit freshness diagnosis and never enables publish on an unverified fixture',()=>{
 const backend=readFileSync(new URL('../src/nforce-engine.js',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(backend,/source_readiness=nforceSourceReadiness\(row,row\.candidate_kickoff/);
 assert.match(backend,/LEFT JOIN nforce_matches m ON m\.id=c\.fixture_id/);
 assert.match(frontend,/c\.source_readiness&&!c\.source_readiness\.ready/);
 assert.match(frontend,/Actualizar datos deportivos/);
 assert.match(frontend,/Reanalizar esta propuesta/);
});
