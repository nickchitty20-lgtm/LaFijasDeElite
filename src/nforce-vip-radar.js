/**
 * Private, informational VIP radar (never a published premium pick).
 * Only known scheduled kickoff, not-started fixture, ≥24h lead and a real
 * historical model are eligible. ML is displayed only if properly fitted.
 * No requirement on a bookmaker price, and no promise of a profitable bet.
 */
import {estimateMatch,fulltime} from './nforce-model.js';
import {predictAiForecast} from './nforce-ml.js';
import {h} from './telegram-bridge.js';

export const VIP_RADAR_MIN_LEAD_HOURS=24;
export const VIP_RADAR_MAX_DAYS=30;
export const VIP_RADAR_MIN_QUALITY=55;
const DAY=86_400_000;
const pct=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'—';

export function prepareVipRadar(matches,{now=new Date(),days=VIP_RADAR_MAX_DAYS,models={},limit=5}={}){
 const time=now.getTime(),historical=matches.filter(fulltime);
 const chosen=[],counts={future:0,unknown_start:0,within_window:0,without_history:0,low_quality:0,non_ns:0};
 for(const fixture of matches){
  if(fixture.home_goals!==null&&fixture.home_goals!==undefined||fixture.away_goals!==null&&fixture.away_goals!==undefined)continue;
  const kickoff=Date.parse(String(fixture.kickoff||''));
  if(fixture.live_status&&fixture.live_status!=='NS'){counts.non_ns++;continue;}
  if(!fixture.scheduled_time_known||!Number.isFinite(kickoff)){
   if(String(fixture.date||'')>=now.toISOString().slice(0,10))counts.unknown_start++;
   continue;
  }
  if(kickoff<=time)continue;
  counts.future++;
  if(kickoff<time+VIP_RADAR_MIN_LEAD_HOURS*3_600_000||kickoff>time+days*DAY)continue;
  counts.within_window++;
  const forecast=estimateMatch(fixture,historical,kickoff);
  if(!forecast){counts.without_history++;continue;}
  if(forecast.quality<VIP_RADAR_MIN_QUALITY){counts.low_quality++;continue;}
  const context=forecast.history_group==='selecciones'?'national':'club';
  const learned=predictAiForecast(forecast,models[context]);
  const mlOk=learned?.status==='promising_holdout';
  chosen.push({fixture_id:String(fixture.id),home:fixture.home,away:fixture.away,
   league:String(fixture.league||fixture.competition||''),competition:String(fixture.competition||''),
   kickoff:new Date(kickoff).toISOString(),context,quality:forecast.quality,
   probabilities:forecast.probabilities,
   ai:mlOk?{hybrid:learned.hybrid,holdout:learned.holdout,holdout_delta:learned.holdout_delta}:null,
   state:'analysis_only',official_vip:false});
 }
 // Prioritise the next eligible day, then quality and validated AI evidence;
 // deterministic ordering allows the owner to compare subsequent runs.
 chosen.sort((a,b)=>{
  const dayA=a.kickoff.slice(0,10),dayB=b.kickoff.slice(0,10);
  if(dayA!==dayB)return dayA.localeCompare(dayB);
  return (b.quality+Number(Boolean(b.ai))*3)-(a.quality+Number(Boolean(a.ai))*3)||a.kickoff.localeCompare(b.kickoff);
 });
 return {items:chosen.slice(0,Math.min(Math.max(1,Math.floor(limit)),10)),eligible_total:chosen.length,
  counts,from_hours:VIP_RADAR_MIN_LEAD_HOURS,lookahead_days:days,
  official_vip_count:0,disclaimer:'Análisis previo exclusivo. No constituye una selección VIP validada ni una recomendación de apuesta.'};
}

export function vipRadarTelegramMessage(report,{asOf=new Date()}={}){
 if(!report?.items?.length)return '';
 const head='👑 <b>FIJAS DE ÉLITE · RADAR VIP</b>\n📡 <b>Estudios de partidos próximos</b>\n\n';
 const rows=report.items.slice(0,5).map((f,i)=>{
  const dt=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(f.kickoff));
  const p=f.probabilities;
  return `<b>${i+1}. ${h(f.home)} vs. ${h(f.away)}</b>\n🏆 ${h(f.league)} · 🕒 ${h(dt)} (Perú)\n`+
   `📊 Modelo base 1 / X / 2: ${pct(p.home)} / ${pct(p.draw)} / ${pct(p.away)}`+
   (f.ai?`\n🧠 Híbrido IA exploratorio 1 / X / 2: ${pct(f.ai.hybrid.home)} / ${pct(f.ai.hybrid.draw)} / ${pct(f.ai.hybrid.away)}`:'')+
   `\nCalidad del historial: ${Number(f.quality)}/100 (no representa aciertos).`;
 }).join('\n\n');
 return head+rows+'\n\n⚠️ <b>RADAR INFORMATIVO · NO SON FIJAS VIP APROBADAS.</b>\n'+
  'Las probabilidades son estimaciones, no tasas de acierto verificadas ni garantías de resultados. El canal distinguirá los pronósticos VIP validados de estos estudios.\n'+
  'No apuestes dinero que no puedas permitirte perder.';
}
