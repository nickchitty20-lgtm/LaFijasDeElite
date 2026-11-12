/**
 * Private, informational VIP radar (never a published premium pick).
 * Discover and EXPLAIN the next seven days, including incomplete fixtures.
 * Only fixtures with a known future kickoff, no disqualifying live state,
 * sufficient real history and quality are eligible for a Telegram bulletin.
 * The radar never bypasses the official VIP publication gate.
 */
import {estimateMatch,modelReadiness,fulltime} from './nforce-model.js';
import {predictAiForecast} from './nforce-ml.js';
import {h,telegramHomeUrl} from './telegram-bridge.js';

// A 24-hour minimum hid tomorrow's real matches when the owner checked
// the panel in the afternoon. Shorten only the NON-OFFICIAL scouting radar.
export const VIP_RADAR_MIN_LEAD_HOURS=2;
export const VIP_RADAR_MAX_DAYS=30;
export const VIP_RADAR_NEAR_DAYS=7;
export const VIP_RADAR_MIN_QUALITY=55;
const DAY=86_400_000;
const pct=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'—';
const prettyReason=Object.freeze({
 unknown_start:'Fecha conocida, pero falta confirmar la hora del partido',
 too_close:'Partido a menos de 2 horas: no se envía al boletín',
 without_history:'No hay historial suficiente para calcular un modelo',
 league_history:'Faltan resultados históricos de la competición',
 team_history:'Faltan partidos históricos de uno o ambos equipos',
 stale_form:'El historial reciente no cumple el requisito del modelo',
 invalid_fixture:'Datos del encuentro incompletos o inconsistentes',
 low_quality:'Modelo calculado, pero la calidad del historial es insuficiente'
});
const validDay=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&Number.isFinite(Date.parse(String(x)+'T00:00:00Z'));

export function prepareVipRadar(matches,{now=new Date(),days=VIP_RADAR_MAX_DAYS,models={},limit=8}={}){
 const time=now.getTime(),historical=matches.filter(fulltime),today=now.toISOString().slice(0,10);
 const cutoff=time+days*DAY,nearCutoff=time+VIP_RADAR_NEAR_DAYS*DAY;
 const chosen=[],watch=[];
 const counts={future:0,unknown_start:0,within_window:0,without_history:0,low_quality:0,non_ns:0,
  too_close:0,near_term_detected:0,near_term_eligible:0,near_term_unknown_start:0,
  near_term_without_history:0,near_term_low_quality:0};
 function observe(fixture,reason,stamp,quality=null){
  if(stamp>nearCutoff||stamp<time-DAY)return;
  const date=validDay(fixture.date)?String(fixture.date):Number.isFinite(stamp)?new Date(stamp).toISOString().slice(0,10):null;
  watch.push({fixture_id:String(fixture.id),home:String(fixture.home||''),away:String(fixture.away||''),
   league:String(fixture.league||fixture.competition||''),date,
   kickoff:fixture.scheduled_time_known&&Number.isFinite(Date.parse(String(fixture.kickoff||'')))?new Date(fixture.kickoff).toISOString():null,
   status:'needs_review',reason,reason_text:prettyReason[reason]||prettyReason.without_history,
   quality,official_vip:false,_stamp:stamp});
 }
 for(const fixture of matches){
  if(fixture.home_goals!==null&&fixture.home_goals!==undefined||fixture.away_goals!==null&&fixture.away_goals!==undefined)continue;
  if(fixture.live_status&&fixture.live_status!=='NS'){counts.non_ns++;continue;}
  const kickoff=Date.parse(String(fixture.kickoff||''));
  const known=Boolean(fixture.scheduled_time_known&&Number.isFinite(kickoff));
  if(!known){
   if(!validDay(fixture.date)||String(fixture.date)<today)continue;
   const dateMs=Date.parse(fixture.date+'T12:00:00Z');
   if(dateMs>cutoff+DAY)continue;
   counts.unknown_start++;
   if(dateMs<=nearCutoff){counts.near_term_detected++;counts.near_term_unknown_start++;observe(fixture,'unknown_start',dateMs);}
   continue;
  }
  if(kickoff<=time)continue;
  counts.future++;
  if(kickoff>cutoff)continue;
  const near=kickoff<=nearCutoff;
  if(near)counts.near_term_detected++;
  if(kickoff<time+VIP_RADAR_MIN_LEAD_HOURS*3_600_000){
   counts.too_close++;if(near)observe(fixture,'too_close',kickoff);continue;
  }
  counts.within_window++;
  const forecast=estimateMatch(fixture,historical,kickoff);
  if(!forecast){
   counts.without_history++;
   if(near){
    counts.near_term_without_history++;
    const readiness=modelReadiness(fixture,historical,kickoff);
    const reason=prettyReason[readiness.reason]?readiness.reason:'without_history';
    observe(fixture,reason,kickoff);
   }
   continue;
  }
  if(forecast.quality<VIP_RADAR_MIN_QUALITY){
   counts.low_quality++;if(near){counts.near_term_low_quality++;observe(fixture,'low_quality',kickoff,forecast.quality);}
   continue;
  }
  const context=forecast.history_group==='selecciones'?'national':'club';
  const learned=predictAiForecast(forecast,models[context]);
  const mlOk=learned?.status==='promising_holdout';
  chosen.push({fixture_id:String(fixture.id),home:fixture.home,away:fixture.away,
   league:String(fixture.league||fixture.competition||''),competition:String(fixture.competition||''),
   kickoff:new Date(kickoff).toISOString(),context,quality:forecast.quality,
   probabilities:forecast.probabilities,
   ai:mlOk?{hybrid:learned.hybrid,holdout:learned.holdout,holdout_delta:learned.holdout_delta}:null,
   state:'analysis_only',official_vip:false});
  if(near)counts.near_term_eligible++;
 }
 chosen.sort((a,b)=>{
  const dayA=a.kickoff.slice(0,10),dayB=b.kickoff.slice(0,10);
  if(dayA!==dayB)return dayA.localeCompare(dayB);
  return (b.quality+Number(Boolean(b.ai))*3)-(a.quality+Number(Boolean(a.ai))*3)||a.kickoff.localeCompare(b.kickoff);
 });
 watch.sort((a,b)=>a._stamp-b._stamp||a.home.localeCompare(b.home));
 const observations=watch.slice(0,12).map(({_stamp,...entry})=>entry);
 return {items:chosen.slice(0,Math.min(Math.max(1,Math.floor(limit)),10)),eligible_total:chosen.length,
  watchlist:observations,near_term:{days:VIP_RADAR_NEAR_DAYS,detected:counts.near_term_detected,
   eligible:counts.near_term_eligible,observations_total:watch.length,
   missing_calendar:counts.near_term_detected===0,
   message:counts.near_term_detected===0?'La base de datos no contiene partidos próximos en esta ventana. Revisa Fuentes deportivas y la cobertura de las APIs.':
    counts.near_term_eligible===0?'Hay partidos próximos, pero ninguno supera por ahora los requisitos del Radar. Revisa las razones por encuentro.':
    `${counts.near_term_eligible} encuentros próximos tienen modelo y hora conocida.`},
  next_eligible_at:chosen[0]?.kickoff||null,
  counts,from_hours:VIP_RADAR_MIN_LEAD_HOURS,lookahead_days:days,
  official_vip_count:0};
}

export function vipRadarTelegramMessage(report,{asOf=new Date()}={}){
 if(!report?.items?.length)return '';
 const head='👑 <b>FIJAS DE ÉLITE · RADAR VIP · ANÁLISIS ANTICIPADO</b>\n📡 <b>Estudios de partidos próximos</b>\n\n';
 const rows=report.items.slice(0,5).map((f,i)=>{
  const dt=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(f.kickoff));
  const p=f.probabilities;
  return `<b>${i+1}. ${h(f.home)} vs. ${h(f.away)}</b>\n🏆 ${h(f.league)} · 🕒 ${h(dt)} (Perú)\n`+
   `📊 Modelo base 1 / X / 2: ${pct(p.home)} / ${pct(p.draw)} / ${pct(p.away)}`+
   (f.ai?`\n📈 Proyección complementaria 1 / X / 2: ${pct(f.ai.hybrid.home)} / ${pct(f.ai.hybrid.draw)} / ${pct(f.ai.hybrid.away)}`:'')+
   `\n📚 Cobertura estadística: ${Number(f.quality)}/100`;
 }).join('\n\n');
 return head+rows;
}

/** Public teaser for a successfully delivered VIP scouting bulletin.
 * It intentionally reveals only a fixture example and the size of the bulletin,
 * never estimated probabilities, AI output, markets, picks, or private analysis.
 * Never call this as a replacement for an actual published VIP prediction. */
export function vipRadarOfficialTeaser(report,{baseUrl}={}){
 if(!report?.items?.length)return '';
 const sample=report.items[0];
 const clean=value=>h(String(value??'').replace(/[\x00-\x1f\x7f\u2028\u2029]+/g,' ').trim().slice(0,90));
 const fixture=sample?.home&&sample?.away?`\n🔎 En seguimiento: <b>${clean(sample.home)} vs. ${clean(sample.away)}</b>`:'';
 const competition=sample?.league?`\n🏆 ${clean(sample.league)}`:'';
 const kickoff=Number.isFinite(Date.parse(String(sample?.kickoff||'')))
  ?`\n🗓️ ${h(new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(sample.kickoff)))} (Perú)` :'';
 const count=Math.min(report.items.length,5); // Private bulletin also lists at most five fixtures.
 return `👑 <b>FIJAS DE ÉLITE · RADAR VIP</b>\n\n`+
  `📣 <b>Nuevo boletín exclusivo de análisis anticipado</b>\n`+
  `⚽ <b>${count} ${count===1?'partido estudiado':'partidos estudiados'}</b>${fixture}${competition}${kickoff}\n\n`+
  `🔒 Las probabilidades y el estudio completo están disponibles en el canal VIP.\n`+
  `✨ Descubre la membresía: ${h(telegramHomeUrl(baseUrl))}`;
}
