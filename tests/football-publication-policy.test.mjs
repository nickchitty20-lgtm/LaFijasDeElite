import test from 'node:test';
import assert from 'node:assert/strict';
import {canAutoPublishCandidate} from '../src/football-publication-policy.js';
import {sendPredictionToTelegram,maybeSendVipTeaser,telegramVipPublicPreview} from '../src/telegram-bridge.js';
const env={TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_FREE_CHAT_ID:'-100999',TELEGRAM_FREE_CHANNEL_CHAT_ID:'-1001111111',TELEGRAM_VIP_CHAT_ID:'-100222',TELEGRAM_WEBHOOK_SECRET:'a'.repeat(32),PUBLIC_BASE_URL:'https://fijas.example'};
const candidate=(visibility,probability=45,extra={})=>({visibility,provider_probability:probability,status:'draft',market:'Resultado final 1X2',odds:null,evidence_json:{evidence_count:2,margin:20},...extra});
test('free between 40 and 50 with evidence can auto-publish WITHOUT bookmaker odds',()=>{
 assert.equal(canAutoPublishCandidate(candidate('free',45)),true);
 assert.equal(canAutoPublishCandidate(candidate('free',50)),true);
 assert.equal(canAutoPublishCandidate(candidate('free',51)),false);
 assert.equal(canAutoPublishCandidate(candidate('free',39)),false);
 assert.equal(canAutoPublishCandidate(candidate('free',45,{evidence_json:{evidence_count:1,margin:20}})),false);
});
test('VIP requiere evidencia y confianza, pero las cuotas opcionales no bloquean el envío',()=>{
 assert.equal(canAutoPublishCandidate(candidate('vip',80)),true);
 assert.equal(canAutoPublishCandidate(candidate('vip',63)),true);
 assert.equal(canAutoPublishCandidate(candidate('vip',62)),false);
 assert.equal(canAutoPublishCandidate(candidate('vip',80,{evidence_json:{evidence_count:1,margin:25}})),false);
});
test('public VIP preview shows safe fixture, competition and kickoff, hides actual bet',()=>{
 const p={id:34,auto_generated:true,visibility:'vip',title:'Local FC vs Visita FC',league:'Liga Demostración',market:'Resultado exacto',selection:'2-1',analysis:'ANALISIS SECRETISIMO 1199',odds:2.3,match_date:'2026-11-06T20:00:00Z'};
 const msg=telegramVipPublicPreview(p,'https://fijas.example');
 assert.match(msg,/Local FC vs Visita FC/); assert.match(msg,/Liga Demostración/);assert.match(msg,/https:\/\/fijas\.example\//);assert.doesNotMatch(msg,/clientes\.html/);
 for(const secret of ['ANALISIS SECRETISIMO 1199','2.30','Resultado exacto','2-1','99%'])assert.equal(msg.includes(secret),false);
});
test('untrusted manual title is omitted even if it contains the winning pick or HTML',()=>{
 const p={id:38,visibility:'vip',auto_generated:false,title:'GANARÁ LOCAL <script>alert(1)</script> vs Visita',league:'Liga & Copa',selection:'GANARÁ LOCAL',analysis:'SUPER SECRETO'};
 const msg=telegramVipPublicPreview(p,'https://example.test');
 assert.equal(msg.includes('GANARÁ LOCAL'),false);assert.equal(msg.includes('<script>'),false);
 assert.match(msg,/Liga &amp; Copa/);
});
test('every distinct VIP publication sends a preview to public, but same ID never twice',async()=>{
 const old=globalThis.fetch;const requests=[];const announced=new Set();
 const fakeDb={async execute(sql,args){
  if(sql.startsWith('INSERT IGNORE INTO telegram_vip_public_announcements')){
   const key=String(args[0]);if(announced.has(key))return [{affectedRows:0}];announced.add(key);return [{affectedRows:1}];
  }
  return [{affectedRows:1}];
 }};
 const p={id:34,auto_generated:true,visibility:'vip',title:'Local FC vs Visita FC',league:'Liga',market:'Resultado exacto',selection:'2-1',analysis:'ANALISIS SECRETISIMO 1199',odds:2.3,match_date:'2026-11-06T20:00:00Z'};
 try{
  globalThis.fetch=async (url,opts)=>{const body=JSON.parse(opts.body);if(String(url).endsWith('/getChat'))return {ok:true,json:async()=>({ok:true,result:{id:-1001111111,type:'channel',title:'Official'}})};requests.push(body);return {ok:true,json:async()=>({ok:true,result:{message_id:111}})}};
  await sendPredictionToTelegram(p,env,{db:fakeDb});
  await sendPredictionToTelegram({...p,id:35},env,{db:fakeDb});
  await sendPredictionToTelegram({...p,id:34},env,{db:fakeDb});
  assert.equal(requests.filter(x=>x.chat_id===env.TELEGRAM_VIP_CHAT_ID).length,3);
  const previews=requests.filter(x=>x.chat_id===env.TELEGRAM_FREE_CHANNEL_CHAT_ID);
  assert.equal(previews.length,2);
  for(const preview of previews){
   assert.match(preview.text,/Local FC vs Visita FC/);
   for(const secret of ['ANALISIS SECRETISIMO 1199','Resultado exacto','2.30','2-1'])assert.equal(preview.text.includes(secret),false);
  }
 }finally{globalThis.fetch=old;}
});
test('without a database no VIP public preview is sent (fail closed)',async()=>{
 const old=globalThis.fetch;const requests=[];
 try{
  globalThis.fetch=async (url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,result:{message_id:1}})}};
  await sendPredictionToTelegram({id:50,visibility:'vip',title:'Hidden',analysis:'Secret'},env);
  assert.equal(requests.length,1);
 }finally{globalThis.fetch=old;}
});
test('if Telegram public send fails, private publication still succeeds and failure is recorded',async()=>{
 const old=globalThis.fetch;const sqls=[];const db={async execute(sql,args){sqls.push(sql);return [{affectedRows:1}]}};
 try{
  globalThis.fetch=async (url,opts)=>{
   const body=JSON.parse(opts.body);
   if(String(url).endsWith('/getChat'))return {ok:true,json:async()=>({ok:true,result:{id:-1001111111,type:'channel',title:'Official'}})};
   if(body.chat_id===env.TELEGRAM_FREE_CHANNEL_CHAT_ID)return {ok:false,json:async()=>({ok:false,description:'simulated failure'})};
   return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};
  };
  const result=await sendPredictionToTelegram({id:51,visibility:'vip',title:'Fixture',analysis:'Secret'},env,{db});
  assert.equal(result.state,'sent');assert.equal(sqls.some(x=>x.includes("state='failed'")),true);
 }finally{globalThis.fetch=old;}
});
