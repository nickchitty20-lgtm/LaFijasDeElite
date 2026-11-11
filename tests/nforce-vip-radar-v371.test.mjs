import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareVipRadar,vipRadarTelegramMessage,VIP_RADAR_MIN_LEAD_HOURS,VIP_RADAR_MAX_DAYS} from '../src/nforce-vip-radar.js';
import {installNforceEngine} from '../src/nforce-engine.js';

const DAY=86400000;
const when=new Date('2026-11-11T15:00:00Z');
function fixtureData(){
 const teams=Array.from({length:12},(_,i)=>'Team '+i),matches=[];
 for(let i=0;i<420;i++){
  const a=teams[i%12],b=teams[(i*7+3)%12];if(a===b)continue;
  const ts=new Date(when.getTime()-(420-i)*DAY/2).toISOString();
  matches.push({id:i+1,source_key:'historical-'+i,competition:'en.1',league:'Premier League',home:a,away:b,date:ts.slice(0,10),kickoff:ts,scheduled_time_known:true,
   home_goals:i%3,away_goals:i%4===0?1:2});
 }
 const later=(hours,id=9999)=>{
  const ts=new Date(when.getTime()+hours*3600000).toISOString();
  return {id,source_key:'future-'+id,competition:'en.1',league:'Premier League',home:teams[0],away:teams[1],date:ts.slice(0,10),kickoff:ts,
   scheduled_time_known:true,home_goals:null,away_goals:null,live_status:'NS'};
 };
 return {matches,later};
}

test('radar VIP muestra partidos próximos desde dos horas, nunca crea una propuesta oficial',()=>{
 const {matches,later}=fixtureData();
 const result=prepareVipRadar([...matches,later(12,950),later(30,951),later(720,952),later(721,953)],{now:when});
 assert.equal(VIP_RADAR_MIN_LEAD_HOURS,2);assert.equal(VIP_RADAR_MAX_DAYS,30);
 assert.equal(result.eligible_total,3);
 assert.deepEqual(result.items.map(x=>x.fixture_id),['950','951','952']);
 assert.ok(result.items.every(x=>x.state==='analysis_only'&&x.official_vip===false));
 assert.equal(result.items[0].ai,null);
 assert.equal(result.items[0].probabilities.home+result.items[0].probabilities.draw+result.items[0].probabilities.away,100);
});

test('radar VIP rechaza fechas sin hora y partidos terminados o aplazados',()=>{
 const {matches,later}=fixtureData();
 const unknown={...later(50,970),kickoff:null,scheduled_time_known:false};
 const postponed={...later(51,971),live_status:'PST'};
 const final={...later(52,972),home_goals:2,away_goals:1};
 const report=prepareVipRadar([...matches,unknown,postponed,final],{now:when});
 assert.equal(report.eligible_total,0);assert.equal(report.counts.non_ns,1);assert.equal(report.counts.unknown_start,1);
 assert.equal(vipRadarTelegramMessage(report), '');
});

test('boletín privado identifica los análisis y escapa nombres hostiles sin tratarlo como fija aprobada',()=>{
 const report={items:[{home:'A & <script>',away:'B',league:'Liga X',kickoff:'2026-11-15T19:00:00Z',quality:82,
  probabilities:{home:51.2,draw:24.3,away:24.5},ai:null}]};
 const text=vipRadarTelegramMessage(report);
 assert.match(text,/RADAR INFORMATIVO/);
 assert.match(text,/NO SON FIJAS VIP APROBADAS/);
 assert.match(text,/A &amp; &lt;script&gt;/);
 assert.doesNotMatch(text,/<script>/);
 assert.doesNotMatch(text,/garantizado.*ganar/i);
});

test('solo propietario puede previsualizar y enviar; despacho VIP no se repite en el mismo día',async()=>{
 const {matches,later}=fixtureData();const all=[...matches,later(52)];
 const prev={token:process.env.TELEGRAM_BOT_TOKEN,vip:process.env.TELEGRAM_VIP_CHAT_ID,free:process.env.TELEGRAM_FREE_CHANNEL_CHAT_ID};
 process.env.TELEGRAM_BOT_TOKEN='fake',process.env.TELEGRAM_VIP_CHAT_ID='-1001234567890';delete process.env.TELEGRAM_FREE_CHANNEL_CHAT_ID;
 const handlers={},sent=[],days=new Set(),sql=[];
 const app={get(path,...cb){handlers['GET '+path]=cb.at(-1);},post(path,...cb){handlers['POST '+path]=cb.at(-1);}};
 const db={
  getConnection:async()=>({query:async(q)=>[[{acquired:1}]],execute:async(q,args=[])=>{
   sql.push(q);
   if(q.startsWith('SELECT status,sent_at,telegram_message_id,private_failure_kind'))return [[{status:'sent',public_status:'skipped',telegram_message_id:11}]];
   if(q.startsWith('INSERT IGNORE INTO nforce_vip_radar_dispatches')){
    if(days.has(args[0]))return [{affectedRows:0}];days.add(args[0]);return [{affectedRows:1}];
   }
   return [{affectedRows:1}];
  },release(){} }),
  execute:async()=>[[{enabled:0}]],
  query:async(q)=>{
   if(q.includes('FROM nforce_backtests'))return [[null]];
   if(q.includes('FROM nforce_vip_radar_dispatches'))return [[null]];
   if(q.includes('FROM nforce_matches'))return [all.map(x=>({...x,home_team:x.home,away_team:x.away,
    date_label:x.date,match_date:x.date,round_name:'Jornada'}))];
   throw Error('SQL inesperado: '+q.slice(0,65));
  }
 };
 installNforceEngine(app,{db,authenticate(){},now:()=>when,inspectVipChannel:async()=>({ready:true,chat_id:'-1001234567890'}),sendRadarTelegram:async(chat,message)=>{sent.push({chat,message});return {message_id:11};}});
 const makeRes=()=>({statusCode:200,body:null,status(code){this.statusCode=code;return this;},set(){return this;},json(body){this.body=body;return this;}});
 const preview=handlers['GET /api/admin/football/vip-radar'];
 const forbidden=makeRes();await preview({admin:{role:'analyst'}},forbidden);assert.equal(forbidden.statusCode,403);
 const r=makeRes();await preview({admin:{role:'owner'}},r);assert.equal(r.body.eligible_total,1);
 const send=handlers['POST /api/admin/football/vip-radar/send'];
 const first=makeRes();await send({admin:{role:'owner'}},first);
 assert.equal(first.body.sent,true);assert.equal(sent.length,1);assert.equal(sent[0].chat,'-1001234567890');
 assert.match(sent[0].message,/NO SON FIJAS VIP APROBADAS/);
 const second=makeRes();await send({admin:{role:'owner'}},second);
 assert.equal(second.body.sent,false);assert.equal(sent.length,1);
 assert.ok(sql.some(q=>q.includes('nforce_vip_radar_dispatches')));
 for(const [key,val] of [['TELEGRAM_BOT_TOKEN',prev.token],['TELEGRAM_VIP_CHAT_ID',prev.vip],['TELEGRAM_FREE_CHANNEL_CHAT_ID',prev.free]]){
  if(val===undefined)delete process.env[key];else process.env[key]=val;
 }
});
