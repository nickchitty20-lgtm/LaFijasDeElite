/**
 * Fijas de Élite — evidencia deportiva suplementaria.
 * Parseamos datos reales de API-Football; los fallos de endpoints opcionales
 * jamás fabrican ausencias, jugadores, cifras ni probabilidades.
 */
const sanitize=(v,max=100)=>String(v??'').replace(/[\r\n\t<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const numeric=(v,min=0,max=999)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
const shortPercent=(v)=>{const n=numeric(typeof v==='string'?v.replace('%',''):v,0,100);return n===null?null:+n.toFixed(1)};
const statusValues=['available','no_records','unavailable','pending','partial'];
const statusSafe=s=>statusValues.includes(s)?s:'unavailable';
export function parseInjuries(data,homeId,awayId,available=true){
 if(!available||!Array.isArray(data))return {status:'unavailable',reported:0,home:[],away:[]};
 const home=[],away=[];const known=new Set();
 for(const item of data){
  const teamId=numeric(item?.team?.id,1,999999999), name=sanitize(item?.player?.name,70);
  const bucket=teamId===Number(homeId)?home:teamId===Number(awayId)?away:null;
  if(!bucket||!name)continue;
  const key=`${teamId}:${item?.player?.id||name}`;if(known.has(key))continue;known.add(key);
  const type=sanitize(item?.player?.type,48),reason=sanitize(item?.player?.reason,90);
  bucket.push({name,type:type||'Estado no especificado',reason:reason||'Motivo no informado'});
 }
 const capped=arr=>arr.slice(0,8);
 return {status:home.length+away.length?'available':'no_records',reported:home.length+away.length,home:capped(home),away:capped(away)};
}
export function parseLineups(data,homeId,awayId,{requested=false,expectedSoon=false}={}){
 const empty={status:requested?'no_records':expectedSoon?'pending':'unavailable',home:null,away:null};
 if(!Array.isArray(data))return {...empty,status:'unavailable'};
 if(!requested)return empty;
 const byTeam=(id)=>{
  const row=data.find(x=>Number(x?.team?.id)===Number(id));
  if(!row)return null;
  const xi=(Array.isArray(row.startXI)?row.startXI:[]).map(e=>sanitize(e?.player?.name,65)).filter(Boolean).slice(0,11);
  if(!xi.length)return null;
  return {formation:sanitize(row.formation,22)||null,coach:sanitize(row.coach?.name,70)||null,starting:xi,reported_players:xi.length};
 };
 const home=byTeam(homeId),away=byTeam(awayId);
 return {status:home&&away&&home.reported_players===11&&away.reported_players===11?'available':home||away?'partial':'no_records',home,away};
}
export function parseSeasonStats(raw){
 if(!raw||typeof raw!=='object'||!raw.fixtures)return null;
 const f=raw.fixtures,g=raw.goals||{};
 const played=numeric(f.played?.total,0,100), wins=numeric(f.wins?.total,0,100),draws=numeric(f.draws?.total,0,100),losses=numeric(f.loses?.total,0,100);
 if(played==null)return null;
 return {played,wins,draws,losses,
  avg_scored:numeric(g.for?.average?.total,0,15),avg_conceded:numeric(g.against?.average?.total,0,15),
  form:sanitize(raw.form,28)||null};
}
export function predictionForm(prediction){
 function team(t){
  const last=t?.last_5||{};
  return {form_pct:shortPercent(last.form),attack_pct:shortPercent(last.att),defence_pct:shortPercent(last.def),
   goals_scored:numeric(last.goals?.for?.total,0,80),goals_allowed:numeric(last.goals?.against?.total,0,80)};
 }
 return {home:team(prediction?.teams?.home),away:team(prediction?.teams?.away)};
}
export function createAdvancedSnapshot({fixture,prediction=null,injuries=null,lineups=null,seasonHome=null,seasonAway=null,
 injuriesRequested=false,lineupsRequested=false,statsRequested=false,now=new Date()}={}){
 const homeId=Number(fixture?.teams?.home?.id),awayId=Number(fixture?.teams?.away?.id);
 const kickoffMs=Date.parse(fixture?.fixture?.date||'');const minutesToStart=Number.isFinite(kickoffMs)?Math.round((kickoffMs-new Date(now).getTime())/60000):null;
 const absences=parseInjuries(injuries,homeId,awayId,injuriesRequested&&Array.isArray(injuries));
 const starting=parseLineups(lineups,homeId,awayId,{requested:lineupsRequested&&Array.isArray(lineups),expectedSoon:minutesToStart!==null&&minutesToStart>0&&minutesToStart<=100});
 const form=predictionForm(prediction);
 const season={status:statsRequested?'partial':'unavailable',home:parseSeasonStats(seasonHome),away:parseSeasonStats(seasonAway)};
 if(statsRequested&&season.home&&season.away)season.status='available';
 const cautions=[];
 if(absences.status==='available')cautions.push('El proveedor registra bajas o dudas; confirma si son titulares habituales y su impacto antes del partido.');
 if(absences.status==='unavailable')cautions.push('Lesiones y suspensiones sin datos verificables: no asumir que todas las plantillas están completas.');
 if(starting.status!=='available')cautions.push('Sin dos onces completos reportados: alineaciones pendientes de confirmación.');
 if(season.status==='unavailable')cautions.push('Estadísticas de temporada no disponibles o fuera del presupuesto de consultas.');
 return {version:1,collected_at:new Date(now).toISOString(),status:{injuries:absences.status,lineups:starting.status,season:season.status},
  injuries:absences,lineups:starting,form,season,risks:cautions.slice(0,4),
  source:'API-Football /predictions, /injuries, /fixtures/lineups, /teams/statistics; campos sujetos a cobertura'};
}
// A bound on supplementary HTTP calls. The API Free allowance is only 100/day.
export async function fetchAdvancedSnapshot({fixture,prediction=null,api,now=new Date(),fetchSeason=true,fetchLineups=true}={}){
 if(typeof api!=='function')throw Error('Se requiere cliente API');
 const kickoff=Date.parse(fixture?.fixture?.date||''), minutes=Number.isFinite(kickoff)?(kickoff-new Date(now).getTime())/60000:null;
 const homeId=Number(fixture?.teams?.home?.id),awayId=Number(fixture?.teams?.away?.id);
 let injuries=null,lineups=null,seasonHome=null,seasonAway=null;
 let injuriesRequested=false,lineupsRequested=false,statsRequested=false;const errors=[];
 async function read(endpoint,params){try{return await api(endpoint,params);}catch(error){errors.push(`${endpoint}: ${sanitize(error?.message||'sin datos',95)}`);return null;}}
 injuries=await read('injuries',{fixture:fixture.fixture.id});injuriesRequested=Array.isArray(injuries);
 // API-Football lineups usually show 20–40 minutes before start; avoid calls hours too early.
 if(fetchLineups&&minutes!==null&&minutes>=10&&minutes<=75){
  lineups=await read('fixtures/lineups',{fixture:fixture.fixture.id});lineupsRequested=Array.isArray(lineups);
 }
 const leagueId=numeric(fixture?.league?.id,1,999999999),season=numeric(fixture?.league?.season,2000,2100);
 if(fetchSeason&&leagueId&&season&&homeId&&awayId){
  const params={league:leagueId,season};
  const h=await read('teams/statistics',{...params,team:homeId});
  const a=await read('teams/statistics',{...params,team:awayId});
  seasonHome=h&&typeof h==='object'&&!Array.isArray(h)?h:null;
  seasonAway=a&&typeof a==='object'&&!Array.isArray(a)?a:null;
  statsRequested=!!(seasonHome||seasonAway);
 }
 const report=createAdvancedSnapshot({fixture,prediction,injuries,lineups,seasonHome,seasonAway,
  injuriesRequested,lineupsRequested,statsRequested,now});
 return {...report,fetch_warnings:errors.slice(0,5)};
}
export function advancedAnalysisLines(a){
 if(!a)return ['Análisis avanzado: sin información suplementaria disponible.'];
 const result=['ESTUDIO AVANZADO (datos observados, NO porcentaje de acierto ni pronóstico garantizado):'];
 const tag={available:'Datos disponibles',no_records:'Sin registros informados',unavailable:'No disponible',pending:'Pendiente',partial:'Información parcial'};
 const abs=a.injuries||{};result.push(`Bajas/lesiones: ${tag[statusSafe(abs.status)]}. ${abs.reported||0} incidencias notificadas; ausencia de reportes NO prueba que no haya lesionados.`);
 for(const [side,label] of [['home','Local'],['away','Visitante']]){
  const players=(abs[side]||[]).slice(0,5);
  if(players.length)result.push(`${label}: ${players.map(p=>`${sanitize(p.name,70)} (${sanitize(p.type,45)}; ${sanitize(p.reason,90)})`).join('; ')}.`);
 }
 const lineups=a.lineups||{};
 result.push(`Alineaciones: ${tag[statusSafe(lineups.status)]}. Los onces suelen aparecer cerca del inicio y requieren verificación.`);
 for(const [side,label] of [['home','Local'],['away','Visitante']]){
  const row=lineups[side];if(row?.starting?.length)result.push(`${label}: ${row.formation?`formación ${sanitize(row.formation,20)}; `:''}${row.starting.map(x=>sanitize(x,65)).slice(0,11).join(', ')}.`);
 }
 for(const [side,label] of [['home','Local'],['away','Visitante']]){
  const recent=a.form?.[side]||{},season=a.season?.[side];
  const parts=[];
  if(recent.form_pct!=null)parts.push(`forma últimos 5 (indicador del proveedor) ${recent.form_pct}%`);
  if(recent.goals_scored!=null&&recent.goals_allowed!=null)parts.push(`últimos 5: ${recent.goals_scored} a favor, ${recent.goals_allowed} en contra`);
  if(season?.played!=null)parts.push(`temporada: ${season.played} partidos, ${season.wins??'?'} victorias, ${season.draws??'?'} empates, ${season.losses??'?'} derrotas${season.avg_scored!=null?`, ${season.avg_scored} goles a favor por partido`:''}${season.avg_conceded!=null?`, ${season.avg_conceded} en contra por partido`:''}`);
  result.push(`Forma ${label}: ${parts.length?parts.join('; '):'Sin datos suficientes'}.`);
 }
 result.push('Interpretación: las estadísticas históricas, ausencias y alineaciones pueden cambiar la evaluación, pero no se convierten automáticamente en porcentajes de victoria ni garantizan goles.');
 return result;
}
export const advancedReportForPublic=(a)=>{
 if(!a||typeof a!=='object')return null;
 const safeArray=(arr,n=8)=>Array.isArray(arr)?arr.slice(0,n).map(x=>sanitize(x,70)).filter(Boolean):[];
 const safeAbs=arr=>Array.isArray(arr)?arr.slice(0,8).map(x=>({name:sanitize(x.name,70),type:sanitize(x.type,48),reason:sanitize(x.reason,90)})).filter(x=>x.name):[];
 const lineup=(v)=>v&&typeof v==='object'&&Array.isArray(v.starting)?{formation:sanitize(v.formation,22)||null,coach:sanitize(v.coach,70)||null,starting:safeArray(v.starting,11)}:null;
 const form=(v)=>({form_pct:shortPercent(v?.form_pct),goals_scored:numeric(v?.goals_scored,0,80),goals_allowed:numeric(v?.goals_allowed,0,80)});
 const season=(v)=>v?{played:numeric(v.played,0,100),wins:numeric(v.wins,0,100),draws:numeric(v.draws,0,100),losses:numeric(v.losses,0,100),avg_scored:numeric(v.avg_scored,0,15),avg_conceded:numeric(v.avg_conceded,0,15)}:null;
 return {collected_at:/^\d{4}-/.test(a.collected_at||'')?a.collected_at:null,
  status:{injuries:statusSafe(a.status?.injuries),lineups:statusSafe(a.status?.lineups),season:statusSafe(a.status?.season)},
  injuries:{reported:numeric(a.injuries?.reported,0,200)||0,home:safeAbs(a.injuries?.home),away:safeAbs(a.injuries?.away)},
  lineups:{home:lineup(a.lineups?.home),away:lineup(a.lineups?.away)},
  form:{home:form(a.form?.home),away:form(a.form?.away)},season:{home:season(a.season?.home),away:season(a.season?.away)},
  risks:safeArray(a.risks,4),source:'API-Football /predictions, /injuries, /fixtures/lineups, /teams/statistics'};
};
