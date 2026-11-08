import test from 'node:test';
import assert from 'node:assert/strict';
import {installNforceEngine} from '../src/nforce-engine.js';
import {MODEL_VERSION} from '../src/nforce-model.js';

// Test the actual importer, scanner, draft persistence, approval and Telegram
// dispatch with an in-memory MySQL-shaped fake. No real API, DB, token or post.
test('N-FORCE local: datos CC0 simulados → MySQL → pronóstico GRATIS → Telegram',async()=>{
 const now=new Date('2026-11-10T12:00:00Z');
 const saved={...process.env};
 process.env.FOOTBALL_AUTO_PUBLISH='false';
 const teams=Array.from({length:12},(_,i)=>'Club '+String.fromCharCode(65+i));
 const matches=[];
 for(let i=0;i<240;i++){
  const home=teams[i%12],away=teams[(i+1+Math.floor(i/12)%10)%12];
  if(home===away)continue;
  const kickoff=new Date(now.getTime()-(240-i)*11*3600000).toISOString();
  matches.push({id:i+1,source_key:`2026-27/en.1.json|${home}|${away}|${i}`,competition:'en.1',league:'Premier League',season:'2026-27',round:'Matchday 1',home,away,
   date:kickoff.slice(0,10),kickoff,scheduled_time_known:true,home_goals:i%4===0?3:2,away_goals:i%3===0?2:0,source_path:'2026-27/en.1.json'});
 }
 const future={id:887799,source_key:'2026-27/en.1.json|Club A|Club B',competition:'en.1',league:'Premier League',season:'2026-27',round:'Matchday 30',
  home:'Club A',away:'Club B',date:'2026-11-12',kickoff:'2026-11-12T20:00:00.000Z',scheduled_time_known:true,
  home_goals:null,away_goals:null,source_path:'2026-27/en.1.json'};
 const table=[],candidates=[],published=[],telegram=[];let importId=0,scanId=0,createdId=900,validation=null;
 function shape(m){return {...m,home_team:m.home,away_team:m.away,round_name:m.round,match_date:m.date,source_checked_at:now};}
 const connection=()=>({
  async query(sql,args=[]){
   if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
   if(sql.includes('RELEASE_LOCK'))return [[{acquired:1}]];
   if(sql.includes('FROM nforce_import_runs'))return [[null]];
   if(sql.includes('FROM nforce_scans'))return [[null]];
   if(sql.includes('FROM admins'))return [[{id:22}]];
   if(sql.includes('FROM nforce_backtests'))return [[validation]];
   throw Error('No se esperaba conn.query: '+sql.slice(0,130));
  },
  async execute(sql,args=[]){
   if(sql.includes('INSERT INTO nforce_import_runs'))return [{insertId:++importId}];
   if(sql.includes('INSERT INTO nforce_matches')){
    for(let i=0;i<args.length;i+=14){const [id,source_key,competition,league,season,round_name,home_team,away_team,match_date,kickoff,scheduled_time_known,home_goals,away_goals,source_path]=args.slice(i,i+14);
     const index=table.findIndex(x=>x.id===id);const entry={id,source_key,competition,league,season,round_name,home_team,away_team,match_date,kickoff,
      scheduled_time_known,home_goals,away_goals,source_path,source_checked_at:now};
     if(index>=0)table[index]=entry;else table.push(entry);
    }return [{affectedRows:args.length/14}];
   }
   if(sql.includes('UPDATE nforce_import_runs'))return [{affectedRows:1}];
   if(sql.includes('INSERT INTO nforce_scans'))return [{insertId:++scanId}];
   if(sql.includes('INSERT IGNORE INTO football_candidates')){
    const [provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json]=args;
    if(candidates.some(x=>x.fixture_id===fixture_id))return [{affectedRows:0}];
    candidates.push({id:candidates.length+1,provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status:'draft'});
    return [{affectedRows:1}];
   }
   if(sql.includes('UPDATE nforce_scans'))return [{affectedRows:1}];
   if(sql.includes('SELECT * FROM football_candidates WHERE id='))return [candidates.filter(x=>x.id===args[0])];
   if(sql.includes('FROM nforce_matches m LEFT JOIN nforce_fixture_schedules'))return [[table.find(x=>x.id===args[0])]];
   if(sql.includes('SELECT p.id FROM predictions'))return [[]];
   if(sql.includes('INSERT INTO predictions')){published.push({id:++createdId,values:args});return [{insertId:createdId}];}
   if(sql.includes("UPDATE football_candidates SET status='published'")){const c=candidates.find(x=>x.id===args[1]);c.status='published';return [{affectedRows:1}];}
   if(sql.includes('INSERT INTO audit_logs'))return [{affectedRows:1}];
   if(sql.includes('UPDATE predictions'))return [{affectedRows:1}];
   throw Error('No se esperaba conn.execute: '+sql.slice(0,130));
  },
  async beginTransaction(){},async commit(){},async rollback(){},release(){}
 });
 const db={getConnection:async()=>connection(),
  query:async(sql,args=[])=>{
   if(sql.includes('FROM nforce_matches'))return [table.map(x=>({...x,home:x.home_team,away:x.away_team,date_label:x.match_date,
     round:x.round_name}))];
   throw Error('No se esperaba db.query: '+sql.slice(0,130));
  },
  execute:async(sql,args)=>connection().execute(sql,args)};
 const app={get(){},post(){}};
 const controller=installNforceEngine(app,{db,authenticate(){},now:()=>now,
  fetchDataset:async(ds)=>ds.path==='2026-27/en.1.json'?[...matches,future]:[],
  sendTelegram:async(payload)=>{telegram.push(payload);return {state:'sent'};},enqueueEvent:async()=>{}});
 try{
  const imported=await controller.importData();
  assert.equal(imported.sources,1);assert.equal(imported.records,matches.length+1);
  assert.equal(table.length,matches.length+1);
  const scanned=await controller.scan({manual:true});
  assert.equal(scanned.ok,true);assert.equal(scanned.lookahead_days,3);assert.equal(scanned.fixtures_in_window,1);assert.equal(scanned.drafts_created,1);
  assert.equal(candidates[0].provider,'nforce-openfootball');
  assert.ok(JSON.parse(candidates[0].evidence_json).model.model===MODEL_VERSION);
  assert.equal(candidates[0].visibility,'free','La simulación no debe producir una VIP sin ventaja estadística');
  const approved=await controller.publish(candidates[0].id,{id:22});
  assert.equal(approved.published,true);
  assert.equal(approved.telegram,'sent');
  assert.equal(published.length,1);assert.equal(telegram.length,1);
  assert.equal(telegram[0].visibility,'free');
  assert.equal(telegram[0].odds,null);
  const again=await controller.publish(candidates[0].id,{id:22});
  assert.equal(again.published,false);
 }finally{process.env.FOOTBALL_AUTO_PUBLISH=saved.FOOTBALL_AUTO_PUBLISH;}
});
