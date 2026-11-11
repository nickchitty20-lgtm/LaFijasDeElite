import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,safeTelegramId,telegramLinkStart,telegramWebhookSecretValid,telegramPublicNotice,telegramVipPublicPreview,telegramHomeUrl,telegramVipPost,isPublicTelegramContentSafe,sendPredictionToTelegram} from '../src/telegram-bridge.js';

const pick={visibility:'free',title:'El Clásico',league:'Primera División',match_date:'2026-11-10 19:00',market:'Ambos anotan',selection:'Sí',odds:2.31,analysis:'Análisis SUPER PRIVADO 1044'};
test('public notices contain no selection, analysis or odds, including free picks',()=>{
 const message=telegramPublicNotice(pick,'https://example.com');
 assert.match(message,/Inicia|iniciando sesión/i);
 for(const secret of ['Ambos anotan','Sí','2.31','SUPER PRIVADO 1044'])assert.equal(message.includes(secret),false);
 assert.equal(message.includes('El Clásico'),false);
 assert.equal(isPublicTelegramContentSafe(message),true);
});
test('VIP teasers in public group still hide full picks',()=>{
 const message=telegramPublicNotice({...pick,visibility:'vip'},'https://example.com');
 assert.match(message,/NUEVO VIP/);
 assert.equal(message.includes('Análisis SUPER PRIVADO 1044'),false);
 assert.equal(message.includes('2.31'),false);
});
test('private channel message shows complete pick and escapes HTML',()=>{
 const message=telegramVipPost({...pick,title:'A < B & C'});
 assert.match(message,/A &lt; B &amp; C/);
 assert.match(message,/2.31/);
 assert.match(message,/SUPER PRIVADO 1044/);
});
test('deep linking only accepts 48-hex one-time code via start',()=>{
 const code='a'.repeat(48);
 assert.equal(telegramLinkStart('/start '+code),code);
 assert.equal(telegramLinkStart('/start '+code+'garbage'),null);
 assert.equal(telegramLinkStart('/start 123'),null);
});
test('webhook secret rejects missing and unequal secrets',()=>{
 const secret='abcDEF_123-'+'a'.repeat(26);
 assert.equal(telegramWebhookSecretValid(secret,secret),true);
 assert.equal(telegramWebhookSecretValid('bad',secret),false);
 assert.equal(telegramWebhookSecretValid(undefined,secret),false);
 assert.equal(telegramWebhookSecretValid(secret,'abc'),false);
});
test('Telegram ID guard rejects nonnumeric and unsafe integers',()=>{
 assert.equal(safeTelegramId('123456789'),true);
 assert.equal(safeTelegramId('1 OR 1=1'),false);
 assert.equal(safeTelegramId(Number.MAX_SAFE_INTEGER+1),false);
 assert.equal(safeTelegramId(-1),false);
});
test('cryptographic SHA256 produces 64-character hexadecimal',()=>{
 assert.match(sha256('test'),/^[a-f0-9]{64}$/);
 assert.notEqual(sha256('test'),sha256('test1'));
});
test('public publishing sends only full FREE predictions to official channel',async()=>{
 const old=globalThis.fetch;let request=null;
 try{
  globalThis.fetch=async (url,opts)=>{request=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,result:String(url).endsWith('/getChat')?{id:-1001234567,type:'channel',title:'Official'}:{message_id:123}})};};
  const result=await sendPredictionToTelegram(pick,{TELEGRAM_BOT_TOKEN:'example-token',TELEGRAM_FREE_CHAT_ID:'-100999',TELEGRAM_FREE_CHANNEL_CHAT_ID:'-1001234567',PUBLIC_BASE_URL:'https://example.com'});
  assert.equal(result.state,'sent');assert.equal(request.chat_id,'-1001234567');
  assert.equal(request.text.includes('SUPER PRIVADO 1044'),true);
  assert.match(request.text,/Nivel de riesgo: alto/);
 }finally{globalThis.fetch=old;}
});
test('VIP publishing sends full content privately; preview requires database',async()=>{
 const old=globalThis.fetch;const requests=[];
 try{
  globalThis.fetch=async (url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,result:{message_id:123}})};};
  const result=await sendPredictionToTelegram({...pick,visibility:'vip'},{TELEGRAM_BOT_TOKEN:'example-token',TELEGRAM_FREE_CHAT_ID:'-100123',TELEGRAM_VIP_CHAT_ID:'-100321',TELEGRAM_WEBHOOK_SECRET:'a'.repeat(32),PUBLIC_BASE_URL:'https://example.com'});
  assert.equal(result.state,'sent');assert.equal(requests.length,1);
  assert.equal(requests[0].chat_id,'-100321');assert.match(requests[0].text,/SUPER PRIVADO 1044/);
 }finally{globalThis.fetch=old;}
});

test('all public Telegram links lead to landing page, not /clientes.html',()=>{
 const bases=['https://example.com','https://example.com/','https://example.com/clientes.html','https://example.com/site?tracking=1'];
 for(const base of bases){
  assert.equal(telegramHomeUrl(base),'https://example.com/');
  for(const message of [telegramPublicNotice(pick,base),telegramVipPublicPreview({...pick,visibility:'vip'},base)]){
   assert.match(message,/https:\/\/example\.com\//);
   assert.equal(message.includes('/clientes.html'),false);
  }
 }
});
