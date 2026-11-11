import {advancedReportForPublic} from './football-advanced.js';
/** Extract vetted structured information for published model-backed forecasts.
 * A preview/candidate is not a bet, and unavailable markets are never fabricated. */
const goodLine=value=>value&&typeof value==='object'&&
 ['over','under'].includes(value.direction)&&Number.isFinite(Number(value.threshold))&&
 Number(value.threshold)>=0.5&&Number(value.threshold)<=5.5&&
 typeof value.market_label==='string' ? {direction:value.direction,threshold:Number(value.threshold),market_label:value.market_label.slice(0,65),label:String(value.label||'').slice(0,65)}:null;
const numeric=(n,min,max)=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=min&&Number(n)<=max?Number(n):null;
export function publishedFootballDetails(raw){
 let data=raw;
 try{if(Buffer.isBuffer(data))data=data.toString('utf8');if(typeof data==='string')data=JSON.parse(data);}catch{return null;}
 if(!data||typeof data!=='object'||!data.goals||typeof data.goals!=='object')return null;
 if(['nforce-poisson-1.1','nforce-poisson-1.2','nforce-poisson-1.3','nforce-poisson-1.4','nforce-poisson-1.5','nforce-poisson-1.6','nforce-poisson-1.7','nforce-poisson-1.8','nforce-poisson-1.9'].includes(data.model?.model)){
  const m=data.model;
  const probability=numeric(m.confidence,0,100),p=m.probabilities||{},t=m.totals||{};
  return {home_line:{market_label:`Goles esperados ${m.lambda?.home??'—'}`,direction:'over',threshold:0.5},
   away_line:{market_label:`Goles esperados ${m.lambda?.away??'—'}`,direction:'over',threshold:0.5},
   total_line:{market_label:`Más de 2.5: ${numeric(t.over25,0,100)??'—'}% (modelo)`,direction:'over',threshold:2.5},
   model_goals:{over15:numeric(t.over15,0,100),over25:numeric(t.over25,0,100),over35:numeric(t.over35,0,100),btts:numeric(t.btts,0,100)},
   historical:null,estimated_score:/^\d-\d$/.test(m.score||'')?m.score:null,
   estimated_margin:data.goals?.illustrative_margin??null,
   provider_1x2:{home:numeric(p.home,0,100),draw:numeric(p.draw,0,100),away:numeric(p.away,0,100)},
   probability_source:'Modelo N-FORCE propio (sin calibración verificada)',
   match_context:Object.fromEntries(['country','round','venue','city'].map(k=>[k,typeof data.match_context?.[k]==='string'?data.match_context[k].slice(0,130):'']).filter(x=>x[1])),
   advanced:null,source:'Datos históricos públicos de terceros y modelo estadístico N-FORCE',
   disclaimer:'Probabilidades Poisson NO calibradas; sin cuotas verificadas, lesiones ni alineaciones. Confirma horario y resultados con una fuente oficial.'};
 }
 const g=data.goals;
 const history=g.historical&&typeof g.historical==='object'?g.historical:null;
 const played=numeric(history?.games,3,20);
 const summary={
  home_line:goodLine(g.home_line),away_line:goodLine(g.away_line),total_line:goodLine(g.total_line),
  historical:played===null?null:{games:played,home_average:numeric(history.average_home_goals,0,15),
   away_average:numeric(history.average_away_goals,0,15),total_average:numeric(history.average_total_goals,0,30),
   both_scored:numeric(history.both_scored,0,played)},
  estimated_score:typeof g.illustrative_score==='string'&&/^\d-\d$/.test(g.illustrative_score)&&played!==null?g.illustrative_score:null,
  estimated_margin:numeric(g.illustrative_margin,0,6),
  provider_1x2:{home:numeric(data.percent?.home,0,100),draw:numeric(data.percent?.draw,0,100),away:numeric(data.percent?.away,0,100)},
  match_context:Object.fromEntries(['country','round','venue','city'].map(k=>[k,typeof data.match_context?.[k]==='string'?data.match_context[k].slice(0,130):'']).filter(x=>x[1])),
  advanced:advancedReportForPublic(data.advanced),
  source:'Datos deportivos de terceros; estadísticas H2H solo cuando hay datos',
  disclaimer:'Estimaciones orientativas. El historial es una muestra pequeña; no hay porcentajes garantizados ni cuota confirmada para mercados de goles.'
 };
 if(!summary.estimated_score)summary.estimated_margin=null;
 return summary;
}
