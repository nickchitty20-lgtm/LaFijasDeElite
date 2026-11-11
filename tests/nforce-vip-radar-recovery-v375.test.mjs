import test from 'node:test';
import assert from 'node:assert/strict';
import {installNforceEngine} from '../src/nforce-engine.js';

const NOW=new Date('2026-11-11T15:00:00Z');
function data(){
 const teams=Array.from({length:12},(_,i)=>'Club'+i);const out=[];
 for(let i=0;i<420;i++){
  const a=teams[i%12],b=teams[(i*7+3)%12];if(a===b)continue;
  const timestamp=new Date(NOW.getTime()-(420-i)*43200000).toISOString();
  out.push({id:i+1,competition:'en.1',league:'Premier League',home_team:a,away_team:b,
   home:a,away:b,date:timestamp.slice(0,10),match_date:timestamp.slice(0,10),kickoff:timestamp,
   scheduled_time_known:true,home_goals:i%3,away_goals:i%4===0?1:2});
 }
 const timestamp=new Date(NOW.getTime()+48*3600000).toISOString();
 out.push({id:999,competition:'en.1',league:'Premier League',home_team:teams[0],away_team:teams[1],
  home:teams[0],away:teams[1],date:timestamp.slice(0,10),match_date:timestamp.slice(0,10),kickoff:timestamp,
  scheduled_time_known:true,home_goals:null,away_goals:null,live_status:'NS'});
 return out;
}
async function scenario({previous=null,sendError=null,saveFails=false}={}){
 const before=Object.fromEntries(['TELEGRAM_BOT_TOKEN','TELEGRAM_VIP_CHAT_ID','TELEGRAM_FREE_CHANNEL_CHAT_ID','TELEGRAM_FREE_CHANNEL_URL'].map(k=>[k,process.env[k]]));
 process.env.TELEGRAM_BOT_TOKEN='fake';process.env.TELEGRAM_VIP_CHAT_ID='-1001234567890';delete process.env.TELEGRAM_FREE_CHANNEL_CHAT_ID;delete process.env.TELEGRAM_FREE_CHANNEL_URL;
 const handlers={},sends=[],matches=data();let record=previous?{status:'failed',private_failure_kind:null,recovery_attempts:0,sent_at:null,telegram_message_id:null,...previous}:null;
 let failure=sendError;
 const conn={
  query:async()=>[[{acquired:1}]],release(){},
  execute:async(sql,args=[])=>{
   if(sql.startsWith('INSERT IGNORE INTO nforce_vip_radar_dispatches')){
    if(record)return [{affectedRows:0}];
    record={status:'reserved',private_failure_kind:null,recovery_attempts:0,sent_at:null,telegram_message_id:null};return [{affectedRows:1}];
   }
   if(sql.startsWith('SELECT status,sent_at,telegram_message_id,private_failure_kind'))return [[{...record}]];
   if(sql.includes("SET status='reserved',private_failure_kind=NULL,recovery_attempts")){
    if(!['failed','reserved'].includes(record.status)||record.recovery_attempts>=1)return [{affectedRows:0}];
    record.status='reserved';record.private_failure_kind=null;record.recovery_attempts++;return [{affectedRows:1}];
   }
   if(sql.includes("SET status='failed',private_failure_kind=?")){
    record.status='failed';record.private_failure_kind=args[0];return [{affectedRows:1}];
   }
   if(sql.includes("SET status='sent',sent_at=UTC_TIMESTAMP()")){
    if(saveFails)throw Error('database is read-only');
    record.status='sent';record.sent_at='2026-11-11';record.telegram_message_id=args[0];return [{affectedRows:1}];
   }
   if(sql.includes('public_status'))return [{affectedRows:1}];
   return [{affectedRows:1}];
  }
 };
 const db={getConnection:async()=>conn,execute:async()=>[[{enabled:0}]],query:async(sql)=>{
  if(sql.includes('FROM nforce_backtests'))return [[null]];
  if(sql.includes('FROM nforce_vip_radar_dispatches'))return [[record]];
  if(sql.includes('FROM nforce_matches'))return [matches];
  throw Error('unexpected SQL '+sql);
 }};
 const app={get(route,...args){handlers['GET '+route]=args.at(-1);},post(route,...args){handlers['POST '+route]=args.at(-1);}};
 installNforceEngine(app,{db,authenticate(){},now:()=>NOW,
  sendRadarTelegram:async(chat,message)=>{sends.push({chat,message});if(failure){const e=failure;failure=null;throw e;}return {message_id:777};}});
 const send=async(body={})=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;}};
  await handlers['POST /api/admin/football/vip-radar/send']({admin:{role:'owner'},body},res);return res.body;};
 const restore=()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};
 return {send,sends,record:()=>record,restore};
}

test('v3.7.5 ambiguous failed attempt requires explicit confirmation and permits only one recovery',async()=>{
 const f=await scenario({previous:{status:'failed'}});
 try{
  let r=await f.send();assert.equal(r.sent,false);assert.equal(r.needs_confirmation,true);assert.equal(f.sends.length,0);
  r=await f.send({confirm_unsent:true});assert.equal(r.sent,true);assert.equal(f.sends.length,1);
  r=await f.send();assert.equal(r.sent,false);assert.equal(r.already_sent,true);assert.equal(f.sends.length,1);
  assert.equal(f.record().recovery_attempts,1);
 }finally{f.restore();}
});

test('definitive Telegram rejection can be retried without falsely reporting delivery',async()=>{
 const error=new Error('Telegram sendMessage: Bad Request: chat not found');error.telegramRejected=true;
 const f=await scenario({sendError:error});
 try{
  let r=await f.send();assert.equal(r.sent,false);assert.equal(r.retryable,true);
  assert.equal(f.record().private_failure_kind,'rejected');
  r=await f.send();assert.equal(r.sent,true);assert.equal(f.sends.length,2);
  assert.equal(f.record().status,'sent');
 }finally{f.restore();}
});

test('Telegram delivery success with failed MySQL write is never retried',async()=>{
 const f=await scenario({saveFails:true});
 try{
  let r=await f.send();assert.equal(r.sent,true);assert.match(r.warning,/MySQL/);
  assert.equal(f.record().status,'reserved');
  r=await f.send();assert.equal(r.sent,false);assert.equal(f.sends.length,1);
 }finally{f.restore();}
});

test('ambiguous timeout never auto retries and requires confirmation',async()=>{
 const f=await scenario({sendError:new Error('Network timeout')});
 try{
  let r=await f.send();assert.equal(r.sent,false);assert.equal(r.needs_confirmation,true);
  assert.equal(f.record().private_failure_kind,'unknown');
  r=await f.send();assert.equal(r.needs_confirmation,true);assert.equal(f.sends.length,1);
 }finally{f.restore();}
});


test('an interrupted reserved attempt can be manually recovered after explicit checking',async()=>{
 const f=await scenario({previous:{status:'reserved'}});
 try{
  let r=await f.send();assert.equal(r.needs_confirmation,true);assert.equal(f.sends.length,0);
  r=await f.send({confirm_unsent:true});assert.equal(r.sent,true);assert.equal(f.sends.length,1);
  r=await f.send();assert.equal(r.already_sent,true);
 }finally{f.restore();}
});
