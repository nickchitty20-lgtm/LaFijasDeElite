/** Additional upcoming-fixture discovery. TheSportsDB v1 public API.
 * No scores, live-state assertions or synthetic kickoff times are ever created.
 * Imported events are scouting inputs; publication retains N-FORCE checks.
 * Disabled unless allowed by the saved source setting (initially migrated from env).
 */
import {LEAGUES,stableFixtureId} from './nforce-data.js';
import {canonicalNationalTeam,isNationalCompetition,nationalCompetitionByCode} from './nforce-internationals.js';
import {cleanTeamName} from './live-schedule.js';

// Known league IDs, strictly mapped to existing local competitions (no user URL/SSRF).
// Includes domestic competitions and men's senior national-team tournaments.
export const SECONDARY_COMPETITIONS=Object.freeze([
 ['int.friendly',4562],['int.unl',4490],['int.concnl',5280],
 ['int.worldcup',4429],['int.euro',4502],['int.copa',4499],
 ['int.afcon',4496],['int.asia',4866],['int.goldcup',4873],
 ['en.1',4328],['es.1',4335],['de.1',4331],['it.1',4332],['fr.1',4334],
 ['en.2',4329],['sco.1',4330],['nl.1',4337],['pt.1',4344],
 ['be.1',4338],['tr.1',4339],['gr.1',4336],['br.1',4351]
 ].map(([code,id])=>Object.freeze({code,id})));
const byCode=new Map(SECONDARY_COMPETITIONS.map(x=>[x.code,x]));
const names=new Map(LEAGUES.map(x=>[x.code,x.name]));
const safe=v=>String(v??'').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
const toSql=d=>d.toISOString().slice(0,19).replace('T',' ');
const milliseconds=v=>{
 if(!v)return NaN;
 if(v instanceof Date)return v.getTime();
 const s=String(v).trim();
 return new Date(s.includes('T')?s:s.replace(' ','T')+'Z').getTime();
};
function timestamp(raw){
 const t=String(raw?.strTimestamp??'').trim();
 // TheSportsDB v1 documents strTimestamp as UTC but its actual payloads
 // omit the Z: e.g. 2026-11-21T12:30:00. Accept that specific API shape
 // only when its accompanying dateEvent and strTime confirm the components.
 // Never assume a generic local timestamp in any other format is UTC.
 if(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(t)){
  if(raw?.dateEvent!==t.slice(0,10)||raw?.strTime!==t.slice(11,19))return null;
  const d=new Date(t+'Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,19)===t?d:null;
 }
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/i.test(t))return null;
 const d=new Date(t);
 return Number.isFinite(d.getTime())?d:null;
}
export function normalizeSecondaryEvent(raw,competition,now=new Date(),days=21){
 const league=byCode.get(String(competition));
 if(!league||String(raw?.idLeague)!==String(league.id))return null;
 if(raw?.strSport&&!/^(soccer|football)$/i.test(String(raw.strSport)))return null;
 const eventId=String(raw?.idEvent??'');
 if(!/^\d{1,18}$/.test(eventId))return null;
 if(raw?.intHomeScore!=null&&String(raw.intHomeScore).trim()!==''||
    raw?.intAwayScore!=null&&String(raw.intAwayScore).trim()!=='')return null;
 const status=safe(raw?.strStatus).toLowerCase();
 if(status==='tbd'||String(raw?.strPostponed||'').toLowerCase()==='yes')return null;
 if(new Set(['ht','ft','aet','pen','1h','2h','et','live','pst','canc','abd','susp','int','awd','wo']).has(status))return null;
 if(/(finished|final|full.?time|postpon|cancel|abandon|suspend|live|half.?time|1st half|2nd half|in progress|penalt)/i.test(status))return null;
 const when=timestamp(raw);
 if(!when||when.toISOString().slice(11,19)==='00:00:00'||
    when.getTime()<=now.getTime()+40*60000||when.getTime()>now.getTime()+days*86400000)return null;
 const eventDate=String(raw?.dateEvent??'');
 if(!/^\d{4}-\d\d-\d\d$/.test(eventDate)||Math.abs(Date.parse(eventDate+'T12:00:00Z')-when.getTime())>36*3600000)return null;
 const national=isNationalCompetition(competition);
 const home=national?canonicalNationalTeam(raw?.strHomeTeam):safe(raw?.strHomeTeam);
 const away=national?canonicalNationalTeam(raw?.strAwayTeam):safe(raw?.strAwayTeam);
 if(!home||!away||cleanTeamName(home)===cleanTeamName(away))return null;
 const key=`secondary-thesportsdb|${eventId}`;
 return {id:stableFixtureId(key),source_key:key,provider_id:eventId,competition,
   league:national?nationalCompetitionByCode(competition)?.name:names.get(competition),
   home,away,season:safe(raw?.strSeason).slice(0,12)||String(when.getUTCFullYear()),
   round:safe(raw?.intRound).slice(0,90),date:when.toISOString().slice(0,10),
   kickoff:when.toISOString(),source_path:'secondary/thesportsdb',scheduled_time_known:true,
   home_goals:null,away_goals:null};
}
/** Match existing local records only when league, exact normalized teams and date
 * unambiguously agree. Avoid writing an alternative source's event as a new
 * fixture when a historical JSON record already represents the same game. */
export function reconcileSecondaryEvents(events,locals){
 const updates=[],inserts=[],ambiguous=[];
 const claimed=new Set();
 for(const e of events){
  const exact=(locals||[]).filter(m=>m.source_key===e.source_key);
  if(exact.length>1){ambiguous.push(e);continue;}
  if(exact.length===1){
   const m=exact[0];
   if(m.competition!==e.competition||cleanTeamName(m.home_team)!==cleanTeamName(e.home)||
      cleanTeamName(m.away_team)!==cleanTeamName(e.away)){ambiguous.push(e);continue;}
   if(!claimed.has(String(m.id))){updates.push({event:e,local:m});claimed.add(String(m.id));}
   continue;
  }
  const match=(locals||[]).filter(m=>m.competition===e.competition&&
   cleanTeamName(isNationalCompetition(e.competition)?canonicalNationalTeam(m.home_team):m.home_team)===cleanTeamName(e.home)&&
   cleanTeamName(isNationalCompetition(e.competition)?canonicalNationalTeam(m.away_team):m.away_team)===cleanTeamName(e.away)&&
   Math.abs((Number.isFinite(milliseconds(m.kickoff))?milliseconds(m.kickoff):Date.parse((m.match_date instanceof Date?m.match_date.toISOString().slice(0,10):String(m.match_date).slice(0,10))+'T12:00:00Z'))-Date.parse(e.kickoff))<=36*3600000);
  if(match.length>1){ambiguous.push(e);continue;}
  if(match.length===1){if(!claimed.has(String(match[0].id))){updates.push({event:e,local:match[0]});claimed.add(String(match[0].id));}continue;}
  if(!claimed.has(e.source_key)){inserts.push(e);claimed.add(e.source_key);}
 }
 return {updates,inserts,ambiguous};
}

export async function fetchSecondaryLeague(competition,{fetcher=fetch,key='123',now=new Date(),days=21}={}){
 const league=byCode.get(competition);
 if(!league)throw Error('Competición no admitida por la fuente complementaria');
 if(!/^\d{1,20}$/.test(String(key)))throw Error('Clave secundaria inválida');
 const url=`https://www.thesportsdb.com/api/v1/json/${key}/eventsnextleague.php?id=${league.id}`;
 const response=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'FijasDeElite-NForceFootball/3.6'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error(`Calendario complementario: HTTP ${response.status}`);
 if(Number(response.headers?.get?.('content-length')||0)>1_000_000)throw Error('Respuesta demasiado grande');
 const body=await response.text();
 if(Buffer.byteLength(body)>1_000_000)throw Error('Respuesta demasiado grande');
 let json;try{json=JSON.parse(body);}catch{throw Error('Respuesta complementaria sin JSON válido');}
 if(json?.events!=null&&!Array.isArray(json.events))throw Error('Formato de eventos inesperado');
 // Free endpoint is capped at a small number of upcoming events per league.
 if((json?.events||[]).length>100)throw Error('Respuesta con demasiados eventos');
 return (json?.events||[]).map(e=>normalizeSecondaryEvent(e,competition,now,days)).filter(Boolean);
}
/** Day-based fallback: the free provider has an independent 3-events/day cap.
 * Query seven UTC dates in addition to next-per-league. This is discovery,
 * not a reliable exhaustive calendar or proof of live NS status.
 * 7 day calls + 22 league calls = 29 requests per manual import (<30/min).
 */
const byLeagueId=new Map(SECONDARY_COMPETITIONS.map(x=>[String(x.id),x.code]));
export const SECONDARY_DAILY_LOOKAHEAD_DAYS=7;
export const SECONDARY_REQUESTS_PER_IMPORT=SECONDARY_COMPETITIONS.length+SECONDARY_DAILY_LOOKAHEAD_DAYS;
export async function fetchSecondaryDay(date,{fetcher=fetch,key='123',now=new Date(),days=21}={}){
 if(!/^\d{4}-\d\d-\d\d$/.test(String(date))||!Number.isFinite(Date.parse(date+'T00:00:00Z')))
  throw Error('Fecha de consulta inválida');
 if(!/^\d{1,20}$/.test(String(key)))throw Error('Clave secundaria inválida');
 const url=`https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${date}&s=Soccer`;
 const response=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'FijasDeElite-NForceFootball/3.6'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error(`Calendario diario: HTTP ${response.status}`);
 if(Number(response.headers?.get?.('content-length')||0)>1_000_000)throw Error('Respuesta diaria demasiado grande');
 const text=await response.text();
 if(Buffer.byteLength(text)>1_000_000)throw Error('Respuesta diaria demasiado grande');
 let json;try{json=JSON.parse(text);}catch{throw Error('Respuesta diaria sin JSON válido');}
 if(json?.events!=null&&!Array.isArray(json.events))throw Error('Respuesta diaria inválida');
 if((json?.events||[]).length>1500)throw Error('Respuesta diaria demasiado grande');
 const raw=json?.events||[];
 const events=raw.map(e=>normalizeSecondaryEvent(e,byLeagueId.get(String(e?.idLeague)),now,days)).filter(Boolean);
 return {events,received:raw.length,unmapped:raw.filter(e=>!byLeagueId.has(String(e?.idLeague))).length,
  limit_reached:raw.length===(key==='123'?3:1500)};
}
export async function importSecondaryFixtures({conn,now=new Date(),fetchLeague=fetchSecondaryLeague,fetchDay=fetchSecondaryDay,env=process.env,enabled}={}){
 if((enabled===undefined?env.FOOTBALL_SECONDARY_SCHEDULE==='true':enabled)!==true)return {enabled:false,requests:0,discovered:0,inserted:0,matched:0,errors:[]};
 const report={enabled:true,requests:0,discovered:0,inserted:0,matched:0,ambiguous:0,errors:[],by_competition:{},
  daily:{requests:0,received:0,unmapped:0,discovered:0,limit_days:0,days_checked:[],by_date:{}}};
 // The public free key is 123; the value can be overridden by an official paid V1 key.
 const key=env.FOOTBALL_SECONDARY_API_KEY||'123';
 const [locals]=await conn.query(`SELECT id,source_key,competition,home_team,away_team,match_date,kickoff,home_goals,away_goals
   FROM nforce_matches WHERE match_date>=DATE_SUB(UTC_DATE(),INTERVAL 2 DAY)
     AND match_date<=DATE_ADD(UTC_DATE(),INTERVAL 24 DAY) AND home_goals IS NULL LIMIT 3500`);
 const seenEvents=new Set();
 let failures=0;
 // Process seven dates first: the nearest games are the most actionable.
 // Add league fallback afterwards, keeping the free 30 requests/min budget.
 async function ingest(items,tag){
  const events=items.filter(e=>!seenEvents.has(e.source_key));
  events.forEach(e=>seenEvents.add(e.source_key));
  report.discovered+=events.length;
  const result=reconcileSecondaryEvents(events,locals);
  report.ambiguous+=result.ambiguous.length;
  if(tag?.code)report.by_competition[tag.code]={found:events.length,matched:result.updates.length,new:result.inserts.length};
  if(tag?.date){report.daily.discovered+=events.length;report.daily.by_date[tag.date]={found:events.length,matched:result.updates.length,new:result.inserts.length};}
  for(const {event,local} of result.updates){
   await conn.execute(`UPDATE nforce_matches m SET m.kickoff=?,m.match_date=?,m.scheduled_time_known=1,m.source_checked_at=UTC_TIMESTAMP()
     WHERE m.id=? AND m.home_goals IS NULL AND m.away_goals IS NULL
       AND NOT EXISTS (SELECT 1 FROM nforce_fixture_schedules s WHERE s.nforce_match_id=m.id
        AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 4 HOUR))`,
     [toSql(new Date(event.kickoff)),event.date,local.id]);
   report.matched++;
  }
  for(const event of result.inserts){
   const [inserted]=await conn.execute(`INSERT IGNORE INTO nforce_matches
     (id,source_key,competition,league,season,round_name,home_team,away_team,match_date,kickoff,scheduled_time_known,home_goals,away_goals,source_path,source_checked_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,NULL,NULL,?,UTC_TIMESTAMP())`,
     [event.id,event.source_key,event.competition,event.league,event.season,event.round,
       event.home,event.away,event.date,toSql(new Date(event.kickoff)),event.source_path]);
   if(Number(inserted.affectedRows||0)>0){
    report.inserted++;
    locals.push({id:event.id,source_key:event.source_key,competition:event.competition,home_team:event.home,away_team:event.away,
      match_date:event.date,kickoff:event.kickoff,home_goals:null});
   }
  }
 }
 const midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
 for(let offset=0;offset<SECONDARY_DAILY_LOOKAHEAD_DAYS;offset++){
  const date=new Date(midnight+offset*86400000).toISOString().slice(0,10);
  report.requests++;report.daily.requests++;report.daily.days_checked.push(date);
  try{
   const daily=await fetchDay(date,{key,now,days:21});
   // Fixtures with unknown leagues do not enter N-FORCE without a known
   // competition mapping and adequate historical statistics.
   const payload=Array.isArray(daily)?{events:daily,received:daily.length,unmapped:0,limit_reached:false}:daily;
   report.daily.received+=payload.received||0;
   report.daily.unmapped+=payload.unmapped||0;
   if(payload.limit_reached)report.daily.limit_days++;
   await ingest(payload.events||[],{date});failures=0;
  }catch(error){
   failures++;report.errors.push(`día ${date}: ${String(error?.message||error).slice(0,110)}`);
   if(failures>=3){report.errors.push('Búsqueda diaria detenida: tres fallos seguidos');break;}
  }
 }
 failures=0;
 for(const competition of SECONDARY_COMPETITIONS){
  report.requests++;
  try{
   const items=await fetchLeague(competition.code,{key,now,days:21});
   await ingest(items,{code:competition.code});failures=0;
  }catch(error){
   failures++;
   report.errors.push(`${competition.code}: ${String(error?.message||error).slice(0,110)}`);
   if(failures>=3){report.errors.push('Búsqueda por liga detenida: tres fallos seguidos');break;}
  }
 }
 report.daily.warning=report.daily.limit_days?
  `El plan gratuito alcanzó su tope de 3 partidos en ${report.daily.limit_days} fechas; no equivale al calendario completo de ESPN.`:null;
 report.warning=report.daily.unmapped?
  `${report.daily.unmapped} encuentros diarios pertenecen a competiciones sin modelo histórico habilitado.`:null;
 return report;
}
