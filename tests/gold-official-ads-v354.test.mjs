import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {goldOfficialAnnouncement,announceGoldOfficial} from '../src/gold-public-announcement.js';
import {sendPredictionToTelegram} from '../src/telegram-bridge.js';
import {removePredictionTelegramMessages} from '../src/prediction-removal.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const env={TELEGRAM_BOT_TOKEN:'demo',TELEGRAM_FREE_CHANNEL_URL:'https://t.me/FijasDeEliteOficial',
  TELEGRAM_FREE_CHAT_ID:'-100777777',TELEGRAM_VIP_CHAT_ID:'-100111111',PUBLIC_BASE_URL:'https://fijasdeelite.xyz'};
const gold={id:123,visibility:'gold',title:'CONFIDENCIAL Club A vs Club B',league:'Liga secreta',
  market:'Goles',selection:'Más de 1.5',odds:1.7,analysis:'secreto',estimated_probability:71};
const verify=async()=>({ready:true,chat_id:'-100888888',username:'FijasDeEliteOficial'});

test('GOLD announcement contains only generic text and the homepage, no pick details',()=>{
 const str=goldOfficialAnnouncement('https://fijasdeelite.xyz/clientes.html?plan=5');
 assert.match(str,/GOLD/);assert.match(str,/VIP/);
 assert.match(str,/https:\/\/fijasdeelite\.xyz\//);
 assert.doesNotMatch(str,/clientes\.html|plan=5|Equipo|Selección|Cuota/);
});

test('GOLD advertisement goes only to verified official channel, and is reserved exactly once',async()=>{
 let saved=false;
 const statements=[],sent=[];
 const db={execute:async(sql,args)=>{
  statements.push({sql,args});
  if(sql.includes('INSERT IGNORE INTO telegram_gold_public_announcements')){
   if(saved)return [{affectedRows:0}];
   saved=true;return [{affectedRows:1}];
  }
  return [{affectedRows:1}];
 }};
 const api=async(method,body)=>{sent.push({method,body});return {message_id:66};};
 const first=await announceGoldOfficial(gold,env,db,{api,verify});
 const second=await announceGoldOfficial(gold,env,db,{api,verify});
 assert.equal(first.state,'sent');assert.equal(second.state,'already_announced');
 assert.equal(sent.length,1);assert.equal(sent[0].method,'sendMessage');
 assert.equal(sent[0].body.chat_id,'-100888888');
 assert.equal(sent[0].body.disable_web_page_preview,true);
 assert.doesNotMatch(sent[0].body.text,/CONFIDENCIAL|Liga secreta|Más de 1\.5|secreto|71/);
 assert.ok(statements.some(x=>x.sql.includes("visibility='gold' AND published_at IS NOT NULL AND archived_at IS NULL")));
 assert.ok(statements.some(x=>x.sql.includes("state='sent'")));
 assert.notEqual(sent[0].body.chat_id,env.TELEGRAM_FREE_CHAT_ID);
 assert.notEqual(sent[0].body.chat_id,env.TELEGRAM_VIP_CHAT_ID);
});

test('no ad on invalid channel or missing token; no fallback to discussion group',async()=>{
 let calls=0;
 const db={execute:async()=>{calls++;return [{affectedRows:1}];}};
 assert.equal((await announceGoldOfficial(gold,{...env,TELEGRAM_BOT_TOKEN:''},db,{verify})).state,'not_configured');
 assert.equal((await announceGoldOfficial(gold,env,db,{verify:async()=>({ready:false,reason:'sin permiso'})})).state,'not_configured');
 assert.equal((await announceGoldOfficial(gold,{...env,TELEGRAM_VIP_CHAT_ID:'-100888888'},db,{verify})).state,'not_configured');
 assert.equal(calls,0);
});

test('generic Telegram publishing cannot leak full GOLD content to public channel',async()=>{
 const old=globalThis.fetch;let called=false;
 try{
  globalThis.fetch=async()=>{called=true;throw new Error('should not send')};
  assert.equal((await sendPredictionToTelegram(gold,env)).state,'not_configured');
  assert.equal(called,false);
 }finally{globalThis.fetch=old;}
});

test('all real publication paths use the common GOLD DM + official advert router',()=>{
 const backend=source('src/server.js');
 assert.match(backend,/const sendTelegram=async\(p,env,opts=\{\}\)=>p\.visibility==='gold'\?publishGoldTelegram/);
 assert.match(backend,/installNforceEngine\(app,\{db,authenticate,sendTelegram/);
 assert.match(backend,/installFootballAutomation\(app,\{db,authenticate,sendTelegram\}\)/);
 const goldModule=source('src/gold-public-announcement.js');
 assert.match(goldModule,/queueGoldPrediction/);
 assert.doesNotMatch(goldModule,/maybeSendCommunityNotice|TELEGRAM_FREE_CHAT_ID/);
 assert.match(source('src/init-db.js'),/telegram_gold_public_announcements/);
});

test('withdrawn GOLD prediction has its official ad removed by recorded chat/message id',async()=>{
 const deleted=[],updates=[];
 const db={execute:async(sql,args)=>{
  updates.push(sql);
  if(sql.includes('FROM telegram_prediction_messages'))return [[]];
  if(sql.includes('FROM telegram_vip_public_announcements'))return [[]];
  if(sql.includes('FROM telegram_community_announcements'))return [[]];
  if(sql.includes('FROM telegram_gold_public_announcements'))return [[{prediction_id:123,message_id:45,chat_id:-100888888}]];
  return [{affectedRows:1}];
 }};
 const result=await removePredictionTelegramMessages({db,predictionId:123,telegramApi:async(method,payload)=>{deleted.push([method,payload]);},env});
 assert.equal(result.removed,1);
 assert.deepEqual(deleted[0],['deleteMessage',{chat_id:'-100888888',message_id:45}]);
 assert.ok(updates.some(s=>s.includes("UPDATE telegram_gold_public_announcements SET removed_at")));
});

test('ambiguous Telegram send failure is marked failed, not retried or moved to group',async()=>{
 let claims=0,sends=0;
 const updates=[];
 const db={execute:async(sql)=>{
  updates.push(sql);
  if(sql.includes('INSERT IGNORE INTO telegram_gold_public_announcements'))return [{affectedRows:++claims===1?1:0}];
  return [{affectedRows:1}];
 }};
 const api=async()=>{sends++;throw new Error('simulated timeout');};
 const first=await announceGoldOfficial(gold,env,db,{api,verify});
 const second=await announceGoldOfficial(gold,env,db,{api,verify});
 assert.equal(first.state,'failed');assert.equal(second.state,'already_announced');
 assert.equal(sends,1);
 assert.ok(updates.some(sql=>sql.includes("SET state='failed'")));
});
