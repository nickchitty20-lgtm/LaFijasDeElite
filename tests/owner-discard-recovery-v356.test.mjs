import {MODEL_VERSION} from '../src/nforce-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installNforceEngine} from '../src/nforce-engine.js';

const getFile=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function setup({matches=[],candidate=null,now='2026-11-11T04:43:00Z'}={}){
 const handlers=new Map();const queries=[];let rollback=0,commit=0;
 const app={get(path,auth,fn){handlers.set('GET '+path,fn);},post(path,auth,fn){handlers.set('POST '+path,fn);}};
 const connection={
  query:async sql=>{if(sql.includes('GET_LOCK')||sql.includes('RELEASE_LOCK'))return [[{acquired:1}]];throw Error('Unexpected lock query');},
  execute:async(sql,args=[])=>{
   queries.push({sql,args});
   if(sql.includes('SELECT * FROM football_candidates WHERE id=? AND provider=?'))return [[candidate]];
   if(sql.includes('SELECT id FROM predictions WHERE title='))return [[]];
   if(sql.includes("UPDATE football_candidates SET status='draft'")){
    if(candidate){Object.assign(candidate,{status:'draft',visibility:args[0],market:args[5],selection:args[6],evidence_json:args[9]});}
    return [{affectedRows:1}];
   }
   if(sql.includes('INSERT INTO audit_logs'))return [{affectedRows:1}];
   throw Error('Unexpected conn.execute: '+sql.slice(0,120));
  },beginTransaction:async()=>{},commit:async()=>{commit++},rollback:async()=>{rollback++},release(){}
 };
 const db={getConnection:async()=>connection,
  query:async(sql)=>{
   if(sql.includes('FROM nforce_matches m LEFT JOIN nforce_fixture_schedules'))return [matches];
   throw Error('Unexpected db.query: '+sql.slice(0,100));
  },
  execute:async(sql,args=[])=>{
   queries.push({sql,args});
   if(sql.includes('FROM football_candidates c')&&sql.includes("status='discarded'"))return [candidate?[candidate]:[]];
   throw Error('Unexpected db.execute: '+sql.slice(0,100));
  }
 };
 installNforceEngine(app,{db,authenticate(){},now:()=>new Date(now)});
 async function call(method,path,{admin={role:'owner',id:1},id='23',body={confirm:true}}={}){
  const fn=handlers.get(method+' '+path);
  assert.ok(fn,`missing route ${method} ${path}`);
  let status=200,result;
  const res={status(c){status=c;return this},set(){return this},json(x){result=x;return this}};
  await fn({admin,params:{id},body},res);
  return {status,result};
 }
 return {call,queries,transactions:()=>({rollback,commit})};
}

test('recovery tool is present on owner panel with explicit per-pick reanalysis',()=>{
 const html=getFile('views/panel.html'),client=getFile('public/app.js'),backend=getFile('src/nforce-engine.js');
 assert.match(html,/id="footballReviewDiscarded"/);
 assert.match(html,/id="footballDiscardedList"/);
 assert.match(client,/\/api\/admin\/football\/discarded\/\$\{encodeURIComponent\(c.id\)\}\/reconsider/);
 assert.match(client,/JSON.stringify\(\{confirm:true\}\)/);
 assert.match(backend,/estimateMatch\(fixture,historical,at\)/);
 assert.match(backend,/classifyAutomaticCandidate\(makeCandidate\(fixture,model\)\)/);
 assert.match(backend,/status='draft'/);
 assert.match(backend,/nforce_discard_owner_reanalyzed/);
 assert.doesNotMatch(backend.slice(backend.indexOf("app.post(api('discarded/:id/reconsider')"),backend.indexOf("app.post(api('import')")),/sendPredictionToTelegram\(/);
});

test('only the owner can fetch or reconsider discarded picks, with explicit confirmation',async()=>{
 const c=setup();
 const endpoint='/api/admin/football/discarded/:id/reconsider';
 assert.equal((await c.call('GET','/api/admin/football/discarded',{admin:{role:'analyst',id:7}})).status,403);
 assert.equal((await c.call('POST',endpoint,{admin:{role:'general_admin',id:7}})).status,403);
 assert.equal((await c.call('POST',endpoint,{body:{confirm:false}})).status,400);
 assert.equal((await c.call('POST',endpoint,{id:'1 OR 1=1'})).status,400);
 assert.equal(c.queries.length,0);
});

test('explicit recovery of an old, no-longer-current fixture fails closed and leaves it discarded',async()=>{
 const stored={id:23,status:'discarded',provider:'nforce-openfootball',fixture_id:9,
  prediction_id:null,published_at:null,visibility:'gold',evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.6'},discard_reason:'manual'})};
 const c=setup({candidate:stored,matches:[]});
 const r=await c.call('POST','/api/admin/football/discarded/:id/reconsider');
 assert.equal(r.status,200);assert.equal(r.result.reopened,false);
 assert.match(r.result.reason,/sin horario válido|cancelado/);
 assert.equal(c.transactions().rollback,1);
 assert.equal(c.transactions().commit,0);
 assert.equal(c.queries.filter(x=>x.sql.includes("UPDATE football_candidates SET status='draft'")).length,0);
});

test('old discarded rows can be listed even if they were marked manual by an old version',async()=>{
 const now='2026-11-11T04:43:00Z';
 const c=setup({now,candidate:{id:23,status:'discarded',fixture_id:9,
  home_team:'A',away_team:'B',league:'Liga',kickoff:new Date('2026-11-13T10:00:00Z'),
  actual_kickoff:new Date('2026-11-13T10:00:00Z'),scheduled_time_known:1,
  visibility:'gold',evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.6'},discard_reason:'manual'}),
  prediction_id:null,published_at:null,home_goals:null,away_goals:null,live_status:'NS'}});
 const r=await c.call('GET','/api/admin/football/discarded');
 assert.equal(r.status,200);assert.equal(r.result.candidates.length,1);
 assert.equal(r.result.candidates[0].discard_reason,'manual');
 assert.equal(r.result.candidates[0].eligibility,'revision_permitida');
});


test('owner can recover a previously manual-labelled incompatible pick only after a real recalculation',async()=>{
 const now=new Date('2026-11-10T12:00:00Z');
 const teams=Array.from({length:12},(_,i)=>'Club '+String.fromCharCode(65+i));
 const matches=[];
 for(let i=0;i<240;i++){
  const home=teams[i%12],away=teams[(i+1+Math.floor(i/12)%10)%12];
  if(home===away)continue;
  const kickoff=new Date(now.getTime()-(240-i)*11*3600000).toISOString();
  matches.push({id:i+1,competition:'en.1',league:'Premier League',season:'2026-27',round:'Matchday 1',home,away,
   date_label:kickoff.slice(0,10),kickoff,scheduled_time_known:true,home_goals:i%4===0?3:2,away_goals:i%3===0?2:0,
   source_path:'2026-27/en.1.json'});
 }
 const future={id:887799,competition:'en.1',league:'Premier League',season:'2026-27',round:'Matchday 30',
  home:'Club A',away:'Club B',date_label:'2026-11-12',kickoff:'2026-11-12T20:00:00.000Z',scheduled_time_known:true,
  home_goals:null,away_goals:null,source_path:'2026-27/en.1.json'};
 const discarded={id:23,fixture_id:future.id,provider:'nforce-openfootball',status:'discarded',visibility:'gold',prediction_id:null,
  published_at:null,evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.6'},discard_reason:'manual'})};
 const c=setup({now:now.toISOString(),candidate:discarded,matches:[...matches,future]});
 const r=await c.call('POST','/api/admin/football/discarded/:id/reconsider');
 assert.equal(r.status,200);
 assert.equal(r.result.reopened,true);
 assert.equal(discarded.status,'draft');
 assert.equal(discarded.visibility,'gold');
 assert.match(discarded.evidence_json,new RegExp(MODEL_VERSION.replaceAll('.','\\.')));
 assert.equal(c.transactions().commit,1);
 assert.equal(c.queries.filter(x=>x.sql.includes('nforce_discard_owner_reanalyzed')).length,1);
 assert.equal(c.queries.filter(x=>x.sql.includes('INSERT INTO predictions')).length,0);
});
