/** Owner-only inspection of a provider's next-day fixtures.
 * It is READ-ONLY discovery; never a prediction or a live verification.
 */
import {footballApi} from './football-analysis.js';
import {normalizeWideFixture} from './api-football-wide.js';
import {PROVIDER_LEAGUES,cleanTeamName} from './live-schedule.js';

const day=at=>at.toISOString().slice(0,10);
const matchDay=v=>v instanceof Date?day(v):String(v||'').slice(0,10);
const sameGame=(a,b)=>a.competition===b.competition&&
 cleanTeamName(a.home)===cleanTeamName(b.home_team)&&
 cleanTeamName(a.away)===cleanTeamName(b.away_team)&&
 Math.abs(Date.parse(a.date+'T00:00:00Z')-Date.parse(matchDay(b.match_date)+'T00:00:00Z'))<=86400000;
const concise=s=>String(s||'').replace(/[\r\n\t]/g,' ').slice(0,95);

export function summarizeCalendarAudit(fixtures,locals,{now=new Date(),date}={}){
 const target=date||day(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())+86400000));
 const raw=Array.isArray(fixtures)?fixtures:[];
 const seen=new Set(),covered=[],missing=[],unsupported=[];
 let excluded=0,notStarted=0;
 for(const fixture of raw){
  const providerId=String(fixture?.fixture?.id||'');
  if(providerId&&seen.has(providerId))continue;
  if(providerId)seen.add(providerId);
  const leagueId=String(fixture?.league?.id||'');
  const status=String(fixture?.fixture?.status?.short||'').toUpperCase();
  const when=Date.parse(String(fixture?.fixture?.date||''));
  const item={match:`${concise(fixture?.teams?.home?.name)} vs ${concise(fixture?.teams?.away?.name)}`,
   league:concise(fixture?.league?.name),status,kickoff:Number.isFinite(when)?new Date(when).toISOString():null};
  if(!Object.hasOwn(PROVIDER_LEAGUES,leagueId)){
   unsupported.push({...item,reason:'Competición sin histórico compatible'});continue;
  }
  if(status!=='NS'||!Number.isFinite(when)||when<=now.getTime()+20*60_000){excluded++;continue;}
  notStarted++;
  const normalized=normalizeWideFixture(fixture,{now,days:3});
  if(!normalized){excluded++;continue;}
  if((locals||[]).some(row=>sameGame(normalized,row)))covered.push({...item,competition:normalized.competition});
  else missing.push({...item,competition:normalized.competition});
 }
 return {date_utc:target,received:raw.length,valid_future:notStarted,
  in_mysql:covered.length,missing_in_mysql:missing.length,unmapped:unsupported.length,
  excluded,examples_missing:missing.slice(0,12),examples_unsupported:unsupported.slice(0,8),
  diagnosis:raw.length===0?'El proveedor no devolvió partidos para mañana. Comprueba la cobertura de tu plan.':
   missing.length?'Hay partidos compatibles que el proveedor conoce y todavía no están en MySQL. Activa la Fuente IV e importa los datos.':
   covered.length?'Los encuentros compatibles ya están registrados. Comprueba si su historial permite analizarlos.':
   unsupported.length?'El proveedor tiene partidos, pero son de competiciones todavía no compatibles con el histórico del modelo.':
   'El proveedor respondió, pero no hay encuentros futuros admisibles.'};
}

export async function auditTomorrowCalendar({request=footballApi,env=process.env,now=new Date(),locals=[]}={}){
 if(!env.FOOTBALL_API_KEY)throw Error('Falta FOOTBALL_API_KEY en Railway');
 const tomorrow=day(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())+86400000));
 const result=await request('fixtures',{date:tomorrow},env);
 if(!Array.isArray(result)||result.length>10000)throw Error('Respuesta de calendario inválida');
 return summarizeCalendarAudit(result,locals,{now,date:tomorrow});
}
