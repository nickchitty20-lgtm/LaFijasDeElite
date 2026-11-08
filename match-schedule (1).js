/* Fijas de Élite v3.3.2 — synchronized football schedule, Peru clock.
 * Countdown is displayed ONLY for recently provider-verified, upcoming games.
 * A static schedule NEVER masquerades as a live fixture status.
 */
(()=>{'use strict';
 const MINUTE=60_000;
 let serverOffset=0,updating=false,refreshTimer=null,lastCheck=0;
 const PRESENT=new Set(['NS']);
 function parse(value){
  if(value instanceof Date)return Number.isFinite(value.getTime())?value:null;
  if(typeof value!=='string')return null;
  const raw=value.trim();if(!raw)return null;
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
  if(context&&typeof context==='object'){
   const id=String(context.prediction_id||'');if(/^\d{1,18}$/.test(id))card.dataset.predictionId=id;
   for(const part of [context.round?'🏆 '+String(context.round).slice(0,90):null,context.venue?'🏟 '+String(context.venue).slice(0,130):null,context.city?'📍 '+String(context.city).slice(0,95):null]){
    if(!part)continue;const extra=document.createElement('span');extra.className='fe-match-extra';extra.textContent=part;card.append(extra);
   }
  }
  card.append(title,dateEl,count,note);
  refresh(card);
  // One coalesced request after card lists finish rendering (never one request per pick).
  if(card.dataset.predictionId&&typeof window.setTimeout==='function'){
   if(refreshTimer!==null&&typeof window.clearTimeout==='function')window.clearTimeout(refreshTimer);
   refreshTimer=window.setTimeout(()=>{refreshTimer=null;refreshLive();},250);
  }
  return card;
 }
 const statusText={NS:'Inicio programado',TBD:'Hora por confirmar',PST:'Partido aplazado',CANC:'Partido cancelado',
  ABD:'Partido suspendido',SUSP:'Partido suspendido',INT:'Partido interrumpido',
  '1H':'Partido en vivo · primer tiempo',HT:'Partido en vivo · descanso','2H':'Partido en vivo · segundo tiempo',
  ET:'Partido en vivo · prórroga',BT:'Partido en vivo · descanso',P:'Partido en vivo',LIVE:'Partido en vivo',
  FT:'Partido finalizado',AET:'Partido finalizado',PEN:'Partido finalizado',AWD:'Resultado administrativo',WO:'Resultado administrativo'};
 function refresh(root=document){
  if(!root||typeof root.querySelectorAll!=='function')return;
  for(const node of root.querySelectorAll('[data-fixture-kickoff-ms]')){
   const value=Number(node.dataset.fixtureKickoffMs);
   const card=node.parentElement||root;
   const verified=card.dataset?.scheduleVerified==='true';
   const state=card.dataset?.liveStatus;
   if(!verified){node.textContent='⏳ Horario sin confirmación reciente';node.dataset.matchPhase='unverified';continue;}
   if(state&&state!=='NS'){
    node.textContent='⚽ '+(statusText[state]||'Estado del partido por confirmar');node.dataset.matchPhase='status';continue;
   }
   if(!Number.isFinite(value)){node.textContent='⏳ Hora por confirmar';node.dataset.matchPhase='unknown';continue;}
   const result=countdown(new Date(value),Date.now()+serverOffset);
   node.textContent='⏳ '+result.label;node.dataset.matchPhase=result.phase;
  }
 }
 async function refreshLive(){
  if(updating||typeof window.fetch!=='function'||typeof document.querySelectorAll!=='function')return;
  const cards=[...document.querySelectorAll('.fe-match-schedule[data-prediction-id]')];
  if(!cards.length)return;
  const ids=[...new Set(cards.map(card=>card.dataset.predictionId))].slice(0,50);
  if(!ids.length)return;
  updating=true;lastCheck=Date.now();
  try{
   const response=await window.fetch('/api/schedules/live?ids='+encodeURIComponent(ids.join(',')),{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('horarios no disponibles');
   const data=await response.json();
   const ms=Date.parse(data.server_time||'');if(Number.isFinite(ms)&&Math.abs(ms-Date.now())<24*3600000)serverOffset=ms-Date.now();
   const byId=new Map((data.schedules||[]).map(s=>[String(s.id),s]));
   for(const card of cards){
    const item=byId.get(card.dataset.predictionId);if(!item)continue;
    card.dataset.scheduleVerified=item.schedule_verified?'true':'false';
    card.dataset.liveStatus=item.schedule_verified?String(item.status||'UNVERIFIED'):'UNVERIFIED';
    const time=card.querySelector('time');const counter=card.querySelector('[data-fixture-kickoff-ms]');
    if(item.kickoff&&parse(item.kickoff)){
     const dt=parse(item.kickoff);
     if(time){time.dateTime=dt.toISOString();time.textContent=formatDate(dt.toISOString())+' · Hora de Perú';}
     if(counter)counter.dataset.fixtureKickoffMs=String(dt.getTime());
    }else if(item.schedule_verified&&item.status==='TBD'){
     if(time){time.textContent='Hora por confirmar · Perú';time.removeAttribute?.('datetime');}
     if(counter)counter.dataset.fixtureKickoffMs='';
    }
    const note=card.querySelector('.fe-match-disclaimer');
    if(note)note.textContent=item.message||(item.schedule_verified?'Último horario verificado.':'Sin verificación reciente del partido.');
    refresh(card);
   }
  }catch{
   for(const card of cards){card.dataset.scheduleVerified='false';const note=card.querySelector('.fe-match-disclaimer');if(note)note.textContent='No se pudo comprobar el calendario; el horario mostrado es orientativo.';refresh(card);}
  }finally{updating=false;}
 }
 window.FijasMatchSchedule={render,refresh,refreshLive,countdown,formatDate,parse};
 if(typeof window.setInterval==='function')window.setInterval(()=>{
  refresh();if(Date.now()-lastCheck>=MINUTE)refreshLive();
 },30000);
})();
