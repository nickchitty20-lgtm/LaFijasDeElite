import test from 'node:test';
import assert from 'node:assert/strict';
import {installNforceEngine} from '../src/nforce-engine.js';

const TODAY = new Date('2026-11-11T18:00:00Z');
const DAY = 86400000;
function history(){
 const teams=Array.from({length:12},(_,i)=>`Club ${i}`),rows=[];
 for(let i=0;i<420;i++){
  const a=teams[i%12],b=teams[(i*7+3)%12]; if(a===b)continue;
  const ts=new Date(TODAY.getTime()-(420-i)*DAY/2).toISOString();
  rows.push({id:i+1,competition:'en.1',league:'Premier League',home_team:a,away_team:b,
    home:a,away:b,date:ts.slice(0,10),match_date:ts.slice(0,10),kickoff:ts,
    scheduled_time_known:true,home_goals:i%3,away_goals:i%4===0?1:2});
 }
 const ts=new Date(TODAY.getTime()+48*3600000).toISOString();
 rows.push({id:999,competition:'en.1',league:'Premier League',home_team:teams[0],away_team:teams[1],home:teams[0],away:teams[1],
  date:ts.slice(0,10),match_date:ts.slice(0,10),kickoff:ts,scheduled_time_known:true,home_goals:null,away_goals:null,live_status:'NS'});
 return rows;
}
async function scenario({initial={},vipReady=true,officialReady=true,vipFailure=null,officialFailure=null,fixtures=true}={}){
 const keys=['TELEGRAM_BOT_TOKEN','TELEGRAM_VIP_CHAT_ID','TELEGRAM_FREE_CHANNEL_CHAT_ID','PUBLIC_BASE_URL'];
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_VIP_CHAT_ID:'-1009999999999',TELEGRAM_FREE_CHANNEL_CHAT_ID:'@fijasOficial',PUBLIC_BASE_URL:'https://fijasdeelite.xyz'});
 const record={status:'sent',telegram_message_id:11,private_chat_id:'-1001111111111',
  public_status:'pending',public_message_id:null,public_sent_at:null,manual_resend_status:'none',manual_resend_attempts:0,
  manual_resend_message_id:null,public_recovery_attempts:0,...initial};
 const calls={vip:[],official:[],audits:[]}, handlers={};let vipError=vipFailure,offError=officialFailure;
 const conn={release(){},query:async()=>[[{acquired:1}]],execute:async(sql,args=[])=>{
  if(sql.startsWith('INSERT IGNORE INTO nforce_vip_radar_dispatches'))return [{affectedRows:0}];
  if(sql.includes('FROM nforce_vip_radar_dispatches')&&sql.startsWith('SELECT'))return [[{...record}]];
  if(sql.includes("SET manual_resend_status='reserved'")){
   if(record.status!=='sent'||!['none','rejected','unknown'].includes(record.manual_resend_status)||record.manual_resend_attempts>=3)return [{affectedRows:0}];
   record.manual_resend_status='reserved';record.manual_resend_attempts++;record.manual_resend_chat_id=args[0];return [{affectedRows:1}];
  }
  if(sql.includes('SET manual_resend_status=?')){record.manual_resend_status=args[0];return [{affectedRows:1}];}
  if(sql.includes("SET manual_resend_status='sent'")){
   record.manual_resend_status='sent';record.manual_resend_message_id=args[0];return [{affectedRows:1}];
  }
  if(sql.includes("SET public_status='reserved'")){
   if(record.public_status==='sent'||record.public_status==='reserved')return [{affectedRows:0}];
   record.public_status='reserved';record.public_chat_id=args[0];
   if(sql.includes('public_recovery_attempts=public_recovery_attempts+1'))record.public_recovery_attempts++;
   return [{affectedRows:1}];
  }
  if(sql.includes('SET public_status=?')){record.public_status=args[0];return [{affectedRows:1}];}
  if(sql.includes("SET public_status='sent'")){record.public_status='sent';record.public_message_id=args[0];return [{affectedRows:1}];}
  if(sql.includes('INSERT INTO audit_logs')){calls.audits.push({sql,args});return [{affectedRows:1}];}
  return [{affectedRows:1}];
 }};
 const db={getConnection:async()=>conn,execute:async()=>[[{enabled:0}]],query:async(sql)=>{
  if(sql.includes('FROM nforce_backtests'))return [[null]];
  if(sql.includes('FROM nforce_matches'))return [fixtures?history():[]];
  if(sql.includes('FROM nforce_vip_radar_dispatches'))return [[{...record}]];
  throw Error('unexpected query '+sql);
 }};
 const app={post(path,...args){handlers['POST '+path]=args.at(-1)},get(path,...args){handlers['GET '+path]=args.at(-1)}};
 installNforceEngine(app,{db,authenticate(){},now:()=>TODAY,
  inspectVipChannel:async()=>vipReady?{ready:true,chat_id:'-1009999999999'}:{ready:false,reason:'Bot no es administrador'},
  inspectOfficialChannel:async()=>officialReady?{ready:true,chat_id:'-1008888888888'}:{ready:false,reason:'No tiene permiso'},
  sendRadarTelegram:async(chat,message)=>{calls.vip.push({chat,message});if(vipError){const e=vipError;vipError=null;throw e;}return {message_id:9001}},
  sendRadarOfficialTelegram:async(chat,message)=>{calls.official.push({chat,message});if(offError){const e=offError;offError=null;throw e;}return {message_id:9002}}
 });
 const post=async(path,body={},role='owner')=>{
  const res={statusCode:200,status(n){this.statusCode=n;return this},set(){return this},json(b){this.body=b;return this}};
  await handlers['POST /api/admin/football/'+path]({admin:{role,id:123},body},res);
  return res;
 };
 return {post,record,calls,restore(){for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}};
}

test('prior successful receipt to wrong channel can be resent ONCE after explicit owner confirmation',async()=>{
 const f=await scenario();try{
  const old=await f.post('vip-radar/send');
  assert.equal(old.body.already_sent,true);assert.equal(f.calls.vip.length,0);
  const noAck=await f.post('vip-radar/recover-delivery',{destination:'vip'});
  assert.equal(noAck.statusCode,400);assert.equal(f.calls.vip.length,0);
  const res=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(res.statusCode,200);assert.equal(res.body.sent,true);assert.equal(res.body.resent,true);
  assert.equal(f.record.status,'sent');assert.equal(f.record.telegram_message_id,11); // original evidence retained
  assert.equal(f.record.manual_resend_status,'sent');assert.equal(f.record.manual_resend_message_id,9001);
  assert.equal(f.record.manual_resend_chat_id,'-1009999999999');
  assert.equal(f.calls.vip.length,1);assert.equal(f.calls.official.length,1);
  assert.equal(f.calls.official[0].chat,'-1008888888888');
  assert.equal(f.record.public_status,'sent');
  assert.equal(f.calls.audits.length,1);
  const again=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(again.body.already_sent,true);assert.equal(f.calls.vip.length,1);
 }finally{f.restore();}
});

test('official pending can be sent without resending the VIP bulletin',async()=>{
 const f=await scenario();try{
  const res=await f.post('vip-radar/recover-delivery',{destination:'official',confirm_not_received:true});
  assert.equal(res.body.sent,true);assert.equal(f.calls.vip.length,0);assert.equal(f.calls.official.length,1);
  assert.equal(f.record.public_status,'sent');assert.equal(f.record.public_recovery_attempts,1);
  assert.equal((await f.post('vip-radar/recover-delivery',{destination:'official',confirm_not_received:true})).body.already_sent,true);
  assert.equal(f.calls.official.length,1);
 }finally{f.restore();}
});

test('skipped official notice can be recovered after permissions are fixed; VIP is untouched',async()=>{
 const f=await scenario({initial:{public_status:'skipped'}});try{
  const res=await f.post('vip-radar/recover-delivery',{destination:'official',confirm_not_received:true});
  assert.equal(res.body.sent,true);assert.equal(f.calls.vip.length,0);assert.equal(f.calls.official.length,1);
 }finally{f.restore();}
});

test('reserved or sent official notice is never force-retried',async()=>{
 for(const state of ['reserved','sent']){
  const f=await scenario({initial:{public_status:state}});try{
   const r=await f.post('vip-radar/recover-delivery',{destination:'official',confirm_not_received:true});
   assert.equal(r.body.sent,false);assert.equal(f.calls.official.length,0);
  }finally{f.restore();}
 }
});

test('owner role and channel permissions remain enforced for exceptional VIP resend',async()=>{
 const f=await scenario({vipReady:false});try{
  const unauth=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true},'admin');
  assert.equal(unauth.statusCode,403);assert.equal(f.calls.vip.length,0);
  const r=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(r.body.sent,false);assert.equal(f.record.manual_resend_attempts,0);
 }finally{f.restore();}
});

test('Telegram confirmed rejection can be retried manually after repairing configuration',async()=>{
 const error=Object.assign(new Error('chat not found'),{telegramRejected:true});
 const f=await scenario({vipFailure:error});try{
  let r=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(r.body.sent,false);assert.equal(r.body.retryable,true);assert.equal(f.record.manual_resend_status,'rejected');
  r=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(r.body.sent,true);assert.equal(f.record.manual_resend_attempts,2);
 }finally{f.restore();}
});

test('ambiguous Telegram timeout does not auto retry or overwrite the old receipt',async()=>{
 const f=await scenario({vipFailure:new Error('ETIMEDOUT')});try{
  const r=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(r.body.sent,false);assert.equal(r.body.needs_confirmation,true);
  assert.equal(f.record.manual_resend_status,'unknown');assert.equal(f.record.telegram_message_id,11);
  assert.equal((await f.post('vip-radar/send')).body.already_sent,true);
  assert.equal(f.calls.vip.length,1);
 }finally{f.restore();}
});

test('manual repair does not bypass missing fixture/history gate',async()=>{
 const f=await scenario({fixtures:false});try{
  const r=await f.post('vip-radar/recover-delivery',{destination:'vip',confirm_not_received:true});
  assert.equal(r.body.sent,false);assert.equal(f.calls.vip.length,0);
 }finally{f.restore();}
});
