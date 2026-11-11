/** Selecciones absolutas: fuentes CC0 con rutas explícitas, sin URLs arbitrarias.
 * Los archivos internacionales suelen carecer de hora: se usan como historial,
 * nunca como prueba de un inicio preciso ni de que un partido sigue en NS.
 */
export const NATIONAL_COMPETITIONS=Object.freeze([
 {code:'int.worldcup',name:'Copa Mundial FIFA',years:[2022,2026],source:'worldcup',zone:'UTC'},
 {code:'int.euro',name:'Eurocopa',years:[2024,2028],source:'euro',zone:'Europe/London'},
 {code:'int.friendly',name:'Amistosos internacionales',years:[2024,2025,2026],source:'internationals',slug:'friendly'},
 {code:'int.wcqual',name:'Eliminatorias mundialistas',years:[2024,2025,2026],source:'internationals',slug:'fifa_world_cup_qualification'},
 {code:'int.unl',name:'UEFA Nations League',years:[2024,2025,2026],source:'internationals',slug:'uefa_nations_league'},
 {code:'int.concnl',name:'CONCACAF Nations League',years:[2024,2025],source:'internationals',slug:'concacaf_nations_league'},
 {code:'int.copa',name:'Copa América',years:[2024],source:'internationals',slug:'copa_america'},
 {code:'int.afcon',name:'Copa Africana de Naciones',years:[2024,2025,2026],source:'internationals',slug:'african_cup_of_nations'},
 {code:'int.asia',name:'Copa Asiática',years:[2024],source:'internationals',slug:'afc_asian_cup'},
 {code:'int.goldcup',name:'Copa Oro CONCACAF',years:[2025],source:'internationals',slug:'gold_cup'},
 {code:'int.euroqual',name:'Clasificatorias Eurocopa',years:[2024],source:'internationals',slug:'uefa_euro_qualification'}
]);
export const isNationalCompetition=code=>String(code||'').startsWith('int.');

export function nationalDatasets(date=new Date()){
 const year=date.getUTCFullYear();
 return NATIONAL_COMPETITIONS.flatMap(comp=>comp.years.filter(y=>y<=year+2&&y>=year-3).map(y=>{
  const path=comp.source==='worldcup'?`${y}/worldcup.json`:comp.source==='euro'?`${y}/euro.json`:`${comp.slug}_${y}_${comp.slug}.json`;
  return {...comp,season:String(y),path,kind:'national',source:comp.source,
   // The international archive is date-only; a time value from there is
   // deliberately NOT enough without an explicit offset.
   requireOffset:comp.source==='internationals'};
 }));
}
// Canonical spelling across tournaments, historical results, and verified fixture feeds.
// No fuzzy merging: distinct national teams must never be accidentally combined.
const ALIASES=new Map([
 ['usa','United States'],['united states of america','United States'],
 ['korea republic','South Korea'],['republic of korea','South Korea'],
 ['cote divoire','Ivory Coast'],['cote d ivoire','Ivory Coast'],
 ['czechia','Czech Republic'],['turkiye','Turkey'],
 ['bosnia & herzegovina','Bosnia and Herzegovina'],
 ['iran islamic republic','Iran'],['ir iran','Iran'],
 ['congo dr','DR Congo'],['democratic republic of congo','DR Congo']
]);
export function canonicalNationalTeam(value){
 const clean=String(value??'').normalize('NFC').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
 const key=clean.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9& ]/g,' ').replace(/\s+/g,' ').trim();
 return ALIASES.get(key)||clean;
}
/** Convert "13:00 UTC-6" and "15:30 UTC+05:30" without guessing host timezones. */
export function offsetKickoff(date,time){
 const match=String(time||'').replace(/[−–]/g,'-').match(/^([01]\d|2[0-3]):([0-5]\d)\s*UTC([+-])(\d{1,2})(?::?([0-5]\d))?$/i);
 if(!match||!/\d{4}-\d{2}-\d{2}/.test(String(date)))return null;
 const hh=Number(match[1]),mm=Number(match[2]),offsetHours=Number(match[4]),offsetMins=Number(match[5]||0);
 if(offsetHours>14||offsetHours===14&&offsetMins!==0)return null;
 const nominal=Date.parse(`${date}T${match[1]}:${match[2]}:00Z`);
 if(!Number.isFinite(nominal)||new Date(nominal).toISOString().slice(0,10)!==date)return null;
 const sign=match[3]==='+'?1:-1;
 return new Date(nominal-sign*(offsetHours*60+offsetMins)*60000);
}
// API-Football numeric league IDs verified from its own published examples and catalog.
// Nonmatching IDs are ignored, never treated as national teams based on names alone.
export const NATIONAL_LIVE_LEAGUES=Object.freeze({
 1:'int.worldcup',4:'int.euro',5:'int.unl',6:'int.afcon',7:'int.asia',
 9:'int.copa',10:'int.friendly',22:'int.goldcup',32:'int.wcqual',34:'int.wcqual'
});
export function nationalCompetitionByCode(code){return NATIONAL_COMPETITIONS.find(x=>x.code===code)||null;}
