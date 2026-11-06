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
  source:'API-Football; estadísticas H2H solo cuando hay datos',
  disclaimer:'Estimaciones orientativas. El historial es una muestra pequeña; no hay porcentajes garantizados ni cuota confirmada para mercados de goles.'
 };
 if(!summary.estimated_score)summary.estimated_margin=null;
 return summary;
}
