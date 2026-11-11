import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {goldMayReceive,goldPrivateMessage,queueGoldPrediction,installGoldDeliveryWorker} from '../src/gold-telegram.js';
import {paidVipSql,paidGoldSql,getGoldEntitlement,getVipEntitlement} from '../src/vip-access.js';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('GOLD never upgrades a user to VIP; VIP includes GOLD',()=>{
 assert.match(paidVipSql('u'),/p\.tier='vip'/);
 assert.match(paidGoldSql('u'),/p\.tier IN \('gold','vip'\)/);
 assert.doesNotMatch(paidVipSql('u'),/IN \('gold','vip'\)/);
});
test('gold user entitlement uses server-side account status',async()=>{
 const data=await getGoldEntitlement({execute:async()=>[[{account_status:'active',paid_gold:1,staff_gold:0}]]},1);
 assert.equal(data.hasGold,true);
 const disabled=await getGoldEntitlement({execute:async()=>[[{account_status:'blacklisted',paid_gold:1,staff_gold:0}]]},1);
 assert.equal(disabled.hasGold,false);
});
test('Gold private message contains real pick but escapes markup safely',()=>{
 const msg=goldPrivateMessage({title:'A & B <malicious>',league:'Liga',match_date:'2026-11-17T20:00:00Z',market:'Doble oportunidad',selection:'1X',analysis:'Riesgo <medio>'});
 assert.match(msg,/GOLD/);
 assert.match(msg,/A &amp; B &lt;malicious&gt;/);
 assert.match(msg,/1X/);
 assert.doesNotMatch(msg,/<malicious>/);
});
test('Gold is not sent to expired, blocked, unlinked or replaced Telegram accounts',()=>{
 const base={active:true,linked:true,entitled:true,whitelisted:true,pendingChange:false,archived:null,telegramId:'12345678'};
 assert.equal(goldMayReceive(base),true);
 for(const patch of [{active:false},{entitled:false},{linked:false},{whitelisted:false},{pendingChange:1},{archived:'now'},{telegramId:'@channel'}])assert.equal(goldMayReceive({...base,...patch}),false);
});
test('queueGoldPrediction inserts only eligible linked subscribers and is safe to call repeatedly',async()=>{
 const queries=[];
 const fake={execute:async(sql,params)=>{queries.push([sql,params]);return [{affectedRows:2}];}};
 const q=await queueGoldPrediction(fake,42);
 assert.deepEqual(q,{state:'pending',queued:2});
 assert.match(queries[0][0],/INSERT IGNORE INTO telegram_gold_deliveries/);
 assert.match(queries[0][0],/p\.visibility='gold'/);
 assert.match(queries[0][0],/t\.link_status='active'/);
 assert.match(queries[0][0],/telegram_gold_whitelist/);
 assert.match(queries[0][0],/p\.tier IN \('gold','vip'\)/);
 assert.deepEqual(queries[0][1],[42]);
});
test('Gold worker cannot post to a channel or send without bot token',async()=>{
 const worker=installGoldDeliveryWorker({db:{},env:{TELEGRAM_BOT_TOKEN:''}});
 assert.deepEqual(await worker.tick(),{skipped:true});
 assert.match(source('src/gold-telegram.js'),/chat_id:String\(n.telegram_user_id\)/);
 assert.doesNotMatch(source('src/gold-telegram.js'),/TELEGRAM_FREE_CHAT_ID|TELEGRAM_VIP_CHAT_ID/);
 assert.match(source('src/gold-telegram.js'),/lease_id=\?/);
});
test('project migration and routes protect all Gold picks and keep VIP separate',()=>{
 const backend=source('src/server.js');
 const db=source('src/init-db.js');
 assert.match(db,/CREATE TABLE IF NOT EXISTS telegram_gold_deliveries/);
 assert.match(db,/ALTER TABLE predictions MODIFY COLUMN visibility ENUM\('free','gold','vip'\)/);
 assert.match(backend,/visibility:z.enum\(\['free','gold','vip'\]\)/);
 assert.match(backend,/if\(p.visibility==='gold'&&!gold\)return/);
 assert.match(backend,/if\(p.visibility==='vip'&&!vip\)return/);
 assert.match(backend,/goldControl.start\(\)/);
 assert.match(backend,/APP_VERSION = '3\.7\.5'/);
});

test('Gold private delivery is made once, uses Telegram DM, and requires current entitlement',async()=>{
 let delivered=0,attempts=0,lease=0;
 const row={id:1,user_id:9,prediction_id:22,telegram_user_id:98765432,title:'Equipo A vs Equipo B',league:'Liga',match_date:'2026-11-18T18:00:00Z',market:'Goles',selection:'Más de 1.5',analysis:'Predicción con incertidumbre',archived_at:null};
 const connection={query:async(sql)=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[{result:1}]],release:()=>{}};
 const db={
  getConnection:async()=>connection,
  execute:async(sql,args)=>{
   if(sql.includes('SELECT d.id'))return [attempts++===0?[row]:[]];
   if(sql.includes('SELECT u.account_status'))return [[{account_status:'active',telegram_user_id:98765432,link_status:'active',pending_change:0,entitled:1,whitelisted:1}]];
   return [{affectedRows:1}];
  }
 };
 const mock=async(method,payload)=>{assert.equal(method,'sendMessage');assert.equal(payload.chat_id,'98765432');assert.equal(payload.protect_content,true);assert.equal(payload.parse_mode,'HTML');assert.match(payload.text,/Equipo A vs Equipo B/);delivered++;return {message_id:50};};
 const worker=installGoldDeliveryWorker({db,env:{TELEGRAM_BOT_TOKEN:'fake'},api:mock});
 assert.equal((await worker.tick()).sent,1);
 assert.equal((await worker.tick()).sent,0);
 assert.equal(delivered,1);
});
