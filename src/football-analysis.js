import {goalProjection,goalAnalysisLines} from './football-goals.js';
/**
 * Evidence-first football analysis. No LLM-generated facts and no fabricated odds.
 * API-Football: https://www.api-football.com/documentation_v3
 * Percentages below are uncalibrated estimates FROM THE DATA PROVIDER, never
 * assurances of real-world predictive accuracy.
 */
export const FOOTBALL_PROVIDER='api-football';
export const DEFAULT_MIN_HOURS=1;
export const DEFAULT_MAX_HOURS=6;

export function parseProviderPercent(value){
 if(value==null)return null;
 const n=Number(String(value).replace('%','').trim());
 return Number.isFinite(n)&&n>=0&&n<=100?n:null;
}
export function utcDate(date){return new Date(date).toISOString().slice(0,10);}
export function fixtureKickoff(fixture){
 const raw=fixture?.fixture?.date;
 const ms=Date.parse(raw||'');
 return Number.isFinite(ms)?new Date(ms):null;
}
export function upcomingFixtures(fixtures,now=new Date(),minHours=DEFAULT_MIN_HOURS,maxHours=DEFAULT_MAX_HOURS){
 const start=now.getTime()+minHours*3600000;
 const end=now.getTime()+maxHours*3600000;
 return (fixtures||[]).filter(f=>{
  const kickoff=fixtureKickoff(f);
  return kickoff && kickoff.getTime()>=start&&kickoff.getTime()<=end
   &&['NS','TBD'].includes(f.fixture?.status?.short)
   &&Number.isSafeInteger(Number(f.fixture?.id))
   &&Number.isSafeInteger(Number(f.teams?.home?.id))
   &&Number.isSafeInteger(Number(f.teams?.away?.id));
 }).sort((a,b)=>fixtureKickoff(a)-fixtureKickoff(b));
}

export function predictedResult(p){
 const percent=p?.predictions?.percent;
 const values=[['home',parseProviderPercent(percent?.home)],['draw',parseProviderPercent(percent?.draw)],['away',parseProviderPercent(percent?.away)]];
 if(values.some(x=>x[1]===null))return null;
 const sorted=[...values].sort((a,b)=>b[1]-a[1]);
 if(sorted[0][1]>98.5)return null; // reject implausible near-certainty rather than advertising it
 if(Math.abs(values.reduce((s,x)=>s+x[1],0)-100)>4)return null;
 return {outcome:sorted[0][0],confidence:sorted[0][1],margin:sorted[0][1]-sorted[1][1],percent:Object.fromEntries(values)};
}
const clean=(s,max=180)=>String(s??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const fmt=p=>p==null?'no disponible':`${p.toFixed(1)}%`;
const havePct=p=>parseProviderPercent(p);
const pickForm=t=>{
 const val=t?.last_5?.form;
 return havePct(val);
};
const comparisonValue=(obj,path)=>path.split('.').reduce((cur,key)=>cur?.[key],obj);
// The API-Football Free plan rejects the `last` query parameter.
// Request head-to-head fixtures using only `h2h`, then select the latest
// completed matches locally. Never assume the API response is sorted.
export function headToHeadParams(homeId,awayId){
 const home=Number(homeId),away=Number(awayId);
 if(!Number.isSafeInteger(home)||home<1||!Number.isSafeInteger(away)||away<1)throw Error('IDs de equipos inválidos');
 return {h2h:`${home}-${away}`};
}
export function latestCompletedHeadToHead(h2h,limit=5){
 return (Array.isArray(h2h)?h2h:[])
  .filter(x=>['FT','AET','PEN'].includes(x?.fixture?.status?.short)&&fixtureKickoff(x))
  .sort((a,b)=>fixtureKickoff(b).getTime()-fixtureKickoff(a).getTime())
  .slice(0,Math.max(0,Math.min(20,Math.floor(Number(limit)||0))));
}
export function createAssessment(fixture,predictionResponse,{h2h=[],injuries=[]}={}){
 const fixtureId=Number(fixture?.fixture?.id);
 const kickoff=fixtureKickoff(fixture);
 const home=clean(fixture?.teams?.home?.name,90),away=clean(fixture?.teams?.away?.name,90);
 const league=clean(fixture?.league?.name,110);
 const pick=predictedResult(predictionResponse);
 if(!fixtureId||!kickoff||!home||!away||!league||!pick)return null;
 // Only provide a model-backed 1X2 choice, never invent a market or an odds quote.
 const homeForm=pickForm(predictionResponse?.teams?.home);
 const awayForm=pickForm(predictionResponse?.teams?.away);
 const comparison=predictionResponse?.comparison||{};
 const attackH=havePct(comparisonValue(comparison,'att.home'));
 const attackA=havePct(comparisonValue(comparison,'att.away'));
 const defenceH=havePct(comparisonValue(comparison,'def.home'));
 const defenceA=havePct(comparisonValue(comparison,'def.away'));
 const h2hRows=latestCompletedHeadToHead(h2h.length?h2h:predictionResponse?.h2h);
 let evidence=0;
 if(homeForm!==null&&awayForm!==null)evidence++;
 if(attackH!==null&&attackA!==null)evidence++;
 if(defenceH!==null&&defenceA!==null)evidence++;
 if(h2hRows.length>=2)evidence++;
 // These are UNCAlIBRATED provider probabilities, not measured hit rates.
 // Free = modest statistical lead of 40-50% (1X2), with at least two evidence
 // families and a >=12-point lead. Weak data is discarded, not sold as a "fija".
 // VIP remains highly selective; neither tier guarantees a win.
 let visibility=null;
 if(pick.confidence>=72&&pick.margin>=18&&evidence>=2)visibility='vip';
 else if(pick.confidence>=40&&pick.confidence<=50&&pick.margin>=12&&evidence>=2)visibility='free';
 if(!visibility)return null;
 const selection=pick.outcome==='home'?home:pick.outcome==='away'?away:'Empate';
 const lines=[
  `Fuente: API-Football. Partido: ${home} vs ${away}; ${league}, ${kickoff.toISOString()}.`,
  `Mercado analizado: resultado final (1X2). Selección: ${selection}.`,
  `Probabilidades ESTIMADAS por el proveedor (no calibradas ni garantizadas): local ${fmt(pick.percent.home)}, empate ${fmt(pick.percent.draw)}, visitante ${fmt(pick.percent.away)}. Diferencia con la segunda opción: ${fmt(pick.margin)}.`,
 ];
 if(homeForm!==null&&awayForm!==null)lines.push(`Forma reciente reportada por el proveedor (últimos 5): ${home} ${fmt(homeForm)} frente a ${away} ${fmt(awayForm)}.`);
 if(attackH!==null&&attackA!==null)lines.push(`Comparación de ataque (indicador del proveedor): local ${fmt(attackH)}, visitante ${fmt(attackA)}.`);
 if(defenceH!==null&&defenceA!==null)lines.push(`Comparación defensiva (indicador del proveedor): local ${fmt(defenceH)}, visitante ${fmt(defenceA)}.`);
 if(h2hRows.length>=2)lines.push(`Enfrentamientos previos consultados: ${h2hRows.length} partidos finalizados; estos antecedentes no determinan el resultado futuro.`);
 if(visibility==='free')lines.push('PRONÓSTICO GRATUITO DE RIESGO ALTO: estimación del proveedor entre 40 y 50%, NO es una tasa de aciertos, ni garantiza rentabilidad.');
 // Secondary goal notes are not additional betting picks; the official
 // market remains 1X2 and the source goal lines are not exact scores.
 const goals=goalProjection(fixture,predictionResponse,h2hRows);
 lines.push(...goalAnalysisLines(goals));
 const injuryCount=Array.isArray(injuries)?injuries.length:null;
 if(injuryCount!==null&&injuryCount>0)lines.push(`El proveedor registra ${injuryCount} incidencias de bajas/lesiones asociadas al partido; confirma su vigencia antes de apostar.`);
 else lines.push('Lesiones y alineaciones: no se consideran confirmadas con la información disponible; revisar antes del inicio.');
 lines.push('Riesgos: cambios de última hora en alineaciones, rotación, tarjetas, arbitraje y varianza deportiva. Ningún pronóstico es una certeza.');
 lines.push('No se ha estimado rentabilidad ni se presupone una cuota de mercado. La confianza del proveedor no equivale a una tasa de acierto verificada.');
 return {provider:FOOTBALL_PROVIDER,fixture_id:fixtureId,home,away,league,kickoff: kickOffString(kickoff),
  selection,market:'Resultado final 1X2',visibility,confidence:pick.confidence,evidence_count:evidence,
  analysis:lines.join('\n\n').slice(0,7900),odds:null,
  raw_evidence:{percent:pick.percent,margin:pick.margin,evidence_count:evidence,home_form:homeForm,away_form:awayForm,
   attack:{home:attackH,away:attackA},defence:{home:defenceH,away:defenceA},h2h_count:h2hRows.length,
   injuries_reported:injuryCount,goals,match_context:{country:clean(fixture?.league?.country,65),round:clean(fixture?.league?.round,90),venue:clean(fixture?.fixture?.venue?.name,130),city:clean(fixture?.fixture?.venue?.city,95)},source:'API-Football /predictions, /fixtures/headtohead, /injuries'}
 };
}
export function kickOffString(date){return date.toISOString().slice(0,19).replace('T',' ');}

export function extractMatchWinnerOdds(response,selection,home,away){
 const fixtures=Array.isArray(response)?response:[];
 for(const f of fixtures)for(const bookmaker of f?.bookmakers||[])for(const bet of bookmaker?.bets||[]){
  if(!['Match Winner','1X2','Full Time Result'].includes(String(bet.name||'')))continue;
  for(const item of bet.values||[]){
   const v=String(item.value||'').toLowerCase().trim();
   const desired=selection===home?['home','1',home.toLowerCase()]:selection===away?['away','2',away.toLowerCase()]:['draw','x','empate'];
   if(!desired.includes(v))continue;
   const n=Number(item.odd);
   if(Number.isFinite(n)&&n>=1.01&&n<1000)return {odds:Number(n.toFixed(2)),bookmaker:clean(bookmaker.name,100)};
  }
 }
 return null;
}

export async function footballApi(endpoint,params={},env=process.env){
 if(!env.FOOTBALL_API_KEY)throw Error('FOOTBALL_API_KEY sin configurar');
 const url=new URL(`https://v3.football.api-sports.io/${endpoint}`);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 const response=await fetch(url,{headers:{'x-apisports-key':env.FOOTBALL_API_KEY},signal:AbortSignal.timeout(13000)});
 if(!response.ok)throw Error(`API-Football HTTP ${response.status}`);
 const json=await response.json();
 if(json?.errors && (Array.isArray(json.errors)?json.errors.length:Object.keys(json.errors).length))throw Error('API-Football: '+JSON.stringify(json.errors).slice(0,180));
 return json.response||[];
}
