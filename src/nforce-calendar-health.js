/** Calendar coverage diagnostics. Never infer a missing kick-off from a date alone. */
const DAY=86400000;
const stamp=value=>value instanceof Date?value.getTime():Date.parse(String(value||''));
const dateOnly=value=>String(value||'').slice(0,10);
export function diagnoseNforceCalendar(matches,{now=new Date(),days=14,limit=20}={}){
 const instant=stamp(now),end=instant+days*DAY;
 if(!Number.isFinite(instant)||!Number.isFinite(end)||days<1)throw Error('Rango de calendario inválido');
 const today=new Date(instant).toISOString().slice(0,10);
 const endDate=new Date(end).toISOString().slice(0,10);
 const perLeague=new Map();
 const totals={date_only_in_window:0,known_time_in_window:0,known_time_blocked_status:0,
  invalid_kickoff_in_window:0,past_kickoffs_with_future_date:0,future_known_time:0,
  verified_kickoffs_in_window:0,scheduled_without_time_total:0};
 let nextKnown=null;
 for(const m of matches||[]){
  if(m.home_goals!==null&&m.home_goals!==undefined)continue;
  const date=dateOnly(m.date);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today)continue;
  const key=String(m.competition||'unknown');
  if(!perLeague.has(key))perLeague.set(key,{code:key,league:String(m.league||key),future:0,date_only_in_window:0,
   known_time_in_window:0,known_time_blocked_status:0,verified_kickoffs_in_window:0,earliest_known:null});
  const league=perLeague.get(key);league.future++;
  const inDateWindow=date<=endDate;
  if(!m.kickoff||!m.scheduled_time_known){
   totals.scheduled_without_time_total++;
   if(inDateWindow){totals.date_only_in_window++;league.date_only_in_window++;}
   continue;
  }
  const ms=stamp(m.kickoff);
  if(!Number.isFinite(ms)){
   if(inDateWindow)totals.invalid_kickoff_in_window++;
   continue;
  }
  if(ms<=instant){
   if(date>today)totals.past_kickoffs_with_future_date++;
   continue;
  }
  totals.future_known_time++;
  if(!league.earliest_known||ms<Date.parse(league.earliest_known))league.earliest_known=new Date(ms).toISOString();
  if(!nextKnown||ms<Date.parse(nextKnown.kickoff))nextKnown={match:`${m.home} vs ${m.away}`,kickoff:new Date(ms).toISOString(),league:league.league};
  if(ms>=end)continue;
  const state=String(m.live_status||'NS').toUpperCase();
  if(state!=='NS'){
   totals.known_time_blocked_status++;league.known_time_blocked_status++;
   continue;
  }
  totals.known_time_in_window++;league.known_time_in_window++;
  if(m.schedule_verified_at){totals.verified_kickoffs_in_window++;league.verified_kickoffs_in_window++;}
 }
 const leagues=[...perLeague.values()].sort((a,b)=>b.known_time_in_window-a.known_time_in_window||b.date_only_in_window-a.date_only_in_window||a.league.localeCompare(b.league)).slice(0,limit);
 let diagnosis='Calendario disponible para análisis';
 if(!totals.known_time_in_window){
  diagnosis=totals.date_only_in_window?'Hay partidos con fecha dentro de la ventana, pero sin hora utilizable. Falta confirmación/importación del horario.':
   totals.known_time_blocked_status?'Hay encuentros con horario en la ventana pero su estado no permite nuevas propuestas.':
   totals.future_known_time?'Los próximos partidos con hora están fuera de la ventana o han cambiado de estado.':
   'No se han importado encuentros futuros con hora válida. Revisa la cobertura y la última importación.';
 }
 return {lookahead_days:days,today_utc:today,window_until_utc:endDate,
  ...totals,leagues_with_future:perLeague.size,per_league:leagues,next_known:nextKnown,diagnosis};
}
