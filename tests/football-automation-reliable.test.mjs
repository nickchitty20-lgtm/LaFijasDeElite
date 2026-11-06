import test from 'node:test';
import assert from 'node:assert/strict';
import {installFootballAutomation} from '../src/football-automation.js';

// End-to-end test of the REAL scan/dispatch coordinator using a simulated
// provider and DB. No network, private tokens or real Telegram messages.
test('API simulada → propuestas GRATIS/VIP → publicación automática incluso sin cuota',async()=>{
 const saved=Object.fromEntries(['FOOTBALL_API_KEY','FOOTBALL_AUTO_PUBLISH','TELEGRAM_BOT_TOKEN','TELEGRAM_FREE_CHAT_ID','TELEGRAM_VIP_CHAT_ID'].map(k=>[k,process.env[k]]));
 Object.assign(process.env,{FOOTBALL_API_KEY:'dummy-key',FOOTBALL_AUTO_PUBLISH:'true',TELEGRAM_BOT_TOKEN:'dummy-bot',TELEGRAM_FREE_CHAT_ID:'-100123',TELEGRAM_VIP_CHAT_ID:'-100456'});
 try{
  const kickoffs=[new Date(Date.now()+2*3600000).toISOString(),new Date(Date.now()+3*3600000).toISOString()];
  const fixtures=kickoffs.map((date,i)=>({fixture:{id:90001+i,date,status:{short:'NS'}},
   league:{id:i?140:39,name:i?'La Liga':'Premier League',season:2026},
   teams:{home:{id:100+i,name:i?'Team Free':'Team VIP'},away:{id:200+i,name:'Visiting Club'}}}));
  const rows=[],sent=[],calls=[];
  let scanId=0,predictionId=100;
  const statusCounts={free:0,vip:0};
  const mockConn=()=>({
   async query(sql,args=[]){
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
    if(sql.includes('FROM football_scans WHERE initiated_by'))return [[{total:0,latest:null}]];
    if(sql.includes('started_at FROM football_scans'))return [[{}]];
    if(sql.includes('SELECT fixture_id FROM football_candidates'))return [rows.map(r=>({fixture_id:r.fixture_id}))];
    if(sql.includes('SELECT fixture_id FROM football_fixture_checks'))return [[]];
    if(sql.includes("SELECT * FROM football_candidates WHERE status='draft'"))return [rows.filter(r=>r.status==='draft')];
    if(sql.includes('SELECT id FROM admins'))return [[{id:9}]];
    throw Error('Consulta simulada inesperada: '+sql.slice(0,100));
   },
   async execute(sql,args=[]){
    if(sql.includes('INSERT INTO football_scans'))return [{insertId:++scanId,affectedRows:1}];
    if(sql.includes('INSERT IGNORE INTO football_candidates')){
     const [provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json]=args;
     if(rows.some(r=>r.fixture_id===fixture_id))return [{affectedRows:0}];
     rows.push({id:rows.length+1,provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status:'draft'});
     return [{affectedRows:1}];
    }
    if(sql.includes('SELECT * FROM football_candidates WHERE id='))return [rows.filter(r=>r.id==args[0])];
    if(sql.includes('COUNT(*) AS total FROM football_candidates'))return [[{total:statusCounts[args[0]]}]];
    if(sql.includes('INSERT INTO predictions'))return [{insertId:++predictionId,affectedRows:1}];
    if(sql.includes("UPDATE football_candidates SET status='published'")){
     const row=rows.find(r=>r.id===args[1]);row.status='published';row.prediction_id=args[0];statusCounts[row.visibility]++;return [{affectedRows:1}];
    }
    if(sql.includes('INSERT INTO football_fixture_checks'))return [{affectedRows:1}];
    if(sql.includes('UPDATE football_scans')||sql.includes('INSERT INTO audit_logs')||sql.includes('UPDATE predictions'))return [{affectedRows:1}];
    throw Error('Sentencia simulada inesperada: '+sql.slice(0,100));
   },
   async beginTransaction(){},async commit(){},async rollback(){},release(){}
  });
  const db={async getConnection(){return mockConn();},async query(sql,args){return mockConn().query(sql,args);},async execute(sql,args){return mockConn().execute(sql,args);}};
  const request=async(endpoint,params)=>{
   calls.push(endpoint);
   if(endpoint==='status')return {requests:{current:0,limit_day:100}};
   if(endpoint==='fixtures')return fixtures.filter(f=>f.fixture.date.slice(0,10)===params.date);
   if(endpoint==='predictions'){
    const free=Number(params.fixture)===90002;
    return [{predictions:{percent:free?{home:'45%',draw:'28%',away:'27%'}:{home:'68%',draw:'18%',away:'14%'}},
     teams:{home:{last_5:{form:'64%'}},away:{last_5:{form:'45%'}}},
     comparison:{att:{home:'63%',away:'37%'},def:{home:'58%',away:'42%'}}}];
   }
   if(endpoint==='odds'||endpoint==='fixtures/headtohead'||endpoint==='injuries')return [];
   if(endpoint==='teams/statistics')return {};
   throw Error('Endpoint simulado inesperado: '+endpoint);
  };
  const app={get(){},post(){}};
  const controller=installFootballAutomation(app,{db,authenticate(){},request,
   sendTelegram:async p=>{sent.push(p);return {state:'sent'};},enqueueEvent:async()=>{}});
  const scanned=await controller.scan({manual:true});
  assert.equal(scanned.ok,true);
  assert.equal(scanned.drafts_created,2);
  assert.equal(rows.length,2);
  assert.equal(rows.find(r=>r.visibility==='vip').odds,null);
  assert.ok(scanned.provider_calls<=19);
  assert.ok(calls.includes('predictions'));
  const published=await controller.publishPending();
  assert.equal(published.published,2);
  assert.equal(sent.length,2);
  assert.deepEqual(sent.map(p=>p.visibility).sort(),['free','vip']);
  assert.equal(sent.find(p=>p.visibility==='vip').odds,null);
  assert.equal(rows.filter(r=>r.status==='published').length,2);
  const again=await controller.publishPending();
  assert.equal(again.published,0);
  assert.equal(sent.length,2,'no debe repetir publicaciones');
 }finally{
  for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});

test('una predicción ausente se guarda como fallo temporal y no gasta la misma consulta de nuevo',async()=>{
 const old=process.env.FOOTBALL_API_KEY;process.env.FOOTBALL_API_KEY='dummy-key';
 try{
  const fixture={fixture:{id:99191,date:new Date(Date.now()+3*3600000).toISOString(),status:{short:'NS'}},league:{id:39,name:'Premier League'},teams:{home:{id:12,name:'Sin Modelo'},away:{id:23,name:'Visitante'}}};
  const suppressed=new Set();let predictionCalls=0;
  const mockConn=()=>({
   async query(sql){
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('RELEASE_LOCK'))return [[]];
    if(sql.includes('FROM football_scans WHERE initiated_by'))return [[{total:0,latest:null}]];
    if(sql.includes('SELECT fixture_id FROM football_candidates'))return [[]];
    if(sql.includes('SELECT fixture_id FROM football_fixture_checks'))return [[...suppressed].map(id=>({fixture_id:id}))];
    throw Error('Unexpected mock query: '+sql);
   },
   async execute(sql,args){
    if(sql.includes('INSERT INTO football_scans'))return [{insertId:1}];
    if(sql.includes('INSERT INTO football_fixture_checks')){suppressed.add(args[0]);return [{affectedRows:1}];}
    if(sql.includes('UPDATE football_scans'))return [{affectedRows:1}];
    throw Error('Unexpected mock execute: '+sql);
   },release(){}
  });
  const db={async getConnection(){return mockConn();}};
  const request=async(endpoint,params)=>{
   if(endpoint==='status')return {requests:{current:0,limit_day:100}};
   if(endpoint==='fixtures')return params.date===fixture.fixture.date.slice(0,10)?[fixture]:[];
   if(endpoint==='predictions'){predictionCalls++;return [];}
   throw Error('Unexpected endpoint: '+endpoint);
  };
  const control=installFootballAutomation({get(){},post(){}},{db,authenticate(){},request});
  const first=await control.scan({manual:true});
  assert.equal(first.ok,true);assert.equal(first.without_prediction,1);
  const second=await control.scan({manual:true});
  assert.equal(second.ok,true);assert.equal(second.recently_skipped,1);
  assert.equal(second.examined,0);
  assert.equal(predictionCalls,1,'no consultar otra vez el mismo partido sin predicción');
 }finally{if(old===undefined)delete process.env.FOOTBALL_API_KEY;else process.env.FOOTBALL_API_KEY=old;}
});
