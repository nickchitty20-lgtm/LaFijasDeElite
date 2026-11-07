/* Fijas de Élite v2.1.8 — Match kickoff clock, display-only. */
(()=>{'use strict';
 const MINUTE=60_000;
 function parse(value){
  if(value instanceof Date)return Number.isFinite(value.getTime())?value:null;
  if(typeof value!=='string')return null;
  const raw=value.trim();
  if(!raw)return null;
  const iso=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)?raw.replace(' ','T')+'Z':raw;
  const dt=new Date(iso);return Number.isFinite(dt.getTime())?dt:null;
 }
 function countdown(value,now=Date.now()){
  const date=parse(value);if(!date)return {phase:'unknown',label:'Hora no disponible'};
  const left=date.getTime()-now;
  if(left<=0)return {phase:'passed',label:'La hora programada ya pasó · confirma el estado del partido'};
  const mins=Math.ceil(left/MINUTE);
  if(mins<=1)return {phase:'soon',label:'Comienza en menos de 1 minuto'};
  if(mins<60)return {phase:'soon',label:`Comienza en ${mins} min`};
  const days=Math.floor(mins/1440),hours=Math.floor((mins%1440)/60),remaining=mins%60;
  return {phase:'upcoming',label:'Comienza en '+(days?`${days} d ${hours} h`:`${hours} h${remaining?` ${remaining} min`:''}`)};
 }
 function formatDate(value){
  const date=parse(value);if(!date)return null;
  return new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
 }
 function render(value,context=null,fixture=null){
  const date=parse(value);if(!date)return null;
  const card=document.createElement('section');card.className='fe-match-schedule';
  const title=document.createElement('span');title.className='fe-match-label';title.textContent='🗓 Inicio del partido';
  const dateEl=document.createElement('time');dateEl.className='fe-match-date';dateEl.dateTime=date.toISOString();dateEl.textContent=formatDate(date)+' · Hora de Perú';
  const count=document.createElement('span');count.className='fe-match-countdown';count.dataset.fixtureKickoffMs=String(date.getTime());
  if(fixture?.status)count.dataset.fixtureStatus=fixture.status;
  if(fixture?.status==='finished' && Number.isInteger(Number(fixture?.home_goals)) && Number.isInteger(Number(fixture?.away_goals)))count.dataset.fixtureScore=`${fixture.home_goals}-${fixture.away_goals}`;
  const note=document.createElement('small');note.className='fe-match-disclaimer';
  // Never infer a verified live or final state solely from elapsed time.
  if(fixture?.status){
   const status=document.createElement('span');status.className='fe-match-extra';
   status.textContent=fixture.label||'Estado pendiente de confirmación';
   if(fixture.status==='live'){
    const checked=parse(fixture.checked_at);
    status.dataset.confirmedLiveAt=checked?String(checked.getTime()):'0';
   }
   card.append(status);
  }
  note.textContent='Horario programado o corregido. Si no hay verificación reciente, confirma el estado con la competición.';
  card.append(title,dateEl,count);
  if(context&&typeof context==='object'){
   const parts=[];if(context.round)parts.push('🏆 '+String(context.round).slice(0,90));
   if(context.venue)parts.push('🏟 '+String(context.venue).slice(0,130));
   if(context.city)parts.push('📍 '+String(context.city).slice(0,95));
   for(const part of parts){const label=document.createElement('span');label.className='fe-match-extra';label.textContent=part;card.append(label);}
  }
  card.append(note);refresh(card);return card;
 }
 function refresh(root=document){
  if(!root||typeof root.querySelectorAll!=='function')return;
  for(const live of root.querySelectorAll('[data-confirmed-live-at]')){
   const at=Number(live.dataset.confirmedLiveAt);
   if(!Number.isFinite(at)||at<=0||Date.now()-at>90*60_000)
    live.textContent='Estado sin confirmar · la verificación EN VIVO caducó';
  }
  for(const node of root.querySelectorAll('[data-fixture-kickoff-ms]')){
   const value=Number(node.dataset.fixtureKickoffMs);
   if(!Number.isFinite(value))continue;
   const kind=node.dataset.fixtureStatus;
   if(['finished','cancelled','postponed'].includes(kind)){
    const labels={finished:'🏁 Finalizado',cancelled:'🚫 Cancelado',postponed:'📅 Pospuesto'};
    node.textContent=labels[kind]+(kind==='finished'&&node.dataset.fixtureScore?' · '+node.dataset.fixtureScore:'');
    node.dataset.matchPhase=kind;
    continue;
   }
   if(kind==='live'){
    const live=node.parentElement?.querySelector('[data-confirmed-live-at]');
    const confirmed=Number(live?.dataset.confirmedLiveAt);
    if(Number.isFinite(confirmed)&&confirmed>0&&Date.now()-confirmed<=90*60000){node.textContent='🔴 En vivo · verificado manualmente';node.dataset.matchPhase='live';continue;}
   }
   const state=countdown(new Date(value));node.textContent='⏳ '+state.label;node.dataset.matchPhase=state.phase;
  }
 }
 window.FijasMatchSchedule={render,refresh,countdown,formatDate,parse};
 if(typeof window.setInterval==='function')window.setInterval(()=>refresh(),30000);
})();
