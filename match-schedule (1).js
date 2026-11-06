/** Match time in API-Football / DB is UTC; show exact Lima time and a snapshot for Telegram. */
const MINUTE=60_000;
export function parseMatchDate(value){
 if(value instanceof Date)return Number.isFinite(value.getTime())?new Date(value.getTime()):null;
 if(typeof value!=='string')return null;
 const raw=value.trim();
 if(!raw)return null;
 // MySQL DATETIME (UTC) and datetime-local (form explicitly labeled UTC).
 const normalized=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)
  ?raw.replace(' ','T')+'Z':raw;
 const date=new Date(normalized);
 return Number.isFinite(date.getTime())?date:null;
}
export function matchCountdown(value,now=Date.now()){
 const date=parseMatchDate(value);
 if(!date)return {phase:'unknown',label:'Hora de inicio no disponible'};
 const remaining=date.getTime()-Number(now);
 if(remaining<=0)return {phase:'passed',label:'La hora programada ya pasó · confirma el estado del partido'};
 const minutes=Math.ceil(remaining/MINUTE);
 if(minutes<=1)return {phase:'soon',label:'Comienza en menos de 1 minuto'};
 if(minutes<60)return {phase:'soon',label:`Comienza en ${minutes} min`};
 const days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;
 const label=days?`${days} d ${hours} h`:`${hours} h${mins?` ${mins} min`:''}`;
 return {phase:'upcoming',label:`Comienza en ${label}`};
}
export function formatPeruKickoff(value){
 const date=parseMatchDate(value);
 if(!date)return null;
 return new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
export function telegramMatchSchedule(value,now=Date.now()){
 const start=formatPeruKickoff(value);
 if(!start)return '\n📅 Horario: no disponible';
 return `\n🗓 Inicio programado: ${start} (hora de Perú)\n⏳ ${matchCountdown(value,now).label} (al publicar)`;
}
