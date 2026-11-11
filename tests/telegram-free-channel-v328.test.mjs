import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freeTelegramDestination,safeTelegramPublicUrl} from '../src/telegram-public.js';
import {sendPredictionToTelegram,maybeSendVipTeaser,inspectFreeTelegramChannel} from '../src/telegram-bridge.js';
import {removePredictionTelegramMessages} from '../src/prediction-removal.js';
const root=new URL('../',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');
const env={TELEGRAM_BOT_TOKEN:'fake-token',TELEGRAM_FREE_CHANNEL_CHAT_ID:'-10011111',TELEGRAM_FREE_CHAT_ID:'-10022222',TELEGRAM_VIP_CHAT_ID:'-10033333',TELEGRAM_WEBHOOK_SECRET:'x'.repeat(32),PUBLIC_BASE_URL:'https://fijas.example'};
const prediction={id:98,visibility:'free',title:'A vs B',league:'Liga',market:'Más de 1.5 goles',selection:'Sí',analysis:'Análisis deportivo',match_date:'2026-11-10 18:00:00'};
function mockTelegram(calls,{type='channel',allowed=true,username='FijasDeEliteOficial',sendFail=false}={}){
 return async(url,opt)=>{
  const method=String(url).split('/').pop();const body=JSON.parse(opt.body);
  calls.push({method,body});
  const result=method==='getChat'?(body.chat_id===env.TELEGRAM_FREE_CHAT_ID?{id:-10022222,type:'supergroup',title:'Comunidad'}:{id:-10011111,type,title:'Fijas de Élite | OFICIAL',username}):
   method==='getMe'?{id:43,username:'mybot'}:
   method==='getChatMember'?{status:'administrator',can_post_messages:allowed}:
   {message_id:4};
  if(sendFail&&method==='sendMessage')return {ok:false,json:async()=>({ok:false,description:'Forbidden: bot is not an administrator of the channel'})};
  return {ok:true,json:async()=>({ok:true,result})};
 };
}

test('FREE channel is exclusive; group is NEVER an automatic fallback',()=>{
 assert.equal(freeTelegramDestination(env),'-10011111');
 assert.equal(freeTelegramDestination({...env,TELEGRAM_FREE_CHANNEL_CHAT_ID:''}),'');
 assert.equal(freeTelegramDestination({TELEGRAM_FREE_CHAT_ID:'-10022222'}),'');
 assert.equal(freeTelegramDestination({...env,TELEGRAM_FREE_CHANNEL_URL:'https://t.me/FijasDeEliteOficial'}),'@FijasDeEliteOficial');
 assert.equal(freeTelegramDestination({TELEGRAM_FREE_CHANNEL_CHAT_ID:'@FijasDeEliteOficial'}),'@FijasDeEliteOficial');
});
test('public Telegram URLs accept only safe valid links',()=>{
 assert.equal(safeTelegramPublicUrl('https://t.me/FijasDeElite'), 'https://t.me/FijasDeElite');
 assert.equal(safeTelegramPublicUrl('https://t.me/+ABCD1234xyz'), 'https://t.me/+ABCD1234xyz');
 for(const bad of ['javascript:alert(1)','https://t.me.evil.com/abc','https://t.me/abc?redirect=https://evil.com','http://t.me/FijasDeElite','https://evil.com']) assert.equal(safeTelegramPublicUrl(bad),null);
});
test('FREE complete pick goes only to channel; group receives short linked announcement',async()=>{
 const old=globalThis.fetch,calls=[],sqls=[];const db={execute:async(sql,params)=>{sqls.push({sql,params});return [{affectedRows:1}]}};
 try{
  globalThis.fetch=mockTelegram(calls);
  assert.deepEqual(await sendPredictionToTelegram(prediction,env,{db}),{state:'sent'});
  assert.deepEqual(calls.map(x=>x.method),['getChat','sendMessage','getChat','sendMessage']);
  const messages=calls.filter(x=>x.method==='sendMessage').map(x=>x.body);
  assert.deepEqual(messages.map(x=>x.chat_id),['-10011111','-10022222']);
  assert.match(messages[0].text,/Más de 1.5 goles/);
  assert.match(messages[0].text,/https:\/\/fijas\.example\//);
  assert.match(messages[1].text,/fija GRATIS/);
  assert.match(messages[1].text,/https:\/\/t\.me\/FijasDeEliteOficial/);
  assert.doesNotMatch(messages[1].text,/Más de 1.5 goles|Análisis deportivo|Sí/);
  assert.deepEqual(sqls.find(c=>/INSERT INTO telegram_prediction_messages/.test(c.sql)).params.slice(1,3),['free','-10011111']);
 }finally{globalThis.fetch=old;}
});
test('VIP is private; preview in FREE channel; only web link in community group',async()=>{
 const old=globalThis.fetch,calls=[],sqls=[];
 const db={execute:async(sql,params)=>{sqls.push({sql,params});return [{affectedRows:1}]}};
 try{
  globalThis.fetch=mockTelegram(calls);
  const result=await sendPredictionToTelegram({...prediction,visibility:'vip',auto_generated:true},env,{db});
  assert.equal(result.state,'sent');
  const sent=calls.filter(x=>x.method==='sendMessage').map(x=>x.body);
  assert.deepEqual(sent.map(x=>x.chat_id),[env.TELEGRAM_VIP_CHAT_ID,'-10011111','-10022222']);
  assert.match(sent[0].text,/Más de 1.5 goles/);
  assert.doesNotMatch(sent[1].text,/Más de 1.5 goles|Análisis deportivo|Sí/);
  assert.match(sent[2].text,/fija VIP/);
  assert.match(sent[2].text,/https:\/\/fijas\.example\//);
  assert.doesNotMatch(sent[2].text,/Más de 1.5 goles|Análisis deportivo|Sí|A vs B/);
  assert.ok(sqls.some(s=>s.sql.includes('chat_id) VALUES')&&s.params[1]==='-10011111'));
 }finally{globalThis.fetch=old;}
});
test('VIP refuses to send full private picks if IDs are identical',async()=>{
 const result=await sendPredictionToTelegram({...prediction,visibility:'vip'}, {...env,TELEGRAM_VIP_CHAT_ID:env.TELEGRAM_FREE_CHANNEL_CHAT_ID});
 assert.equal(result.state,'not_configured');
});
test('VIP teaser ledger prevents duplicate announcements',async()=>{
 const old=globalThis.fetch;let sends=0,claims=0;const calls=[];
 const db={execute:async(sql)=>{
  if(sql.startsWith('INSERT IGNORE INTO telegram_vip_public_announcements')){claims++;return [{affectedRows:claims===1?1:0}];}
  return [{affectedRows:1}];
 }};
 try{
  const f=mockTelegram(calls);
  globalThis.fetch=async(...args)=>{const r=await f(...args);if(String(args[0]).endsWith('/sendMessage'))sends++;return r;};
  assert.equal(await maybeSendVipTeaser({...prediction,visibility:'vip'},env,db),true);
  assert.equal(await maybeSendVipTeaser({...prediction,visibility:'vip'},env,db),false);
  assert.equal(sends,1);
 }finally{globalThis.fetch=old;}
});
test('no channel configured must never send to old group',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw Error('should never be called')};
  assert.deepEqual(await sendPredictionToTelegram(prediction,{...env,TELEGRAM_FREE_CHANNEL_CHAT_ID:''}),{state:'not_configured'});
  assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
test('misconfigured group-shaped ID is rejected before a message can be posted',async()=>{
 const old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=mockTelegram(calls,{type:'supergroup'});
  const result=await inspectFreeTelegramChannel(env,{checkPermissions:true});
  assert.equal(result.ready,false);assert.match(result.reason,/no es un canal/i);
  await assert.rejects(sendPredictionToTelegram(prediction,env),/no es un canal/i);
  assert.equal(calls.filter(c=>c.method==='sendMessage').length,0);
 }finally{globalThis.fetch=old;}
});
test('diagnostic verifies permission and target public channel safely',async()=>{
 const old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=mockTelegram(calls,{allowed:false});
  const result=await inspectFreeTelegramChannel({...env,TELEGRAM_FREE_CHANNEL_URL:'https://t.me/FijasDeEliteOficial'},{checkPermissions:true});
  assert.equal(result.ready,false);assert.match(result.reason,/permiso para publicar/i);
  assert.deepEqual(calls.map(x=>x.method),['getChat','getMe','getChatMember']);
  calls.length=0;
  globalThis.fetch=mockTelegram(calls,{allowed:true,username:'OtroCanal'});
  const mismatch=await inspectFreeTelegramChannel({...env,TELEGRAM_FREE_CHANNEL_URL:'https://t.me/FijasDeEliteOficial'});
  assert.equal(mismatch.ready,false);assert.match(mismatch.reason,/no coincide/i);
 }finally{globalThis.fetch=old;}
});
test('removal uses recorded channel chat_id, legacy deletes remain supported',async()=>{
 const ids=[];const db={execute:async(sql)=>{
  if(sql.includes('FROM telegram_prediction_messages'))return [[]];
  if(sql.includes('FROM telegram_vip_public_announcements'))return [[{prediction_id:98,telegram_message_id:22,chat_id:-10011111}]];
  if(sql.includes('FROM telegram_community_announcements'))return [[]];
  if(sql.includes('FROM telegram_gold_public_announcements'))return [[]];
  return [{affectedRows:1}];
 }};
 await removePredictionTelegramMessages({db,predictionId:98,telegramApi:async(method,data)=>{ids.push(data.chat_id)},env});
 assert.deepEqual(ids,['-10011111']);
});
test('configuration, UI and owner-only real delivery diagnostics exist',()=>{
 assert.match(read('src/server.js'), /api\/public\/telegram/);
 assert.match(read('src/server.js'), /telegram\/free-channel\/check/);
 assert.match(read('src/server.js'), /telegram\/free-channel\/test/);
 assert.match(read('src/server.js'), /req\.admin\.role!=='owner'/);
 assert.match(read('views/panel.html'), /telegramFreeChannelCheck/);
 assert.match(read('public/app.js'), /telegramFreeChannelTest/);
 assert.match(read('src/telegram-routes.js'), /public_channel_url/);
 assert.match(read('public/landing.js'), /telegramFreeChannelCta/);
 assert.match(read('public/clientes.js'), /Canal oficial/);
 assert.match(read('.env.example'), /TELEGRAM_FREE_CHANNEL_CHAT_ID=/);
 assert.match(read('src/nforce-engine.js'), /freeTelegramDestination\(process\.env\)/);
 assert.match(read('src/football-automation.js'), /freeTelegramDestination\(process\.env\)/);
 assert.match(read('src/init-db.js'), /ADD COLUMN chat_id BIGINT NULL/);
 assert.match(read('src/telegram-bridge.js'), /protect_content:true/);
});

test('VIP content cannot be sent to public channel under a numeric-ID alias',async()=>{
 const old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=mockTelegram(calls);
  const config={...env,TELEGRAM_FREE_CHANNEL_URL:'https://t.me/FijasDeEliteOficial',TELEGRAM_FREE_CHANNEL_CHAT_ID:'',TELEGRAM_VIP_CHAT_ID:'-10011111'};
  const result=await sendPredictionToTelegram({...prediction,visibility:'vip'},config);
  assert.equal(result.state,'not_configured');
  assert.equal(calls.filter(c=>c.method==='sendMessage').length,0);
 }finally{globalThis.fetch=old;}
});
