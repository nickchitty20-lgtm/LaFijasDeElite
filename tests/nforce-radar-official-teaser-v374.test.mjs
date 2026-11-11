import test from 'node:test';
import assert from 'node:assert/strict';
import {vipRadarOfficialTeaser} from '../src/nforce-vip-radar.js';
import {installNforceEngine} from '../src/nforce-engine.js';

const NOW=new Date('2026-11-11T15:00:00Z');
const DAY=86400000;
function matchesForRadar(){
 const teams=Array.from({length:12},(_,i)=>'Team '+i),matches=[];
 for(let i=0;i<420;i++){
  const a=teams[i%12],b=teams[(i*7+3)%12];if(a===b)continue;
  const ts=new Date(NOW.getTime()-(420-i)*DAY/2).toISOString();
  matches.push({id:i+1,source_key:'past-'+i,competition:'en.1',league:'Premier League',home:a,away:b,date:ts.slice(0,10),kickoff:ts,scheduled_time_known:true,
   home_goals:i%3,away_goals:i%4===0?1:2});
 }
 const ts=new Date(NOW.getTime()+48*3600000).toISOString();
 matches.push({id:991,source_key:'future-991',competition:'en.1',league:'Premier League',home:teams[0],away:teams[1],date:ts.slice(0,10),kickoff:ts,scheduled_time_known:true,home_goals:null,away_goals:null,live_status:'NS'});
 return matches;
}
function fakeEngine({officialReady=true,publicFails=false,hasMatches=true}={}){
 const history=hasMatches?matchesForRadar():[];
 const sends={private:[],official:[],checked:[]};
 const dispatched=new Set(),statements=[],handlers={};
 const db={
  getConnection:async()=>({
   query:async()=>[[{acquired:1}]],
   execute:async(q,args=[])=>{
    statements.push({q,args});
    if(q.startsWith('SELECT status,sent_at,telegram_message_id,private_failure_kind'))return [[{status:'sent',public_status:'sent',telegram_message_id:17}]];
    if(q.startsWith('INSERT IGNORE INTO nforce_vip_radar_dispatches')){
     if(dispatched.has(args[0]))return [{affectedRows:0}];
     dispatched.add(args[0]);return [{affectedRows:1}];
    }
    return [{affectedRows:1}];
   },release(){}
  }),
  execute:async()=>[[{enabled:0}]],
  query:async(q)=>{
   if(q.includes('FROM nforce_backtests'))return [[null]];
   if(q.includes('FROM nforce_vip_radar_dispatches'))return [[null]];
   if(q.includes('FROM nforce_matches'))return [history.map(x=>({...x,home_team:x.home,away_team:x.away,date_label:x.date,match_date:x.date,round_name:'Ronda'}))];
   throw Error('unexpected SQL '+q.slice(0,100));
  }
 };
 const app={get(path,...cb){handlers['GET '+path]=cb.at(-1);},post(path,...cb){handlers['POST '+path]=cb.at(-1);}};
 installNforceEngine(app,{db,authenticate(){},now:()=>NOW,
  inspectVipChannel:async()=>({ready:true,chat_id:'-1001234567890'}),sendRadarTelegram:async(chat,message)=>{sends.private.push({chat,message});return {message_id:17}},
  sendRadarOfficialTelegram:async(chat,message)=>{sends.official.push({chat,message});if(publicFails)throw Error('telegram error');return {message_id:23}},
  inspectOfficialChannel:async(env,options)=>{sends.checked.push(options);return officialReady?{ready:true,chat_id:'-1008888888888',title:'Oficial'}:{ready:false,reason:'Sin permiso de publicación.'};}
 });
 const response=()=>({statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}});
 const send=async()=>{
  const res=response();await handlers['POST /api/admin/football/vip-radar/send']({admin:{role:'owner'}},res);return res;
 };
 return {send,sends,statements};
}
async function withEnv(callback){
 const keys=['TELEGRAM_BOT_TOKEN','TELEGRAM_VIP_CHAT_ID','TELEGRAM_FREE_CHANNEL_CHAT_ID','TELEGRAM_FREE_CHANNEL_URL','PUBLIC_BASE_URL'];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_VIP_CHAT_ID:'-1001234567890',TELEGRAM_FREE_CHANNEL_CHAT_ID:'@FijasDeEliteOficial',PUBLIC_BASE_URL:'https://fijasdeelite.xyz/'});
 delete process.env.TELEGRAM_FREE_CHANNEL_URL;
 try{return await callback()}finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
}

test('public Radar teaser shows only sample fixture and schedule; never probabilites, markets, or analysis',()=>{
 const report={items:[{home:'Perú & <script>',away:'Francia',league:'Nations League',kickoff:'2026-11-12T23:00:00Z',probabilities:{home:71.8,draw:12.2,away:16},
  ai:{hybrid:{home:73}},quality:94,selection:'Secreto 1X',market:'Secreto handicap',analysis:'Análisis oculto'}, {home:'X',away:'Y'}]};
 const message=vipRadarOfficialTeaser(report,{baseUrl:'https://fijasdeelite.xyz/' });
 assert.match(message,/2 partidos estudiados/);
 assert.match(message,/Perú &amp; &lt;script&gt;/);
 assert.match(message,/Nations League/);
 assert.match(message,/12\/11/);
 assert.match(message,/fijasdeelite\.xyz/);
 for(const secret of ['71.8','73','94','Secreto','Análisis oculto','1X','<script>'])assert.ok(!message.includes(secret),secret);
 assert.match(message,/selecciones VIP validadas se publican por separado/i);
 assert.equal(vipRadarOfficialTeaser({items:[]}), '');
});

test('manual bulletin publishes private first and a distinct public teaser exactly once',()=>withEnv(async()=>{
 const f=fakeEngine();const result=await f.send();
 assert.equal(result.statusCode,200);assert.equal(result.body.sent,true);
 assert.equal(result.body.public_announcement.state,'sent');
 assert.equal(result.body.items,1);
 assert.equal(f.sends.private.length,1);assert.equal(f.sends.official.length,1);
 assert.equal(f.sends.private[0].chat,'-1001234567890');
 assert.equal(f.sends.official[0].chat,'-1008888888888');
 assert.match(f.sends.private[0].message,/Modelo base 1 \/ X \/ 2/);
 assert.doesNotMatch(f.sends.official[0].message,/Modelo base 1 \/ X \/ 2/);
 assert.deepEqual(f.sends.checked,[{checkPermissions:true}]);
 assert.ok(f.statements.some(x=>x.q.includes("public_status='sent'")));
 const second=await f.send();assert.equal(second.body.sent,false);
 assert.equal(f.sends.private.length,1);assert.equal(f.sends.official.length,1);
}));

test('official Telegram error never changes the successful VIP delivery or triggers duplicates',()=>withEnv(async()=>{
 const f=fakeEngine({publicFails:true});const result=await f.send();
 assert.equal(result.body.sent,true);assert.equal(result.body.public_announcement.state,'failed');
 assert.equal(f.sends.private.length,1);assert.equal(f.sends.official.length,1);
 assert.equal((await f.send()).body.sent,false);
 assert.equal(f.sends.official.length,1);
 assert.ok(f.statements.some(x=>x.args[0]==='failed'&&x.q.includes('public_status')));
}));

test('unverified public channel is never used, but private bulletin still succeeds',()=>withEnv(async()=>{
 process.env.TELEGRAM_FREE_CHANNEL_CHAT_ID='-1008888888888';
 const f=fakeEngine({officialReady:false});const result=await f.send();
 assert.equal(result.body.sent,true);assert.equal(result.body.public_announcement.state,'skipped');
 assert.equal(f.sends.private.length,1);assert.equal(f.sends.official.length,0);
}));

test('without modeled fixtures no private bulletin and no official preview are published',()=>withEnv(async()=>{
 const f=fakeEngine({hasMatches:false});const result=await f.send();
 assert.equal(result.body.sent,false);
 assert.equal(f.sends.private.length,0);assert.equal(f.sends.official.length,0);
}));

test('public channel @username verification failure does not preempt sending VIP',()=>withEnv(async()=>{
 process.env.TELEGRAM_FREE_CHANNEL_CHAT_ID='@FijasDeEliteOficial';
 const f=fakeEngine({officialReady:false});const result=await f.send();
 assert.equal(result.body.sent,true);assert.equal(result.body.public_announcement.state,'skipped');
 assert.equal(f.sends.private.length,1);assert.equal(f.sends.official.length,0);
 assert.equal(f.sends.checked.length,1);
}));
