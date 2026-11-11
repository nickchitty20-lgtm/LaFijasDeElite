/** Optional API-Football fixtures discovery for all known N-FORCE competitions.
 * One request per import at most; the free tier queries tomorrow only.
 * A paid extended plan permits a 30-day range, without league-by-league calls.
 * Discovery is not proof of a CURRENT NS state when a pick is published.
 */
import {footballApi} from './football-analysis.js';
import {normalizeScheduleFixture,PROVIDER_LEAGUES,cleanTeamName} from './live-schedule.js';
import {LEAGUES,stableFixtureId} from './nforce-data.js';
import {NATIONAL_COMPETITIONS,isNationalCompetition,canonicalNationalTeam} from './nforce-internationals.js';
import {reconcileFootballDataFixtures} from './football-data-fixtures.js';

const DAY=86_400_000;
const leagueNames=new Map([...LEAGUES,...NATIONAL_COMPETITIONS].map(c=>[c.code,c.name]));
const utcDay=ms=>new Date(ms).toISOString().slice(0,10);
const sqlUtc=iso=>new Date(iso).toISOString().slice(0,19).replace('T',' ');
export const WIDE_SUPPORTED_COMPETITIONS=Object.freeze([...new Set(Object.values(PROVIDER_LEAGUES))]);
export const WIDE_LOOKAHEAD_DAYS=30;

export function normalizeWideFixture(raw,{now=new Date(),days=WIDE_LOOKAHEAD_DAYS}={}){
 const fixture=normalizeScheduleFixture(raw);
 if(!fixture||fixture.status!=='NS'||!fixture.kickoff||!leagueNames.has(fixture.league))return null;
 const stamp=Date.parse(fixture.kickoff),current=now.getTime();
 if(!Number.isFinite(stamp)||stamp<=current+20*60_000||stamp>current+days*DAY)return null;
 const national=isNationalCompetition(fixture.league);
 const home=national?canonicalNationalTeam(raw?.teams?.home?.name):String(raw?.teams?.home?.name||'').trim().slice(0,120);
 const away=national?canonicalNationalTeam(raw?.teams?.away?.name):String(raw?.teams?.away?.name||'').trim().slice(0,120);
 if(!home||!away||cleanTeamName(home)===cleanTeamName(away))return null;
 const source_key='api-football-wide|'+String(fixture.id);
 return {id:stableFixtureId(source_key),source_key,competition:fixture.league,
  league:leagueNames.get(fixture.league),season:String(raw?.league?.season||new Date(stamp).getUTCFullYear()).slice(0,12),
  round:String(raw?.league?.round||'').slice(0,90),home,away,date:utcDay(stamp),
  kickoff:fixture.kickoff,scheduled_time_known:true,home_goals:null,away_goals:null,
  source_path:'secondary/api-football-wide'};
}

export async function fetchWideCalendar({request=footballApi,env=process.env,now=new Date()}={}){
 if(!env.FOOTBALL_API_KEY)throw Error('Falta FOOTBALL_API_KEY en Railway');
 const extended=env.FOOTBALL_SCHEDULE_PLAN==='extended';
 const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
 // Free access is explicitly bounded by the provider to a narrow date window.
 // Query only the next UTC date; never claim a paid-range result using free access.
 const params=extended?{from:utcDay(today),to:utcDay(today+WIDE_LOOKAHEAD_DAYS*DAY)}:{date:utcDay(today+DAY)};
 const raw=await request('fixtures',params,env);
 if(!Array.isArray(raw)||raw.length>8000)throw Error('Respuesta de calendario inesperada o excesiva');
 const events=raw.map(f=>normalizeWideFixture(f,{now})).filter(Boolean);
 return {events,received:raw.length,unmapped:raw.filter(f=>!Object.hasOwn(PROVIDER_LEAGUES,String(f?.league?.id))).length,
  discarded:raw.length-events.length,plan:extended?'extended':'free',range:params,limited:!extended};
}

export async function importWideCalendar({conn,enabled=false,now=new Date(),env=process.env,fetchCalendar=fetchWideCalendar}={}){
 const report={enabled:Boolean(enabled),configured:Boolean(env.FOOTBALL_API_KEY),plan:env.FOOTBALL_SCHEDULE_PLAN==='extended'?'extended':'free',
  requests:0,received:0,discovered:0,inserted:0,matched:0,unmapped:0,ambiguous:0,errors:[],limited:false};
 if(!enabled)return report;
 if(!env.FOOTBALL_API_KEY){report.errors.push('Falta FOOTBALL_API_KEY en Railway');return report;}
 // Independent daily budget: avoid exhausting the 70-call live verifier quota.
 // The request log must not be conflated with live NS verification records.
 const [counts]=await conn.query('SELECT COUNT(*) AS total FROM nforce_wide_calendar_requests WHERE requested_at>=UTC_DATE()');
 const maxDaily=report.plan==='extended'?4:6;
 if(Number(counts[0]?.total||0)>=maxDaily){report.limited=true;report.errors.push(`Límite de ${maxDaily} importaciones del calendario amplio por día UTC`);return report;}
 await conn.execute('INSERT INTO nforce_wide_calendar_requests(requested_at) VALUES (UTC_TIMESTAMP())');
 report.requests=1;
 let response;
 try{response=await fetchCalendar({env,now});}
 catch(error){report.errors.push(String(error?.message||error).slice(0,180));return report;}
 report.received=response.received||0;report.unmapped=response.unmapped||0;
 report.limited=Boolean(response.limited);
 report.discovered=response.events.length;
 const [locals]=await conn.query(`SELECT id,source_key,competition,home_team,away_team,match_date,kickoff,scheduled_time_known
   FROM nforce_matches WHERE match_date>=DATE_SUB(UTC_DATE(),INTERVAL 1 DAY)
   AND match_date<=DATE_ADD(UTC_DATE(),INTERVAL 33 DAY) AND home_goals IS NULL LIMIT 5000`);
 const result=reconcileFootballDataFixtures([...new Map(response.events.map(e=>[e.source_key,e])).values()],locals);
 report.ambiguous=result.ambiguous.length;
 for(const {event,local} of result.matches){
  // A calendar discovery never overrides a recent independent NS verification.
  await conn.execute(`UPDATE nforce_matches m SET m.kickoff=?,m.match_date=?,m.scheduled_time_known=1,m.source_checked_at=UTC_TIMESTAMP()
   WHERE m.id=? AND m.home_goals IS NULL AND m.away_goals IS NULL
   AND NOT EXISTS (SELECT 1 FROM nforce_fixture_schedules s WHERE s.nforce_match_id=m.id
   AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 4 HOUR))`,[sqlUtc(event.kickoff),event.date,local.id]);
  report.matched++;
 }
 for(const event of result.inserts){
  const [write]=await conn.execute(`INSERT IGNORE INTO nforce_matches
    (id,source_key,competition,league,season,round_name,home_team,away_team,match_date,kickoff,scheduled_time_known,home_goals,away_goals,source_path,source_checked_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,NULL,NULL,?,UTC_TIMESTAMP())`,[
   event.id,event.source_key,event.competition,event.league,event.season,event.round,event.home,event.away,
   event.date,sqlUtc(event.kickoff),event.source_path]);
  if(Number(write.affectedRows||0)>0)report.inserted++;
 }
 return report;
}
