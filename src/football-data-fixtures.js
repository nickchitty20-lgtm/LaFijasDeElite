/** Optional third-party fixture calendar (football-data.org v4).
 * Discovery ONLY. The SCHEDULED state has no confirmed kickoff: it is kept
 * as date-only scouting input, never as a verified start time or live status.
 * No provider-provided predictions, goals or odds are synthesized.
 */
import {LEAGUES,stableFixtureId} from './nforce-data.js';
import {canonicalNationalTeam,isNationalCompetition,nationalCompetitionByCode} from './nforce-internationals.js';
import {cleanTeamName} from './live-schedule.js';

// Strict mapping to competitions for which our model has historical datasets.
// CL (Champions League) is deliberately excluded: there is no compatible
// multi-league historical dataset for it in N-FORCE at this time.
export const FOOTBALL_DATA_COMPETITIONS=Object.freeze({
 PL:'en.1',ELC:'en.2',BL1:'de.1',SA:'it.1',PD:'es.1',FL1:'fr.1',
 DED:'nl.1',PPL:'pt.1',BSA:'br.1',WC:'int.worldcup',EC:'int.euro'
});
const names=new Map(LEAGUES.map(x=>[x.code,x.name]));
const limitText=(v,n=120)=>String(v??'').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const sqlDate=v=>new Date(v).toISOString().slice(0,19).replace('T',' ');
const dateOnly=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
const isDate=v=>/^\d{4}-\d\d-\d\d$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));

export function normalizeFootballDataMatch(raw,{now=new Date(),days=21}={}){
 const code=String(raw?.competition?.code||'').toUpperCase();
 const competition=FOOTBALL_DATA_COMPETITIONS[code];
 const id=String(raw?.id??'');
 if(!competition||!/^[0-9]{1,18}$/.test(id))return null;
 const status=String(raw?.status||'').toUpperCase();
 if(!['SCHEDULED','TIMED'].includes(status))return null;
 const rawUtc=String(raw?.utcDate||'');
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(rawUtc))return null;
 const at=new Date(rawUtc),time=at.getTime();
 if(!Number.isFinite(time)||time<=now.getTime()+40*60000||time>now.getTime()+days*86400000)return null;
 const national=isNationalCompetition(competition);
 const home=national?canonicalNationalTeam(raw?.homeTeam?.name):limitText(raw?.homeTeam?.name||raw?.homeTeam?.shortName);
 const away=national?canonicalNationalTeam(raw?.awayTeam?.name):limitText(raw?.awayTeam?.name||raw?.awayTeam?.shortName);
 if(!home||!away||cleanTeamName(home)===cleanTeamName(away))return null;
 // A rough-date SCHEDULED fixture never becomes a TIMED one just because
 // the provider included a timestamp. 00:00 UTC can be a placeholder as well.
 const confirmed=status==='TIMED'&&at.toISOString().slice(11,19)!=='00:00:00';
 const key='secondary-footballdata|'+id;
 return {id:stableFixtureId(key),source_key:key,provider_id:id,competition,
  league:national?(nationalCompetitionByCode(competition)?.name||'Selecciones nacionales'):names.get(competition),
  home,away,season:limitText(raw?.season?.startDate,4)||String(at.getUTCFullYear()),
  round:limitText(raw?.stage||raw?.matchday||'',90),date:at.toISOString().slice(0,10),
  kickoff:confirmed?at.toISOString():null,scheduled_time_known:confirmed,
  source_path:'secondary/football-data-org',home_goals:null,away_goals:null};
}

/** Fetch a whole date window in ONE request: avoids the 1-match-per-league
 * limit of the public TheSportsDB endpoints. Requires the owner's own token.
 */
export async function fetchFootballDataFixtures({key,now=new Date(),days=21,fetcher=fetch}={}){
 if(typeof key!=='string'||!key.trim()||key.length>200)throw Error('Configura FOOTBALL_DATA_ORG_KEY en Railway');
 if(!Number.isInteger(days)||days<1||days>21)throw Error('Rango de búsqueda inválido');
 const from=now.toISOString().slice(0,10);
 // API v4 dateTo is exclusive: add one day after the last requested date.
 const to=new Date(Date.parse(from+'T00:00:00Z')+(days+1)*86400000).toISOString().slice(0,10);
 const url=new URL('https://api.football-data.org/v4/matches');
 url.searchParams.set('dateFrom',from);url.searchParams.set('dateTo',to);
 const response=await fetcher(url.toString(),{method:'GET',headers:{'X-Auth-Token':key,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok){
  if(response.status===403||response.status===401)throw Error('Clave inválida o plan sin acceso (HTTP '+response.status+')');
  if(response.status===429)throw Error('Límite de consultas alcanzado (HTTP 429)');
  throw Error('Calendario alternativo: HTTP '+response.status);
 }
 if(Number(response.headers?.get?.('content-length')||0)>3_000_000)throw Error('Respuesta deportiva demasiado grande');
 const text=await response.text();
 if(Buffer.byteLength(text)>3_000_000)throw Error('Respuesta deportiva demasiado grande');
 let json;try{json=JSON.parse(text);}catch{throw Error('Calendario alternativo devolvió JSON inválido');}
 if(!Array.isArray(json?.matches)||json.matches.length>3000)throw Error('Respuesta de partidos inesperada');
 const matched=json.matches.map(x=>normalizeFootballDataMatch(x,{now,days})).filter(Boolean);
 return {events:matched,received:json.matches.length,unmapped:json.matches.filter(x=>!FOOTBALL_DATA_COMPETITIONS[String(x?.competition?.code||'').toUpperCase()]).length,
  undated:matched.filter(e=>!e.scheduled_time_known).length,date_from:from,date_to_exclusive:to};
}

/** Reconcile using a unique league + normalized home/away + nearby UTC date.
 * Do not merge ambiguously matched fixtures or overwrite independently verified time.
 * Repeated imports update a provider's own date-only fixture when TIMED arrives.
 */
export function reconcileFootballDataFixtures(events,locals){
 const matches=[],inserts=[],ambiguous=[],claimed=new Set();
 for(const e of events||[]){
  const exact=(locals||[]).filter(m=>m.source_key===e.source_key);
  const target=exact.length?exact:(locals||[]).filter(m=>m.competition===e.competition&&
   cleanTeamName(isNationalCompetition(e.competition)?canonicalNationalTeam(m.home_team):m.home_team)===cleanTeamName(e.home)&&
   cleanTeamName(isNationalCompetition(e.competition)?canonicalNationalTeam(m.away_team):m.away_team)===cleanTeamName(e.away)&&
   Math.abs(Date.parse(dateOnly(m.match_date)+'T00:00:00Z')-Date.parse(e.date+'T00:00:00Z'))<=86400000);
  if(target.length>1){ambiguous.push(e);continue;}
  if(target.length===1){
   const m=target[0];
   // An exact source ID must never be repurposed to a different fixture.
   if(m.competition!==e.competition||cleanTeamName(m.home_team)!==cleanTeamName(e.home)||cleanTeamName(m.away_team)!==cleanTeamName(e.away)){
    ambiguous.push(e);continue;
   }
   if(!claimed.has(String(m.id))){matches.push({event:e,local:m});claimed.add(String(m.id));}
   continue;
  }
  if(!claimed.has(e.source_key)){inserts.push(e);claimed.add(e.source_key);}
 }
 return {matches,inserts,ambiguous};
}

export async function importFootballDataFixtures({conn,now=new Date(),enabled=false,key=process.env.FOOTBALL_DATA_ORG_KEY,fetchSchedule=fetchFootballDataFixtures}={}){
 const report={enabled:Boolean(enabled),configured:Boolean(key),requests:0,received:0,discovered:0,inserted:0,matched:0,ambiguous:0,without_time:0,unmapped:0,errors:[]};
 if(!enabled)return report;
 if(!key){report.errors.push('Falta FOOTBALL_DATA_ORG_KEY en Railway');return report;}
 let fetched;
 try{report.requests++;fetched=await fetchSchedule({key,now,days:21});}
 catch(e){report.errors.push(String(e?.message||e).slice(0,180));return report;}
 report.received=fetched.received||0;report.unmapped=fetched.unmapped||0;
 report.discovered=fetched.events.length;report.without_time=fetched.undated||0;
 const [locals]=await conn.query(`SELECT id,source_key,competition,home_team,away_team,match_date,kickoff,scheduled_time_known
  FROM nforce_matches WHERE match_date>=DATE_SUB(UTC_DATE(),INTERVAL 2 DAY)
  AND match_date<=DATE_ADD(UTC_DATE(),INTERVAL 24 DAY) AND home_goals IS NULL LIMIT 3500`);
 const dedup=new Map(fetched.events.map(e=>[e.source_key,e]));
 const result=reconcileFootballDataFixtures([...dedup.values()],locals);
 report.ambiguous=result.ambiguous.length;
 for(const {event,local} of result.matches){
  // A second source is NOT a live verification. Preserve newer independent
  // checks and never downgrade an already known kickoff to date-only.
  if(event.scheduled_time_known){
   await conn.execute(`UPDATE nforce_matches m SET m.kickoff=?,m.match_date=?,m.scheduled_time_known=1,m.source_checked_at=UTC_TIMESTAMP()
    WHERE m.id=? AND m.home_goals IS NULL AND m.away_goals IS NULL
    AND NOT EXISTS (SELECT 1 FROM nforce_fixture_schedules s WHERE s.nforce_match_id=m.id
    AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 4 HOUR))`,[sqlDate(event.kickoff),event.date,local.id]);
  }
  report.matched++;
 }
 for(const e of result.inserts){
  const [written]=await conn.execute(`INSERT IGNORE INTO nforce_matches
   (id,source_key,competition,league,season,round_name,home_team,away_team,match_date,kickoff,scheduled_time_known,home_goals,away_goals,source_path,source_checked_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,UTC_TIMESTAMP())`,
   [e.id,e.source_key,e.competition,e.league,e.season,e.round,e.home,e.away,e.date,e.kickoff?sqlDate(e.kickoff):null,e.scheduled_time_known?1:0,e.source_path]);
  report.inserted+=Number(written?.affectedRows||0)>0?1:0;
 }
 return report;
}
