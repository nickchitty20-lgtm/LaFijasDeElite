import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectVipTelegramChannel} from '../src/telegram-bridge.js';

const env={TELEGRAM_BOT_TOKEN:'mock-token',TELEGRAM_VIP_CHAT_ID:'-1001234567890',TELEGRAM_FREE_CHANNEL_CHAT_ID:'@OfficialFijas'};
const okApi=async(method,payload)=>{
 if(method==='getChat')return {id:-1001234567890,type:'channel',title:'VIP privado'};
 if(method==='getMe')return {id:9999,username:'MiBot'};
 if(method==='getChatMember')return {status:'administrator',can_post_messages:true};
 throw Error('unexpected '+method);
};
test('checks VIP channel, bot admin and posting rights without sending messages',async()=>{
 const methods=[];
 const result=await inspectVipTelegramChannel(env,{api:async(method,payload)=>{methods.push(method);return okApi(method,payload);}});
 assert.equal(result.ready,true);assert.equal(result.chat_id,'-1001234567890');
 assert.deepEqual(methods,['getChat','getMe','getChatMember']);
 assert.ok(!methods.includes('sendMessage'));
});
test('fails clearly when bot token or channel ID is missing',async()=>{
 assert.match((await inspectVipTelegramChannel({...env,TELEGRAM_BOT_TOKEN:''})).reason,/TELEGRAM_BOT_TOKEN/);
 assert.match((await inspectVipTelegramChannel({...env,TELEGRAM_VIP_CHAT_ID:'@foo'})).reason,/-100/);
});
test('rejects numeric destination equal to official channel',async()=>{
 const e={...env,TELEGRAM_FREE_CHANNEL_CHAT_ID:env.TELEGRAM_VIP_CHAT_ID};
 const r=await inspectVipTelegramChannel(e,{api:()=>{throw Error('should not query')} });
 assert.equal(r.ready,false);assert.match(r.reason,/coincide/);
});
test('rejects same channel when public uses @username but VIP uses numeric ID',async()=>{
 const r=await inspectVipTelegramChannel(env,{api:async(method,payload)=>{
  if(method==='getChat')return {id:-1001234567890,type:'channel',username:'officialfijas'};
  return okApi(method,payload);
 }});
 assert.equal(r.ready,false);assert.match(r.reason,/@usuario/);
});
test('reports missing admin rights and publishing rights specifically',async()=>{
 for(const member of [{status:'member'},{status:'administrator',can_post_messages:false}]){
  const r=await inspectVipTelegramChannel(env,{api:async(method,payload)=>method==='getChatMember'?member:okApi(method,payload)});
  assert.equal(r.ready,false);assert.match(r.reason,/administrador|Publicar mensajes/);
 }
});
test('captures Telegram error but does not expose bot token',async()=>{
 const r=await inspectVipTelegramChannel(env,{api:async()=>{throw Error('Bad Request: chat not found');}});
 assert.equal(r.ready,false);assert.match(r.reason,/chat not found/);assert.ok(!r.reason.includes('mock-token'));
});
