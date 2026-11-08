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
 function render(value,context=null){
  const date=parse(value);if(!date)return null;
  const card=document.createElement('section');card.className='fe-match-schedule';
  const title=document.createElement('span');title.className='fe-match-label';title.textContent='🗓 Inicio del partido';
  const dateEl=document.createElement('time');dateEl.className='fe-match-date';dateEl.dateTime=date.toISOString();dateEl.textContent=formatDate(date)+' · Hora de Perú';
  const count=document.createElement('span');count.className='fe-match-countdown';count.dataset.fixtureKickoffMs=String(date.getTime());
  const note=document.createElement('small');note.className='fe-match-disclaimer';note.textContent='Horario programado; el estado en vivo debe verificarse con la competición.';
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
  for(const node of root.querySelectorAll('[data-fixture-kickoff-ms]')){
   const value=Number(node.dataset.fixtureKickoffMs);
   if(!Number.isFinite(value))continue;
   const state=countdown(new Date(value));node.textContent='⏳ '+state.label;node.dataset.matchPhase=state.phase;
  }
 }
 window.FijasMatchSchedule={render,refresh,countdown,formatDate,parse};
 if(typeof window.setInterval==='function')window.setInterval(()=>refresh(),30000);
})();
