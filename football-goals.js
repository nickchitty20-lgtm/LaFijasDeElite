/**
 * Goal-oriented notes for API-Football predictions.
 * The provider returns GOAL LINES (e.g. -2.5), not an exact score or
 * validated goal probabilities. Never promote these into certainty.
 * Optional score scenario is computed from >=3 completed H2H fixtures
 * and is clearly identified as an exploratory, uncalibrated illustration.
 */
export function parseGoalLine(value) {
 if (typeof value !== 'string' && typeof value !== 'number') return null;
 const text = String(value).trim().replace(/\s+/g, ' ');
 const match = /^(?:(over|under)\s*|([+\-]))(\d+\.5)$/i.exec(text);
 if (!match) return null;
 const threshold = Number(match[3]);
 if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 5.5) return null;
 const direction = match[1] ? match[1].toLowerCase() : match[2] === '+' ? 'over' : 'under';
 const bound = Math.floor(threshold);
 return {
  direction, threshold,
  min: direction === 'over' ? bound + 1 : 0,
  max: direction === 'under' ? bound : null,
  label: direction === 'over' ? `Al menos ${bound + 1} goles` : `Hasta ${bound} goles`,
  market_label: `${direction === 'over' ? 'Más' : 'Menos'} de ${threshold} goles`
 };
}

const cleanCompleted = (h2h, homeId, awayId) => {
 const wanted = new Set([homeId, awayId]);
 return (Array.isArray(h2h) ? h2h : [])
  .filter(game => game?.fixture?.status?.short === 'FT' &&
   wanted.has(Number(game?.teams?.home?.id)) && wanted.has(Number(game?.teams?.away?.id)) &&
   Number(game?.teams?.home?.id) !== Number(game?.teams?.away?.id) &&
   Number.isInteger(game?.goals?.home) && game.goals.home >= 0 && game.goals.home <= 15 &&
   Number.isInteger(game?.goals?.away) && game.goals.away >= 0 && game.goals.away <= 15 &&
   Number.isFinite(Date.parse(game?.fixture?.date || '')))
  .sort((a,b) => Date.parse(b.fixture.date) - Date.parse(a.fixture.date))
  .slice(0,5)
  .map(game => ({
   date:game.fixture.date,
   homeGoals: Number(game.teams.home.id) === homeId ? game.goals.home : game.goals.away,
   awayGoals: Number(game.teams.home.id) === awayId ? game.goals.home : game.goals.away
  }));
};

const factorial=[1,1,2,6,24,120,720];
const poisson=(goals,mean)=>Math.exp(-mean)*mean**goals/factorial[goals];
const inLine=(goals,line)=>!line||goals>=line.min&&(line.max==null||goals<=line.max);

/**
 * A score *scenario*, not a calibrated exact-score prediction. No guessed
 * league baselines or arbitrary synthetic probabilities. Only real H2H scores.
 */
export function goalProjection(fixture,predictionResponse,h2h=[]) {
 const predicted=predictionResponse?.predictions||{};
 const home=String(fixture?.teams?.home?.name||'Local').slice(0,90);
 const away=String(fixture?.teams?.away?.name||'Visitante').slice(0,90);
 const homeId=Number(fixture?.teams?.home?.id);
 const awayId=Number(fixture?.teams?.away?.id);
 const homeLine=parseGoalLine(predicted?.goals?.home);
 const awayLine=parseGoalLine(predicted?.goals?.away);
 const totalLine=parseGoalLine(predicted?.under_over);
 const result={home,away,home_line:homeLine,away_line:awayLine,total_line:totalLine,
  illustrative_score:null,illustrative_margin:null,score_basis:null,historical:null};
 const games=cleanCompleted(h2h,homeId,awayId);
 if(games.length<3)return result;
 const meanHome=games.reduce((s,g)=>s+g.homeGoals,0)/games.length;
 const meanAway=games.reduce((s,g)=>s+g.awayGoals,0)/games.length;
 const btts=games.filter(g=>g.homeGoals>0&&g.awayGoals>0).length;
 result.historical={games:games.length,average_home_goals:+meanHome.toFixed(2),
  average_away_goals:+meanAway.toFixed(2),average_total_goals:+(meanHome+meanAway).toFixed(2),both_scored:btts};
 // Determine the most likely score conditioned on the distinct 1X2 outcome,
 // provided it is compatible with all three *provider* goal lines. This is
 // not the unconditional most likely match outcome.
 const perc=predicted?.percent || {};
 const outcome=[['home',Number(String(perc.home??'').replace('%',''))],['draw',Number(String(perc.draw??'').replace('%',''))],['away',Number(String(perc.away??'').replace('%',''))]]
   .filter(x=>Number.isFinite(x[1])&&x[1]>=0&&x[1]<=100)
   .sort((a,b)=>b[1]-a[1]);
 if(outcome.length!==3)return result;
 const favorite=outcome[0][0];
 let best=null;
 for(let h=0;h<=6;h++)for(let a=0;a<=6;a++){
  const outcomeMatches=favorite==='home'?h>a:favorite==='away'?a>h:h===a;
  if(!outcomeMatches||!inLine(h,homeLine)||!inLine(a,awayLine)||!inLine(h+a,totalLine))continue;
  const score=poisson(h,meanHome)*poisson(a,meanAway);
  if(!best||score>best.weight)best={home:h,away:a,weight:score};
 }
 if(best){
  result.illustrative_score=`${best.home}-${best.away}`;
  result.illustrative_margin=Math.abs(best.home-best.away);
  result.score_basis=`Escenario ilustrativo condicionado al 1X2 y las líneas del proveedor, calculado con ${games.length} enfrentamientos previos. No es una predicción de marcador exacto validada.`;
 }
 return result;
}

export function goalAnalysisLines(goalInfo){
 const lines=[];
 const entries=[
  [goalInfo.home,goalInfo.home_line],
  [goalInfo.away,goalInfo.away_line],
  ['Total del partido',goalInfo.total_line]
 ].filter(([,line])=>line);
 if(entries.length){
  lines.push('Proyección de goles del proveedor (líneas de más/menos, NO cantidad exacta): '+
   entries.map(([name,line])=>`${name}: ${line.market_label.toLowerCase()} (${line.label.toLowerCase()})`).join('; ')+'.');
 }else lines.push('Goles previstos: el proveedor no aporta líneas de goles válidas para este encuentro.');
 if(goalInfo.historical){
  const h=goalInfo.historical;
  lines.push(`Antecedentes H2H, ${h.games} partidos: medias observadas de ${h.average_home_goals} goles de ${goalInfo.home}, ${h.average_away_goals} de ${goalInfo.away}, ${h.average_total_goals} en total; ambos marcaron en ${h.both_scored}/${h.games}. Estas frecuencias no predicen por sí solas el próximo encuentro.`);
 }
 if(goalInfo.illustrative_score!=null){
  lines.push(`Marcador orientativo (NO apuesta recomendada): ${goalInfo.home} ${goalInfo.illustrative_score.replace('-', ' - ')} ${goalInfo.away}; diferencia de ${goalInfo.illustrative_margin} ${goalInfo.illustrative_margin===1?'gol':'goles'}. ${goalInfo.score_basis}`);
 }else{
  lines.push('Marcador exacto y margen de victoria: SIN ESTIMACIÓN responsable por datos históricos insuficientes o líneas incompatibles. No se inventa un resultado.');
 }
 return lines;
}
