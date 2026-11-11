/** N-FORCE public-domain data adapter (OpenFootball football.json, CC0-1.0).
 * These are static files, not API-Football. They may lag actual fixtures.
 * Never invent an unavailable kickoff time. Never fetch arbitrary user URLs.
 */
import crypto from 'node:crypto';
import {nationalDatasets,canonicalNationalTeam,offsetKickoff} from './nforce-internationals.js';
export {NATIONAL_COMPETITIONS,nationalDatasets,isNationalCompetition} from './nforce-internationals.js';

export const NFORCE_PROVIDER='nforce-openfootball';
// Strict competition allowlist. The importer attempts only predefined paths.
// Missing files in a given season are reported as unavailable, never invented.
// Leagues without a current file can still contribute prior-season history.
export const LEAGUES=Object.freeze([
 {code:'en.1',name:'Premier League',zone:'Europe/London'},
 {code:'en.2',name:'Championship',zone:'Europe/London'},
 {code:'en.3',name:'League One',zone:'Europe/London'},
 {code:'en.4',name:'League Two',zone:'Europe/London'},
 {code:'es.1',name:'LaLiga',zone:'Europe/Madrid'},
 {code:'es.2',name:'Segunda División',zone:'Europe/Madrid'},
 {code:'de.1',name:'Bundesliga',zone:'Europe/Berlin'},
 {code:'de.2',name:'2. Bundesliga',zone:'Europe/Berlin'},
 {code:'it.1',name:'Serie A',zone:'Europe/Rome'},
 {code:'it.2',name:'Serie B',zone:'Europe/Rome'},
 {code:'fr.1',name:'Ligue 1',zone:'Europe/Paris'},
 {code:'fr.2',name:'Ligue 2',zone:'Europe/Paris'},
 {code:'nl.1',name:'Eredivisie',zone:'Europe/Amsterdam'},
 {code:'pt.1',name:'Primeira Liga',zone:'Europe/Lisbon'},
 {code:'sco.1',name:'Premiership escocesa',zone:'Europe/London'},
 {code:'be.1',name:'Primera División belga',zone:'Europe/Brussels'},
 {code:'at.1',name:'Bundesliga austríaca',zone:'Europe/Vienna'},
 {code:'tr.1',name:'Süper Lig',zone:'Europe/Istanbul'},
 {code:'gr.1',name:'Super League griega',zone:'Europe/Athens'},
 {code:'br.1',name:'Brasileirão Série A',zone:'America/Sao_Paulo',calendarYear:true},
]);
export function seasonForDate(date=new Date()){
 const y=date.getUTCFullYear();return (date.getUTCMonth()>=6?y:y-1);
}
export function allowedDatasets(date=new Date()){
 const start=seasonForDate(date),year=date.getUTCFullYear();
 return LEAGUES.flatMap(l=>{
  const seasons=l.calendarYear?[year-1,year].map(y=>String(y)):
   [start-1,start].map(y=>`${y}-${String((y+1)%100).padStart(2,'0')}`);
  return seasons.map(season=>({...l,season,path:`${season}/${l.code}.json`}));
 });
}
const timeFormatters=new Map();
const formatParts=(instant,zone)=>{
 let fmt=timeFormatters.get(zone);
 if(!fmt){fmt=new Intl.DateTimeFormat('en-GB',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 });timeFormatters.set(zone,fmt);}
 return Object.fromEntries(fmt.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
};
// Interpret local match time in its LEAGUE timezone, accounting for DST.
export function zonedKickoff(date,time,zone){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return null;
 const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number);
 const nominal=Date.UTC(y,m-1,d,hh,mm);
 if(new Date(nominal).toISOString().slice(0,10)!==date)return null;
 // Obtain the timezone offset on either side of possible DST changes.
 // Unlike fixed European offsets, this works for South America and Asia.
 const offsets=new Set();
 for(const probe of [nominal-86400000,nominal,nominal+86400000]){
  const p=formatParts(probe,zone);
  const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  offsets.add(wall-Math.floor(probe/60000)*60000);
 }
 const candidates=[];
 for(const offset of offsets){
  const ms=nominal-offset,p=formatParts(ms,zone);
  if(`${p.year}-${p.month}-${p.day}`===date&&`${p.hour}:${p.minute}`===time)candidates.push(ms);
 }
 // Ambiguous DST local times resolve to the earliest instant; nonexistent
 // wall times cannot be assigned a fictional kickoff.
 return candidates.length?new Date(Math.min(...candidates)):null;
}
const clean=(x,max=120)=>String(x??'').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function stableFixtureId(sourceKey){
 const hex=crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0,13);
 return Number.parseInt(hex,16); // <=2^52, exact in JS and MySQL BIGINT
}
export function normalizeOpenFootball(feed,dataset,now=new Date()){
 if(!feed||!Array.isArray(feed.matches)||feed.matches.length>(dataset.kind==='national'?4000:900))throw Error('JSON sin partidos o formato no permitido');
 const result=[];
 for(const m of feed.matches){
  const date=String(m.date||''),home=dataset.kind==='national'?canonicalNationalTeam(m.team1):clean(m.team1),away=dataset.kind==='national'?canonicalNationalTeam(m.team2):clean(m.team2);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!home||!away||home===away)continue;
  const time=typeof m.time==='string'?m.time.trim():'';
  const kick=dataset.kind==='national'?offsetKickoff(date,time)||(!dataset.requireOffset&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?zonedKickoff(date,time,dataset.zone):null):zonedKickoff(date,time,dataset.zone);
  const validTime=Boolean(kick);
  if(!validTime&&time&&dataset.kind!=='national')continue; // para selecciones: conservar fecha sin inventar hora
  // Stable key across reschedules: domestic league has one home/away pairing per season.
  const key=dataset.kind==='national'?[dataset.code,dataset.season,date,home,away].join('|'):[dataset.path,home,away].join('|');
  let gh=null,ga=null;
  const ft=dataset.kind==='national'?(Array.isArray(m.score)?m.score:m.score?.ft):m.score?.ft;
  const occurred=validTime?kick.getTime()<=now.getTime()-2*3600000:Date.parse(date+'T23:59:59Z')<now.getTime()-86400000;
  if(occurred&&Array.isArray(ft)&&ft.length===2&&ft.every(n=>Number.isInteger(n)&&n>=0&&n<=25)){
   gh=ft[0];ga=ft[1];
  }
  result.push({id:stableFixtureId(key),source_key:key,competition:dataset.code,league:dataset.name,
   season:dataset.season,round:clean(m.round,90),home,away,date,kickoff:kick?.toISOString()||null,
   scheduled_time_known:validTime,home_goals:gh,away_goals:ga,source_path:dataset.path});
 }
 return result;
}
// Abort on oversized responses or network problems; no user-supplied URLs.
export async function fetchOpenFootball(dataset,{fetcher=fetch}={}){
 const approved=[...allowedDatasets(),...nationalDatasets()].some(x=>x.path===dataset.path&&x.code===dataset.code&&x.source===dataset.source);
 if(!approved)throw Error('Fuente no autorizada');
 const url=dataset.kind==='national'?(dataset.source==='internationals'?
  `https://openfootball.github.io/internationals/${dataset.path}`:
  `https://raw.githubusercontent.com/openfootball/${dataset.source==='worldcup'?'worldcup.json':'euro.json'}/master/${dataset.path}`):
  `https://raw.githubusercontent.com/openfootball/football.json/master/${dataset.path}`;
 const response=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'FijasDeElite-NForceFootball/3.0'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`OpenFootball ${dataset.path}: HTTP ${response.status}`);
 if(Number(response.headers?.get?.('content-length')||0)>2_000_000)throw Error('Archivo excede el tamaño máximo');
 // Streaming size cap even if Content-Length is missing.
 let body='';
 if(response.body?.getReader){
  const reader=response.body.getReader();const decoder=new TextDecoder();let bytes=0;
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
   if(bytes>2_000_000){await reader.cancel();throw Error('Archivo excede el tamaño máximo');}
   body+=decoder.decode(value,{stream:true});}
  body+=decoder.decode();
 }else{body=await response.text();if(Buffer.byteLength(body)>2_000_000)throw Error('Archivo excede el tamaño máximo');}
 let json;try{json=JSON.parse(body);}catch{throw Error('Fuente JSON no válida');}
 return normalizeOpenFootball(json,dataset);
}
