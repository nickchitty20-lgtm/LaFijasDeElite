/** N-FORCE probability engine, v1.1. Historical scores only.
 * Raw model probabilities are NOT calibrated or guaranteed profitable.
 * Walk-forward testing never trains on fixtures at/after the prediction time.
 */
const DAY=86400000;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const round=(x,n=1)=>Number(x.toFixed(n));
export const MODEL_VERSION='nforce-poisson-1.1';
export const MODEL_SETTINGS=Object.freeze({lookbackDays:540,teamGames:24,leagueGames:250,minTeam:7,minLeague:36,freshDays:90,rho:-0.07});

export function fulltime(row){
 if(!row||row.home_goals==null||row.away_goals==null||row.home_goals===''||row.away_goals==='')return false;
 return [row.home_goals,row.away_goals].every(v=>Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=25);
}
export function fixtureTimestamp(row){
 const value=row?.kickoff;
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():NaN;
 if(value){
  const text=String(value).trim().replace(' ','T');
  const timestamp=Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(text)?text:text+'Z');
  if(Number.isFinite(timestamp))return timestamp;
 }
 const day=String(row?.date||row?.date_label||'').slice(0,10);
 // Unknown kickoff: assume start of day, excluding all same-day outcomes from training.
 return /^\d{4}-\d\d-\d\d$/.test(day)?Date.parse(day+'T00:00:00Z'):NaN;
}
export function poisson(lambda,k){
 if(!Number.isInteger(k)||k<0||!Number.isFinite(lambda)||lambda<=0)return 0;
 let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;
}
/** Correlated low-score adjustment (Dixon-Coles style). Fixed rho is a
 * heuristic, NOT fitted to this dataset. Re-normalise the truncated grid.
 */
export function lowScoreFactor(h,a,lh,la,rho=MODEL_SETTINGS.rho){
 if(h===0&&a===0)return Math.max(0,1-lh*la*rho);
 if(h===0&&a===1)return Math.max(0,1+lh*rho);
 if(h===1&&a===0)return Math.max(0,1+la*rho);
 if(h===1&&a===1)return Math.max(0,1-rho);
 return 1;
}
export function scoreDistribution(lambdaHome,lambdaAway,maxGoals=12){
 if(![lambdaHome,lambdaAway].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(maxGoals)||maxGoals<4||maxGoals>30)throw Error('Parámetros de goles inválidos');
 const cells=[];let sum=0;
 for(let h=0;h<=maxGoals;h++)for(let a=0;a<=maxGoals;a++){
  const p=poisson(lambdaHome,h)*poisson(lambdaAway,a)*lowScoreFactor(h,a,lambdaHome,lambdaAway);
  cells.push({home:h,away:a,p});sum+=p;
 }
 if(!Number.isFinite(sum)||sum<=0)throw Error('Distribución numéricamente inválida');
 for(const cell of cells)cell.p/=sum;
 return cells;
}
const weighted=(rows,cutoff,fn)=>{
 let total=0,weight=0,weightSquares=0;
 for(const m of rows){const age=Math.max(0,(cutoff-fixtureTimestamp(m))/DAY);const w=Math.exp(-age/165);
  total+=w*fn(m);weight+=w;weightSquares+=w*w;}
 return {mean:weight?total/weight:0,effective:weightSquares?weight**2/weightSquares:0};
};
/** Find out why a fixture has no model; no fabricated history or kickoffs. */
export function modelReadiness(target,completed,asOf=fixtureTimestamp(target)){
 const cutoff=Number(asOf),league=String(target?.competition||'');
 if(!Number.isFinite(cutoff)||!league||!target?.home||!target?.away||target.home===target.away)
  return {ready:false,reason:'invalid_fixture'};
 const prior=(completed||[]).filter(m=>m.competition===league&&fulltime(m)&&
  fixtureTimestamp(m)<cutoff&&fixtureTimestamp(m)>=cutoff-MODEL_SETTINGS.lookbackDays*DAY)
  .sort((a,b)=>fixtureTimestamp(b)-fixtureTimestamp(a));
 const home=prior.filter(m=>m.home===target.home||m.away===target.home).slice(0,MODEL_SETTINGS.teamGames);
 const away=prior.filter(m=>m.home===target.away||m.away===target.away).slice(0,MODEL_SETTINGS.teamGames);
 const sample={home:home.length,away:away.length,league:Math.min(prior.length,MODEL_SETTINGS.leagueGames)};
 if(prior.length<MODEL_SETTINGS.minLeague)return {ready:false,reason:'league_history',sample};
 if(home.length<MODEL_SETTINGS.minTeam||away.length<MODEL_SETTINGS.minTeam)return {ready:false,reason:'team_history',sample};
 const ageHome=(cutoff-fixtureTimestamp(home[0]))/DAY,ageAway=(cutoff-fixtureTimestamp(away[0]))/DAY;
 if(ageHome>MODEL_SETTINGS.freshDays||ageAway>MODEL_SETTINGS.freshDays)return {ready:false,reason:'stale_form',sample};
 return {ready:true,reason:'ok',prior,home,away,sample,ageHome,ageAway};
}
/** Empirical Bayes / partial pooling: venue sample -> team's overall rate,
 * with shrinkage of outlying relative strengths toward the league baseline. */
export function estimateMatch(target,completed,asOf=fixtureTimestamp(target)){
 const r=modelReadiness(target,completed,asOf);
 if(!r.ready)return null;
 const {home,away,prior,ageHome,ageAway}=r,cutoff=Number(asOf),base=prior.slice(0,MODEL_SETTINGS.leagueGames);
 const baseHome=weighted(base,cutoff,m=>Number(m.home_goals)).mean;
 const baseAway=weighted(base,cutoff,m=>Number(m.away_goals)).mean;
 if(baseHome<0.35||baseAway<0.35)return null;
 const scored=(m,team)=>Number(m.home===team?m.home_goals:m.away_goals);
 const conceded=(m,team)=>Number(m.home===team?m.away_goals:m.home_goals);
 const venueBlend=(rows,venue,fn)=>{
  const overall=weighted(rows,cutoff,fn).mean;
  if(!venue.length)return overall;
  const part=weighted(venue,cutoff,fn);
  // Small samples are *not* allowed to overpower overall form.
  return (part.mean*part.effective+overall*8)/(part.effective+8);
 };
 const local=home.filter(m=>m.home===target.home),visitor=away.filter(m=>m.away===target.away);
 const hAtk=venueBlend(home,local,m=>scored(m,target.home));
 const hDef=venueBlend(home,local,m=>conceded(m,target.home));
 const aAtk=venueBlend(away,visitor,m=>scored(m,target.away));
 const aDef=venueBlend(away,visitor,m=>conceded(m,target.away));
 const posteriorRatio=(rate,leagueRate,n)=>{
  const strength=(rate+leagueRate*2)/(leagueRate*3); // positive, with weak gamma prior
  const reliability=clamp(n/(n+10),0,0.80);
  return Math.exp(clamp(Math.log(Math.max(0.10,strength)), -1,1)*reliability);
 };
 const eh=weighted(home,cutoff,()=>1).effective,ea=weighted(away,cutoff,()=>1).effective;
 const lh=clamp(baseHome*posteriorRatio(hAtk,baseHome,eh)*posteriorRatio(aDef,baseHome,ea),0.30,3.6);
 const la=clamp(baseAway*posteriorRatio(aAtk,baseAway,ea)*posteriorRatio(hDef,baseAway,eh),0.30,3.6);
 const distribution=scoreDistribution(lh,la);
 const p={home:0,draw:0,away:0,over15:0,over25:0,over35:0,btts:0,under25:0};
 for(const c of distribution){p[c.home>c.away?'home':c.home<c.away?'away':'draw']+=c.p;
  if(c.home+c.away>=2)p.over15+=c.p;
  if(c.home+c.away>=3)p.over25+=c.p;else p.under25+=c.p;
  if(c.home+c.away>=4)p.over35+=c.p;
  if(c.home>0&&c.away>0)p.btts+=c.p;
 }
 const order=['home','draw','away'].sort((x,y)=>p[y]-p[x]);
 const peak=distribution.reduce((a,b)=>a.p>b.p?a:b);
 const sample={...r.sample,home_venue:local.length,away_venue:visitor.length,
  home_effective:round(eh,1),away_effective:round(ea,1),age_home_days:round(ageHome),age_away_days:round(ageAway),
  latest_home:new Date(fixtureTimestamp(home[0])).toISOString(),latest_away:new Date(fixtureTimestamp(away[0])).toISOString()};
 const quality=Math.round(clamp(100*(0.35*Math.min(1,eh/15)+0.35*Math.min(1,ea/15)+
  0.15*Math.min(1,base.length/120)+0.15*Math.min(1,(local.length+visitor.length)/14)),0,100));
 return {model:MODEL_VERSION,lambda:{home:round(lh,2),away:round(la,2)},
  probabilities:{home:round(100*p.home),draw:round(100*p.draw),away:round(100*p.away)},
  totals:{over15:round(100*p.over15),over25:round(100*p.over25),over35:round(100*p.over35),under25:round(100*p.under25),btts:round(100*p.btts)},
  selected:order[0],confidence:round(100*p[order[0]]),margin:round(100*(p[order[0]]-p[order[1]])),
  score:`${peak.home}-${peak.away}`,score_probability:round(100*peak.p),sample,quality,
  method:'Poisson regularizado con ajuste de marcadores bajos (coeficientes sin calibrar)'};
}
export function makeCandidate(match,model){
 if(!model||!match?.scheduled_time_known||!match.kickoff||!Number.isFinite(Date.parse(match.kickoff)))return null;
 let visibility=null;
 if(model.confidence>=62&&model.margin>=12&&model.sample.home>=10&&model.sample.away>=10&&Number(model.quality??80)>=58)visibility='vip';
 else if(model.confidence>=40&&model.confidence<=50&&model.margin>=6&&Number(model.quality??80)>=45)visibility='free';
 if(!visibility)return null;
 const label=model.selected==='home'?match.home:model.selected==='away'?match.away:'Empate';
 const fmt=n=>`${Number(n).toFixed(1)}%`;
 const analysis=[`N-FORCE Football Intelligence · Modelo ${MODEL_VERSION} (Poisson regularizado con corrección de marcadores bajos). Datos deportivos históricos de terceros.`,
 `Partido: ${match.home} vs ${match.away}; ${match.league}; ${match.kickoff} UTC. Comprueba el horario del encuentro: los datos pueden estar desactualizados.`,
 `1X2 · Selección: ${label}. Probabilidades estimadas SIN CALIBRAR: local ${fmt(model.probabilities.home)}, empate ${fmt(model.probabilities.draw)}, visitante ${fmt(model.probabilities.away)}. Ventaja respecto al segundo escenario: ${fmt(model.margin)}.`,
 `Goles medios proyectados: ${match.home} ${model.lambda.home}, ${match.away} ${model.lambda.away}. Más de 1.5: ${fmt(model.totals.over15)}, más de 2.5: ${fmt(model.totals.over25)}, menos de 2.5: ${fmt(model.totals.under25??100-model.totals.over25)}, más de 3.5: ${fmt(model.totals.over35)}, ambos marcan: ${fmt(model.totals.btts)}.`,
 `Marcador orientativo: ${model.score} (${fmt(model.score_probability)} del modelo, no es una apuesta segura).`,
 `Calidad de muestra (indicador interno, NO porcentaje de acierto): ${model.quality??'no medida'}/100. Partidos previos: local ${model.sample.home}, visitante ${model.sample.away}, competición ${model.sample.league}.`,
 `Riesgos: lesiones y alineaciones no disponibles, cambios de plantillas, horarios reprogramados y variabilidad inherente al deporte. No se han fabricado cuotas. Sin calibración externa ni rentabilidad demostrada.${visibility==='free'?' Pronóstico gratuito de elevada incertidumbre.':''}`].join('\n\n');
 const evidence={source:'OpenFootball football.json (CC0-1.0)',model,margin:model.margin,evidence_count:2,
  match_context:{round:match.round||'',country:'',venue:'',city:''},
  goals:{home:match.home,away:match.away,illustrative_score:model.score,
   illustrative_margin:Math.abs(Number(model.score.split('-')[0])-Number(model.score.split('-')[1])),model_based:true},
  dataset:{season:match.season,source_path:match.source_path},
  risks:'Sin cuotas verificadas, sin bajas ni onces oficiales; horario requiere confirmación externa.'};
 return {provider:'nforce-openfootball',fixture_id:match.id,visibility,home_team:match.home,away_team:match.away,
  league:match.league,kickoff:match.kickoff.slice(0,19).replace('T',' '),market:'Resultado final 1X2',selection:label,
  provider_probability:model.confidence,odds:null,analysis:analysis.slice(0,7900),evidence_json:JSON.stringify(evidence)};
}
/** Walk-forward: fixture forecasts use only completed matches strictly before kickoff.
 * Calibration buckets expose overconfidence instead of making success claims.
 */
export function walkForwardBacktest(matches,{maxGames=300,now=new Date()}={}){
 const completed=(matches||[]).filter(m=>fulltime(m)&&Number.isFinite(fixtureTimestamp(m))&&fixtureTimestamp(m)<now.getTime()-2*3600000)
  .sort((a,b)=>fixtureTimestamp(a)-fixtureTimestamp(b));
 const cut=completed.slice(-Math.min(1000,maxGames));
 let evaluated=0,correct=0,brier=0,logloss=0,goalsEvaluated=0,goalsCorrect=0,goalsBrier=0;
 const perLeague={},calibration={},segments={vip:{evaluated:0,correct:0},free:{evaluated:0,correct:0}};
 for(const m of cut){const t=fixtureTimestamp(m);const past=completed.filter(x=>fixtureTimestamp(x)<t);
  const forecast=estimateMatch(m,past,t);if(!forecast)continue;
  const actual=Number(m.home_goals)>Number(m.away_goals)?'home':Number(m.home_goals)<Number(m.away_goals)?'away':'draw';
  const probs=forecast.probabilities,wasCorrect=forecast.selected===actual,actualP=clamp(probs[actual]/100,0.000001,1);
  evaluated++;correct+=Number(wasCorrect);logloss-=Math.log(actualP);
  brier+=['home','draw','away'].reduce((sum,k)=>sum+(probs[k]/100-(k===actual?1:0))**2,0);
  const over=Number(m.home_goals)+Number(m.away_goals)>=3,predOver=forecast.totals.over25/100;
  goalsEvaluated++;goalsCorrect+=Number((predOver>=0.5)===over);goalsBrier+=(predOver-Number(over))**2;
  const entry=perLeague[m.competition]||{evaluated:0,correct:0};entry.evaluated++;entry.correct+=Number(wasCorrect);perLeague[m.competition]=entry;
  const bucket=`${Math.floor(Math.min(99.999,forecast.confidence)/10)*10}-${Math.floor(Math.min(99.999,forecast.confidence)/10)*10+9}`;
  const bin=calibration[bucket]||{evaluated:0,correct:0,predicted_sum:0};bin.evaluated++;bin.correct+=Number(wasCorrect);bin.predicted_sum+=forecast.confidence;calibration[bucket]=bin;
  const candidate=makeCandidate({...m,scheduled_time_known:true,kickoff:new Date(t).toISOString()},forecast);
  if(candidate){const seg=segments[candidate.visibility];seg.evaluated++;seg.correct+=Number(wasCorrect);}
 }
 for(const x of Object.values(perLeague))x.accuracy=x.evaluated?round(100*x.correct/x.evaluated):null;
 for(const x of Object.values(segments))x.accuracy=x.evaluated?round(100*x.correct/x.evaluated):null;
 for(const x of Object.values(calibration)){x.mean_forecast=round(x.predicted_sum/x.evaluated);x.observed_accuracy=round(100*x.correct/x.evaluated);delete x.predicted_sum;}
 return {model:MODEL_VERSION,attempted:cut.length,evaluated,accuracy:evaluated?round(100*correct/evaluated):null,
  brier:evaluated?round(brier/evaluated,4):null,logloss:evaluated?round(logloss/evaluated,4):null,
  over25_accuracy:goalsEvaluated?round(100*goalsCorrect/goalsEvaluated):null,
  over25_brier:goalsEvaluated?round(goalsBrier/goalsEvaluated,4):null,
  per_league:perLeague,segments,calibration,validated:evaluated>=40,
  method:'walk-forward cronológico: datos estrictamente anteriores a cada partido',
  note:'Tasas observadas retrospectivas; no son cuotas, promesas de acierto ni rendimiento garantizado.'};
}
