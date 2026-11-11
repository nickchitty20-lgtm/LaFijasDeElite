import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTelegramUsername,telegramGoldUsernameMatches,goldAuthorizationText} from '../src/gold-whitelist.js';
import {goldOfficialAnnouncement} from '../src/gold-public-announcement.js';
import {sha256} from '../src/telegram-bridge.js';
import {goldMayReceive} from '../src/gold-telegram.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GOLD username registration validates Telegram usernames and is case insensitive',()=>{
 assert.equal(normalizeTelegramUsername(' @Usuario_22 '),'usuario_22');
 assert.equal(normalizeTelegramUsername('Tgabc'),'tgabc');
 for(const u of ['@abc','@@Usuario','bad username','https://t.me/test','a'.repeat(33),'123456'])assert.equal(normalizeTelegramUsername(u),null);
 assert.equal(telegramGoldUsernameMatches('@Usuario_22','USUARIO_22'),true);
 assert.equal(telegramGoldUsernameMatches('@Usuario_22','Impostor22'),false);
 assert.match(goldAuthorizationText('@Usuario_22'),/lista blanca GOLD/);
});

test('official GOLD preview contains confirmed matchup but never choice, odds, probability or analysis',()=>{
 const p={visibility:'gold',auto_generated:true,title:'Perú vs Brasil',league:'Clasificatorias',
  match_date:'2026-11-19T18:30:00Z',market:'Doble oportunidad',selection:'1X',odds:2.18,analysis:'Estrategia reservada',estimated_probability:81};
 const txt=goldOfficialAnnouncement('https://fijasdeelite.xyz/clientes.html?plan=99',p);
 assert.match(txt,/Perú vs Brasil/);assert.match(txt,/Clasificatorias/);assert.match(txt,/GOLD/);
 assert.match(txt,/https:\/\/fijasdeelite\.xyz\//);
 for(const privatePart of ['1X','2.18','81','Estrategia reservada','Doble oportunidad','plan=99'])assert.equal(txt.includes(privatePart),false,privatePart);
 const manual=goldOfficialAnnouncement('https://fijasdeelite.xyz',{...p,auto_generated:false,title:'Perú vs Brasil · 1X',league:'Apuesta secreta'});
 assert.doesNotMatch(manual,/Perú vs Brasil|Apuesta secreta|1X/);
});

test('GOLD delivery requires verified whitelist plus current entitlement and active linked ID',()=>{
 const valid={active:true,linked:true,entitled:true,whitelisted:true,pendingChange:false,archived:null,telegramId:'12345678'};
 assert.equal(goldMayReceive(valid),true);
 for(const changed of [{whitelisted:false},{linked:false},{entitled:false},{active:false},{pendingChange:true},{archived:'now'}])assert.equal(goldMayReceive({...valid,...changed}),false);
 const source=read('src/gold-telegram.js');
 assert.match(source,/JOIN telegram_gold_whitelist w/);
 assert.match(source,/w\.telegram_user_id=t\.telegram_user_id/);
 assert.match(source,/w\.status='verified'/);
 assert.match(read('src/init-db.js'),/CREATE TABLE IF NOT EXISTS telegram_gold_whitelist/);
});

test('GOLD authorization verifies /start user ID and matching username before whitelist approval',async(t)=>{
 let installTelegramRoutes;
 try{({installTelegramRoutes}=await import('../src/telegram-routes.js'));}
 catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'){t.skip('Dependencias npm no instaladas; ruta dinámica se valida tras npm install');return;}throw error;}
 const previous={...process.env},originalFetch=globalThis.fetch;
 process.env.TELEGRAM_BOT_TOKEN='test-token';
 process.env.TELEGRAM_WEBHOOK_SECRET='Secret_123456789_ABCDEF_123456';
 const outbound=[];
 globalThis.fetch=async(url,options)=>{
  const method=String(url).split('/').at(-1);
  if(method==='getMe')return {ok:true,json:async()=>({ok:true,result:{id:555,username:'EliteSoccerBot'}})};
  if(method==='sendMessage'){outbound.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:{message_id:6}})};}
  throw new Error('Unexpected external API call '+method);
 };
 try{
  const routes=new Map();const app={get:(url,...handlers)=>routes.set('GET '+url,handlers.at(-1)),post:(url,...handlers)=>routes.set('POST '+url,handlers.at(-1))};
  const state={username:null,userId:null,telegramId:null,telegramUsername:null,token:null,verified:false};
  const sqlCalls=[];
  const execute=async(sql,args=[])=>{
   sqlCalls.push(sql);
   if(sql.includes('AS paid_gold'))return [[{account_status:'active',paid_gold:1,staff_gold:0}]];
   if(sql.includes('FROM telegram_links WHERE user_id=? FOR UPDATE'))return [[state.telegramId?{telegram_user_id:state.telegramId,telegram_username:state.telegramUsername,link_status:'active'}:null]];
   if(sql.includes('FROM telegram_change_state WHERE user_id=?'))return [[]];
   if(sql.includes('INSERT INTO telegram_gold_whitelist')){
    state.username=args[1];state.userId=args[0];
    if(sql.includes("'pending'")){state.verified=false;state.telegramId=null;}
    else{state.verified=true;state.telegramId=args[2];}
    return [{affectedRows:1}];
   }
   if(sql.includes('INSERT INTO telegram_link_tokens')){state.token=args[1];return [{affectedRows:1}];}
   if(sql.includes('SELECT c.user_id,c.old_telegram_user_id'))return [[]];
   if(sql.includes('FROM telegram_link_tokens t JOIN users u')){
    return [[state.token===args[0]?{user_id:state.userId,account_status:'active',requested_username:state.username,gold_whitelist_status:'pending'}:null]];
   }
   if(sql.includes('FROM telegram_links WHERE user_id=? OR telegram_user_id=?'))return [[]];
   if(sql.includes('FROM telegram_owner_preserved WHERE telegram_user_id=?'))return [[]];
   if(sql.includes('SELECT cooldown_until>UTC_TIMESTAMP()'))return [[]];
   if(sql.includes('AS gold FROM users u'))return [[{gold:1}]];
   if(sql.includes('INSERT INTO telegram_links(')){state.telegramId=args[1];state.telegramUsername=args[2];return [{affectedRows:1}];}
   if(sql.includes('DELETE FROM telegram_link_tokens')){state.token=null;return [{affectedRows:1}];}
   return [{affectedRows:1}];
  };
  const connection={execute,beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{}};
  const db={execute,getConnection:async()=>connection};
  installTelegramRoutes(app,{db,customerAuth:()=>{},authenticate:()=>{},limit:()=>{}});
  const response=()=>({statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
  const enroll=response();
  await routes.get('POST /api/customers/telegram/gold/authorize')({customer:{id:7},body:{username:'@SoccerFan55'}},enroll);
  assert.equal(enroll.statusCode,200);assert.equal(enroll.body.authorized,false);
  const startCode=new URL(enroll.body.url).searchParams.get('start');
  assert.equal(state.token,sha256(startCode));
  const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
  const webHook=routes.get('POST /api/telegram/webhook');
  async function start(username,telegramId,id){
   const res=response();await webHook({get:(key)=>key==='X-Telegram-Bot-Api-Secret-Token'?secret:null,
    body:{update_id:id,message:{text:'/start '+startCode,from:{id:telegramId,username},chat:{id:telegramId,type:'private'}}}},res);
   return res;
  }
  assert.equal((await start('NotTheOwner',12345,1)).statusCode,200);
  assert.equal(state.verified,false);
  assert.match(outbound.at(-1).text,/no coincide/i);
  assert.equal((await start('SoccerFan55',12345,2)).statusCode,200);
  assert.equal(state.verified,true);assert.equal(state.telegramId,'12345');
  assert.match(outbound.at(-1).text,/autorizada en la lista blanca GOLD/i);
  assert.ok(sqlCalls.some(q=>q.includes("w.status='verified'")||q.includes("status='verified'")));
 }finally{globalThis.fetch=originalFetch;process.env=previous;}
});
