import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {telegramCommunityNotice,maybeSendCommunityNotice,sendPredictionToTelegram} from '../src/telegram-bridge.js';

const env={
 TELEGRAM_BOT_TOKEN:'fake-token', TELEGRAM_FREE_CHANNEL_CHAT_ID:'@FijasDeEliteOficial',
 TELEGRAM_FREE_CHANNEL_URL:'https://t.me/FijasDeEliteOficial', TELEGRAM_FREE_CHAT_ID:'-10022222',
 TELEGRAM_VIP_CHAT_ID:'-10033333', TELEGRAM_WEBHOOK_SECRET:'s'.repeat(32),
 PUBLIC_BASE_URL:'https://web.example/clientes.html'
};
const pick={id:901,visibility:'free',title:'Equipo X vs Equipo Y',league:'Liga X',market:'Ambos anotan',selection:'Sí',odds:2.50,analysis:'SECRETO_ABC',match_date:'2026-11-10 18:00:00'};

function fakeFetch(calls,{groupType='supergroup',failGroup=false,failChannel=false}={}){
 return async(url,opt)=>{
  const method=String(url).split('/').at(-1),body=JSON.parse(opt.body);
  calls.push({method,body});
  if(method==='getChat'){
   const group=body.chat_id===env.TELEGRAM_FREE_CHAT_ID;
   return {ok:true,json:async()=>({ok:true,result:group?{type:groupType,id:-10022222}:{type:'channel',id:-10011111,username:'FijasDeEliteOficial'}})};
  }
  if(method==='sendMessage' && ((failGroup&&body.chat_id==='-10022222')||(failChannel&&body.chat_id==='-10011111')))
   return {ok:false,json:async()=>({ok:false,description:'Forbidden: no permission'})};
  return {ok:true,json:async()=>({ok:true,result:{message_id:55}})};
 };
}
function fakeDb(){
 const sqls=[],claimed=new Set();
 return {sqls,execute:async(sql,params=[])=>{
  sqls.push({sql,params});
  if(sql.includes('INSERT IGNORE INTO telegram_community_announcements')){
   const key=String(params[0]);if(claimed.has(key))return [{affectedRows:0}];
   claimed.add(key);return [{affectedRows:1}];
  }
  return [{affectedRows:1}];
 }};
}

test('short community notices have correct links but no private pick details',()=>{
 const free=telegramCommunityNotice('free',{channelUrl:env.TELEGRAM_FREE_CHANNEL_URL,baseUrl:env.PUBLIC_BASE_URL});
 const vip=telegramCommunityNotice('vip',{channelUrl:env.TELEGRAM_FREE_CHANNEL_URL,baseUrl:env.PUBLIC_BASE_URL});
 assert.match(free,/fija GRATIS/); assert.match(free,/https:\/\/t\.me\/FijasDeEliteOficial/);
 assert.match(vip,/fija VIP/);assert.match(vip,/https:\/\/web\.example\//);
 assert.doesNotMatch(vip,/clientes\.html|https:\/\/t\.me/);
 assert.ok(free.length<180 && vip.length<180);
 for(const msg of [free,vip])assert.doesNotMatch(msg,/SECRETO_ABC|Equipo X|Ambos anotan|2\.50|selección:/i);
 assert.equal(telegramCommunityNotice('free',{channelUrl:'https://evil.example'}),'');
});

test('community notices are at most once per published pick',async()=>{
 const old=globalThis.fetch,calls=[],db=fakeDb();
 try{
  globalThis.fetch=fakeFetch(calls);
  assert.equal(await maybeSendCommunityNotice(pick,env,db),true);
  assert.equal(await maybeSendCommunityNotice(pick,env,db),false);
  const sends=calls.filter(c=>c.method==='sendMessage');assert.equal(sends.length,1);
  assert.equal(sends[0].body.chat_id,'-10022222');
  assert.match(sends[0].body.text,/https:\/\/t\.me\/FijasDeEliteOficial/);
  assert.ok(db.sqls.some(c=>c.sql.includes("state='sent'")));
 }finally{globalThis.fetch=old;}
});

test('rejected group destination is never used as fallback channel',async()=>{
 const old=globalThis.fetch,calls=[],db=fakeDb();
 try{
  globalThis.fetch=fakeFetch(calls,{groupType:'channel'});
  assert.equal(await maybeSendCommunityNotice(pick,env,db),false);
  assert.equal(calls.filter(c=>c.method==='sendMessage').length,0);
  assert.equal(db.sqls.length,0);
 }finally{globalThis.fetch=old;}
});

test('group send failure does not change FREE successful publication',async()=>{
 const old=globalThis.fetch,calls=[],db=fakeDb();
 try{
  globalThis.fetch=fakeFetch(calls,{failGroup:true});
  assert.deepEqual(await sendPredictionToTelegram(pick,env,{db}),{state:'sent'});
  assert.deepEqual(calls.filter(c=>c.method==='sendMessage').map(c=>c.body.chat_id),['-10011111','-10022222']);
  assert.ok(db.sqls.some(c=>c.sql.includes("state='failed'")));
 }finally{globalThis.fetch=old;}
});

test('if FREE channel publication fails, community receives no notice',async()=>{
 const old=globalThis.fetch,calls=[],db=fakeDb();
 try{
  globalThis.fetch=fakeFetch(calls,{failChannel:true});
  await assert.rejects(sendPredictionToTelegram(pick,env,{db}),/Forbidden: no permission/);
  assert.equal(calls.some(c=>c.body.chat_id==='-10022222'),false);
  assert.equal(db.sqls.filter(c=>c.sql.includes('telegram_community_announcements')).length,0);
 }finally{globalThis.fetch=old;}
});

test('VIP group notice contains only the home link, not the VIP match',async()=>{
 const old=globalThis.fetch,calls=[],db=fakeDb();
 try{
  globalThis.fetch=fakeFetch(calls);
  assert.deepEqual(await sendPredictionToTelegram({...pick,visibility:'vip'},env,{db}),{state:'sent'});
  const sends=calls.filter(c=>c.method==='sendMessage').map(c=>c.body);
  assert.deepEqual(sends.map(s=>s.chat_id),[env.TELEGRAM_VIP_CHAT_ID,'-10011111','-10022222']);
  assert.doesNotMatch(sends.at(-1).text,/SECRETO_ABC|Equipo X|Ambos anotan|2\.50|selección:/i);
  assert.match(sends.at(-1).text,/https:\/\/web\.example\//);
 }finally{globalThis.fetch=old;}
});

test('database migration creates a unique community announcement ledger',()=>{
 const schema=readFileSync(new URL('../src/init-db.js',import.meta.url),'utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS telegram_community_announcements/);
 assert.match(schema,/prediction_id BIGINT UNSIGNED NOT NULL PRIMARY KEY/);
 assert.match(schema,/FOREIGN KEY \(prediction_id\) REFERENCES predictions\(id\)/);
});
