import {fitOpponentRatings,opponentAdjustedGoals} from './nforce-strength.js';
import {isNationalCompetition} from './nforce-internationals.js';
/** N-FORCE probability engine, v1.2. Historical scores only.
 * Raw model probabilities are NOT calibrated or guaranteed profitable.
 * Walk-forward testing never trains on fixtures at/after the prediction time.
 */
const DAY=86400000;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const round=(x,n=1)=>Number(x.toFixed(n));
export const MODEL_VERSION='nforce-poisson-1.6';
export const MODEL_SETTINGS=Object.freeze({lookbackDays:540,teamGames:30,leagueGames:250,minTeam:7,minLeague:36,freshDays:90,rho:-0.07});

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
 // Unknown kickoff: conservatively assume END of day, to prevent leaking
 // unknown same-day results into an earlier forecast.
 return /^\d{4}-\d\d-\d\d$/.test(day)?Date.parse(day+'T23:59:59.999Z'):NaN;
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
 const cutoff=Number(asOf),league=String(target?.competition||''),national=isNationalCompetition(league);
 const lookback=national?900:MODEL_SETTINGS.lookbackDays, freshDays=national?180:MODEL_SETTINGS.freshDays;
 if(!Number.isFinite(cutoff)||!league||!target?.home||!target?.away||target.home===target.away)
  return {ready:false,reason:'invalid_fixture'};
 const prior=(completed||[]).filter(m=>(national?isNationalCompetition(m.competition):m.competition===league)&&fulltime(m)&&
  fixtureTimestamp(m)<cutoff&&fixtureTimestamp(m)>=cutoff-lookback*DAY)
  .sort((a,b)=>fixtureTimestamp(b)-fixtureTimestamp(a));
 const home=prior.filter(m=>m.home===target.home||m.away===target.home).slice(0,MODEL_SETTINGS.teamGames);
 const away=prior.filter(m=>m.home===target.away||m.away===target.away).slice(0,MODEL_SETTINGS.teamGames);
 const sample={home:home.length,away:away.length,league:Math.min(prior.length,MODEL_SETTINGS.leagueGames)};
 if(prior.length<MODEL_SETTINGS.minLeague)return {ready:false,reason:'league_history',sample};
 if(home.length<MODEL_SETTINGS.minTeam||away.length<MODEL_SETTINGS.minTeam)return {ready:false,reason:'team_history',sample};
 const ageHome=(cutoff-fixtureTimestamp(home[0]))/DAY,ageAway=(cutoff-fixtureTimestamp(away[0]))/DAY;
 if(ageHome>freshDays||ageAway>freshDays)return {ready:false,reason:'stale_form',sample};
 return {ready:true,reason:'ok',prior,home,away,sample,ageHome,ageAway,pool:national?'selecciones':'liga'};
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
  return (part.mean*part.effective+overall*4)/(part.effective+4);
 };
 const local=home.filter(m=>m.home===target.home),visitor=away.filter(m=>m.away===target.away);
 const hAtk=venueBlend(home,local,m=>scored(m,target.home));
 const hDef=venueBlend(home,local,m=>conceded(m,target.home));
 const aAtk=venueBlend(away,visitor,m=>scored(m,target.away));
 const aDef=venueBlend(away,visitor,m=>conceded(m,target.away));
 // Relative attack/defence, with a stable league prior. More responsive than
 // v1.1, but still regularised: not a claim of better predictive accuracy.
 const posteriorRatio=(rate,leagueRate,n)=>{
  const pooled=(Math.max(0,rate)*n+leagueRate*4)/(n+4);
  return Math.exp(0.85*clamp(Math.log(Math.max(0.10,pooled/leagueRate)),-1.05,1.05));
 };
 const eh=weighted(home,cutoff,()=>1).effective,ea=weighted(away,cutoff,()=>1).effective;
 const legacyHome=clamp(baseHome*posteriorRatio(hAtk,baseHome,eh)*posteriorRatio(aDef,baseHome,ea),0.30,3.6);
 const legacyAway=clamp(baseAway*posteriorRatio(aAtk,baseAway,ea)*posteriorRatio(hDef,baseAway,eh),0.30,3.6);
 // The legacy forecast anchors a separately fitted opponent-aware attack/defence
 // model. Blend in log-goal space, never add an arbitrary percentage bonus.
 const ratings=fitOpponentRatings(base,cutoff,baseHome,baseAway);
 const adjusted=opponentAdjustedGoals(ratings,target.home,target.away,baseHome,baseAway,[legacyHome,legacyAway]);
 const lh=adjusted?.home??legacyHome,la=adjusted?.away??legacyAway;
 const distribution=scoreDistribution(lh,la);
 const p={home:0,draw:0,away:0,over15:0,over25:0,over35:0,btts:0,under25:0};
 for(const c of distribution){p[c.home>c.away?'home':c.home<c.away?'away':'draw']+=c.p;
  if(c.home+c.away>=2)p.over15+=c.p;
  if(c.home+c.away>=3)p.over25+=c.p;else p.under25+=c.p;
  if(c.home+c.away>=4)p.over35+=c.p;
  if(c.home>0&&c.away>0)p.btts+=c.p;
 }
 // Venue-independent historical comparison for each proposed market. This is
 // NOT bookmaker edge; it is just a guard against promoting trivial favourites.
 const leagueBaseline={};
 const flags={home:m=>m.home_goals>m.away_goals,draw:m=>m.home_goals===m.away_goals,away:m=>m.home_goals<m.away_goals,
  over15:m=>Number(m.home_goals)+Number(m.away_goals)>1,over25:m=>Number(m.home_goals)+Number(m.away_goals)>2,
  under25:m=>Number(m.home_goals)+Number(m.away_goals)<3,btts:m=>Number(m.home_goals)>0&&Number(m.away_goals)>0};
 for(const [key,condition] of Object.entries(flags))leagueBaseline[key]=round(100*weighted(base,cutoff,m=>Number(condition(m))).mean);
 leagueBaseline.noBtts=round(100-leagueBaseline.btts);
 leagueBaseline.oneX=round(leagueBaseline.home+leagueBaseline.draw);
 leagueBaseline.xTwo=round(leagueBaseline.draw+leagueBaseline.away);
 leagueBaseline.oneTwo=round(leagueBaseline.home+leagueBaseline.away);
 const order=['home','draw','away'].sort((x,y)=>p[y]-p[x]);
 const peak=distribution.reduce((a,b)=>a.p>b.p?a:b);
 const sample={...r.sample,home_venue:local.length,away_venue:visitor.length,
  home_effective:round(eh,1),away_effective:round(ea,1),age_home_days:round(ageHome),age_away_days:round(ageAway),
  latest_home:new Date(fixtureTimestamp(home[0])).toISOString(),latest_away:new Date(fixtureTimestamp(away[0])).toISOString()};
 const quality=Math.round(clamp(100*(0.35*Math.min(1,eh/15)+0.35*Math.min(1,ea/15)+
  0.15*Math.min(1,base.length/120)+0.15*Math.min(1,(local.length+visitor.length)/14)),0,100));
 return {model:MODEL_VERSION,lambda:{home:round(lh,2),away:round(la,2)},
  previous_lambda:{home:round(legacyHome,3),away:round(legacyAway,3)},
  opponent_model:{active:Boolean(adjusted),blend:round(adjusted?.mix??0,2),trained_matches:ratings?.trainedMatches??0,opponent_samples:adjusted?.opponentSamples??null},
  probabilities:{home:round(100*p.home),draw:round(100*p.draw),away:round(100*p.away)},
  totals:{over15:round(100*p.over15),over25:round(100*p.over25),over35:round(100*p.over35),under25:round(100*p.under25),btts:round(100*p.btts)},
  selected:order[0],confidence:round(100*p[order[0]]),margin:round(100*(p[order[0]]-p[order[1]])),
  score:`${peak.home}-${peak.away}`,score_probability:round(100*peak.p),sample,quality,leagueBaseline,
  history_group:r.pool, // selecciones: historial integrado entre competiciones, nunca entre clubes
  method:'Poisson regularizado con ajuste de rivales, forma temporal y marcadores bajos (sin calibración demostrada)'};
}
/** All markets use only full-time historical scores available before kickoff.
 * One strongest qualifying suggestion per fixture, preserving existing unique
 * (provider, fixture_id) constraint and preventing conflicting predictions.
 * Estimated probabilities are not calibrated; no invented lineups or odds.
 */
/** A sensitivity check, NOT a statistical lower confidence bound.
 * Vary both teams' expected goals by +-12%, and compare with the earlier
 * regularized forecast. Conservative VIPs must survive these scenarios.
 * All test scenarios derive from the historical goal model, not market odds.
 */
export const VIP_RISK_POLICY=Object.freeze({minTeam:20,minLeague:150,minVenue:6,minEffective:11,
 maxFormAgeDays:28,minQuality:86,maxModelDisagreement:9,maxStressDrop:13,minStressed:76,
 minNominal:{'1x2':74,over15:82,over25:79,under25:79,bttsYes:79,bttsNo:79,'1X':86,'X2':86,'12':88},
 minBaselineEdge:8});
const marketScore=(key,grid,selected)=>{
 let score=0;
 for(const c of grid){const h=c.home,a=c.away;
  const good=key==='1x2'?(selected==='home'?h>a:selected==='draw'?h===a:selected==='away'?h<a:false):
   key==='over15'?h+a>=2:key==='over25'?h+a>=3:key==='under25'?h+a<=2:
   key==='bttsYes'?h>0&&a>0:key==='bttsNo'?h===0||a===0:
   key==='1X'?h>=a:key==='X2'?h<=a:key==='12'?h!==a:false;
  if(good)score+=c.p;
 }
 return 100*score;
};
export function vipRiskAssessment(option,model){
 const fail=(code)=>({approved:false,code});
 const sample=model?.sample||{},risk=VIP_RISK_POLICY;
 if(!model||!option||!Object.hasOwn(risk.minNominal,option.key))return fail('invalid_market');
 if(!Number.isFinite(Number(model.quality))||Number(model.quality)<risk.minQuality||
  Number(sample.home)<risk.minTeam||Number(sample.away)<risk.minTeam||Number(sample.league)<risk.minLeague||
  Number(sample.home_venue)<risk.minVenue||Number(sample.away_venue)<risk.minVenue||
  Number(sample.home_effective)<risk.minEffective||Number(sample.away_effective)<risk.minEffective||
  !Number.isFinite(Number(sample.age_home_days))||!Number.isFinite(Number(sample.age_away_days))||
  Number(sample.age_home_days)>risk.maxFormAgeDays||Number(sample.age_away_days)>risk.maxFormAgeDays||
  model.opponent_model?.active!==true)return fail('insufficient_recent_evidence');
 const lh=Number(model.lambda?.home),la=Number(model.lambda?.away);
 const oldH=Number(model.previous_lambda?.home),oldA=Number(model.previous_lambda?.away);
 if(![lh,la,oldH,oldA].every(v=>Number.isFinite(v)&&v>=0.3&&v<=3.6))return fail('missing_goal_sensitivity');
 const selected=option.key==='1x2'?model.selected:null;
 const evaluate=(h,a)=>marketScore(option.key,scoreDistribution(h,a),selected);
 const nominal=evaluate(lh,la),old=evaluate(oldH,oldA);
 const alternate=[evaluate(lh*0.88,la*1.12),evaluate(lh*1.12,la*0.88),
  evaluate(lh*0.88,la*0.88),evaluate(lh*1.12,la*1.12)];
 const minScenario=Math.min(nominal,old,...alternate);
 const modelGap=Math.abs(nominal-old);
 const estimated=Number(option.probability),baseline=Number(option.baseline);
 const detail={nominal:round(nominal),worst_scenario:round(minScenario),previous_model:round(old),
  model_gap:round(modelGap),stress_drop:round(nominal-minScenario)};
 if(option.baseline==null||!Number.isFinite(estimated)||!Number.isFinite(baseline)||Math.abs(nominal-estimated)>2.2)
  return {...fail('inconsistent_probability'),...detail};
 if(estimated<risk.minNominal[option.key]||estimated-baseline<risk.minBaselineEdge)
  return {...fail('weak_nominal_edge'),...detail};
 if(minScenario<risk.minStressed||modelGap>risk.maxModelDisagreement||
  nominal-minScenario>risk.maxStressDrop||minScenario-baseline<3)
  return {...fail('fragile_prediction'),...detail};
 return {approved:true,code:'robust',...detail};
}
/** FREE can include other markets. A large nominal chance alone never qualifies:
 * require sufficiently complete history, a meaningful difference from the
 * historical league frequency, consistent goal probabilities and stable
 * sensitivity scenarios. These are heuristics, NOT proof of positive value.
 */
export const FREE_MARKET_POLICY=Object.freeze({minQuality:68,minTeam:14,minLeague:90,
 minLeagueLift:9,maxStressDrop:17,maxModelGap:12,
 minNominal:Object.freeze({over15:72,over25:65,under25:65,bttsYes:64,bttsNo:64,'1X':76,'X2':76,'12':78})});
function freeMarketAssessment(option,model){
 const fail=code=>({approved:false,code});
 const risk=FREE_MARKET_POLICY,s=model?.sample||{};
 if(!Object.hasOwn(risk.minNominal,option.key))return fail('unsupported_free_market');
 if(Number(model.quality)<risk.minQuality||Number(s.home)<risk.minTeam||
    Number(s.away)<risk.minTeam||Number(s.league)<risk.minLeague)return fail('free_history');
 const nominal=Number(option.probability),baseline=option.baseline;
 if(baseline==null||!Number.isFinite(Number(baseline))||Number(baseline)<0||Number(baseline)>100||
    !Number.isFinite(nominal)||nominal<risk.minNominal[option.key]||nominal>99.9||
    nominal-Number(baseline)<risk.minLeagueLift)return fail('free_insufficient_edge');
 const h=Number(model.lambda?.home),a=Number(model.lambda?.away);
 const oh=Number(model.previous_lambda?.home),oa=Number(model.previous_lambda?.away);
 if(![h,a,oh,oa].every(x=>Number.isFinite(x)&&x>=0.3&&x<=3.6))return fail('free_missing_sensitivity');
 const evaluate=(x,y)=>marketScore(option.key,scoreDistribution(x,y),null);
 const calculated=evaluate(h,a),prior=evaluate(oh,oa);
 const worst=Math.min(calculated,prior,evaluate(h*0.9,a*1.1),evaluate(h*1.1,a*0.9));
 if(Math.abs(calculated-nominal)>2.2)return fail('free_inconsistent_probability');
 if(calculated-worst>risk.maxStressDrop||Math.abs(calculated-prior)>risk.maxModelGap||
    worst<risk.minNominal[option.key]-10)return fail('free_fragile');
 return {approved:true,code:'free_screened',worst_scenario:round(worst),
  nominal:round(calculated),league_lift:round(nominal-Number(baseline))};
}
/** Select exactly one prediction per fixture; never manufacture a VIP.
 * An optional diagnostics object gathers rejection *counts per market*, not
 * evidence of future success or inferred bookmaker value.
 */
export function selectMarket(match,model,diagnostics=null){
 if(!model||!model.probabilities||!model.totals||!model.sample)return null;
 const p=model.probabilities,t=model.totals,b=model.leagueBaseline||{};
 const quality=Number(model.quality),home=String(match.home),away=String(match.away);
 const options=[
  {key:'1x2',market:'Resultado final 1X2',selection:model.selected==='home'?home:model.selected==='away'?away:'Empate',probability:Number(model.confidence),baseline:b[model.selected]==null?null:Number(b[model.selected]),margin:Number(model.margin)},
  {key:'over15',market:'Total goles',selection:'Más de 1.5',probability:Number(t.over15),baseline:b.over15==null?null:Number(b.over15)},
  {key:'over25',market:'Total goles',selection:'Más de 2.5',probability:Number(t.over25),baseline:b.over25==null?null:Number(b.over25)},
  {key:'under25',market:'Total goles',selection:'Menos de 2.5',probability:Number(t.under25),baseline:b.under25==null?null:Number(b.under25)},
  {key:'bttsYes',market:'Ambos marcan',selection:'Sí',probability:Number(t.btts),baseline:b.btts==null?null:Number(b.btts)},
  {key:'bttsNo',market:'Ambos marcan',selection:'No',probability:round(100-Number(t.btts)),baseline:b.noBtts==null?null:Number(b.noBtts)},
  {key:'1X',market:'Doble oportunidad',selection:'1X',probability:round(Number(p.home)+Number(p.draw)),baseline:b.oneX==null?null:Number(b.oneX)},
  {key:'X2',market:'Doble oportunidad',selection:'X2',probability:round(Number(p.away)+Number(p.draw)),baseline:b.xTwo==null?null:Number(b.xTwo)},
  {key:'12',market:'Doble oportunidad',selection:'12',probability:round(Number(p.home)+Number(p.away)),baseline:b.oneTwo==null?null:Number(b.oneTwo)}
 ];
 const eligible=[];
 for(const option of options){
  const result=option.key==='1x2'&&option.margin<12?{approved:false,code:'vip_1x2_margin'}:vipRiskAssessment(option,model);
  if(result.approved)eligible.push({...option,robustness:result});
  else if(diagnostics){
   diagnostics.vip_rejections??={};
   diagnostics.vip_rejections[result.code]=(diagnostics.vip_rejections[result.code]||0)+1;
  }
 }
 if(eligible.length){
  eligible.sort((x,y)=>(y.robustness.worst_scenario-y.baseline)-(x.robustness.worst_scenario-x.baseline)||
   y.robustness.worst_scenario-x.robustness.worst_scenario);
  const chosen=eligible[0];
  return {...chosen,visibility:'vip',advantage:round(chosen.probability-chosen.baseline)};
 }
 const free=[];
 const base=options[0];
 if(Number.isFinite(model.confidence)&&model.confidence>=40&&model.confidence<68&&Number(model.margin)>=6&&quality>=45){
  free.push({...base,visibility:'free',advantage:null,free_reason:'basic_1x2'});
 }
 for(const option of options.slice(1)){
  const screened=freeMarketAssessment(option,model);
  if(screened.approved)free.push({...option,visibility:'free',
   advantage:round(option.probability-option.baseline),free_screen:screened,free_reason:'multimarket_screen'});
 }
 // Prefer a substantial improvement on historical league frequency, not the
 // market with the most eye-catching headline percentage. Default 1X2 still
 // applies when no alternative has credible supporting information.
 free.sort((x,y)=>((y.advantage??0)+y.probability*0.06)-((x.advantage??0)+x.probability*0.06));
 if(diagnostics)diagnostics.free_eligible_markets=free.length;
 return free[0]||null;
}

export function makeCandidate(match,model,diagnostics=null){
 if(!model||!match?.scheduled_time_known||!match.kickoff||!Number.isFinite(Date.parse(match.kickoff)))return null;
 const selected=selectMarket(match,model,diagnostics);if(!selected)return null;
 const fmt=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'no disponible';
 const analysis=[`N-FORCE · Modelo estadístico ${MODEL_VERSION}. Probabilidades estimadas SIN CALIBRAR; datos históricos de encuentros.`,
 `Partido: ${match.home} vs ${match.away}; ${match.league}; ${match.kickoff} UTC. Confirma el horario del encuentro antes de publicar.`,
 `Mercado: ${selected.market}. Selección: ${selected.selection}. Probabilidad estimada: ${fmt(selected.probability)}. ${selected.advantage==null?'':`Diferencia frente a la frecuencia histórica de la liga: ${fmt(selected.advantage)} (NO equivale a ventaja frente a la cuota).`}`,
 `1X2 estimado: local ${fmt(model.probabilities.home)}, empate ${fmt(model.probabilities.draw)}, visitante ${fmt(model.probabilities.away)}. Diferencia frente al segundo escenario 1X2: ${fmt(model.margin)}.`,
 `El modelo considera fuerza de los rivales, forma temporal y rendimiento local/visitante cuando hay historial suficiente. Estos ajustes no garantizan mayor acierto.`,
 ...(selected.visibility==='vip'?[`Prueba de sensibilidad (escenarios, NO intervalo de confianza): peor escenario ${fmt(selected.robustness.worst_scenario)}; discrepancia de modelos ${fmt(selected.robustness.model_gap)}. El mercado aún debe superar el backtesting vigente.`]:[]),
 ...(selected.free_screen?[`Cribado GRATIS multimerkado (NO demuestra ventaja frente a cuotas): frecuencia histórica de liga ${fmt(selected.baseline)}; peor escenario de sensibilidad ${fmt(selected.free_screen.worst_scenario)}. Validación retrospectiva pendiente.`]:[]),
 `Goles proyectados: ${match.home} ${model.lambda.home}, ${match.away} ${model.lambda.away}. Más de 1.5: ${fmt(model.totals.over15)}, más de 2.5: ${fmt(model.totals.over25)}, menos de 2.5: ${fmt(model.totals.under25)}, ambos marcan: ${fmt(model.totals.btts)}.`,
 `Marcador meramente orientativo: ${model.score} (${fmt(model.score_probability)}). No representa una apuesta recomendada ni un resultado seguro.`,
 `Calidad de muestra: ${model.quality}/100 (NO mide precisión). Partidos previos: local ${model.sample.home}, visitante ${model.sample.away}, ${model.history_group==='selecciones'?'historial de selecciones':'competición'} ${model.sample.league}.`,
 `Riesgos: sin datos verificados de lesiones ni alineaciones; posibles cambios de plantilla, horarios reprogramados y variabilidad deportiva.${isNationalCompetition(match.competition)?' En selecciones, comprobar convocatorias, sede neutral y calendario internacional.':''} Sin cuotas verificadas ni rentabilidad demostrada.${selected.visibility==='free'?' Esta propuesta gratuita tiene alta incertidumbre.':''}`].join('\n\n');
 const evidence={source:isNationalCompetition(match.competition)?'Resultados históricos de selecciones (CC0-1.0)':'OpenFootball football.json (CC0-1.0)',model,margin:model.margin,evidence_count:2,
  pick:{key:selected.key,market:selected.market,selection:selected.selection,probability:selected.probability,baseline:selected.baseline,advantage:selected.advantage,robustness:selected.robustness||null,free_screen:selected.free_screen||null},
  match_context:{round:match.round||'',country:'',venue:'',city:''},
  goals:{home:match.home,away:match.away,illustrative_score:model.score,
   illustrative_margin:Math.abs(Number(model.score.split('-')[0])-Number(model.score.split('-')[1])),model_based:true},
  dataset:{season:match.season,source_path:match.source_path},
  risks:'Sin cuotas verificadas, sin bajas ni onces oficiales; horario pendiente de confirmación.'};
 return {provider:'nforce-openfootball',fixture_id:match.id,visibility:selected.visibility,home_team:match.home,away_team:match.away,
  league:match.league,kickoff:match.kickoff.slice(0,19).replace('T',' '),market:selected.market,selection:selected.selection,
  provider_probability:selected.probability,odds:null,analysis:analysis.slice(0,7900),evidence_json:JSON.stringify(evidence)};
}
/** Full-time outcome of a model-selected market, for retrospective validation. */
export function selectedMarketWon(candidate,match){
 if(!candidate||!fulltime(match))return null;
 const h=Number(match.home_goals),a=Number(match.away_goals),s=candidate.selection;
 if(candidate.market==='Resultado final 1X2')return s==='Empate'?h===a:s===match.home?h>a:s===match.away?h<a:null;
 if(candidate.market==='Total goles')return s==='Más de 1.5'?h+a>1:s==='Más de 2.5'?h+a>2:s==='Menos de 2.5'?h+a<3:null;
 if(candidate.market==='Ambos marcan')return s==='Sí'?(h>0&&a>0):s==='No'?(h===0||a===0):null;
 if(candidate.market==='Doble oportunidad')return s==='1X'?h>=a:s==='X2'?h<=a:s==='12'?h!==a:null;
 return null;
}
/** Walk-forward: fixture forecasts use only completed matches strictly before kickoff.
 * Calibration buckets expose overconfidence instead of making success claims.
 */
export function walkForwardBacktest(matches,{maxGames=300,now=new Date()}={}){
 const completed=(matches||[]).filter(m=>fulltime(m)&&Number.isFinite(fixtureTimestamp(m))&&fixtureTimestamp(m)<now.getTime()-2*3600000)
  .sort((a,b)=>fixtureTimestamp(a)-fixtureTimestamp(b));
 const cut=completed.slice(-Math.min(1000,maxGames));
 let evaluated=0,correct=0,brier=0,logloss=0,goalsEvaluated=0,goalsCorrect=0,goalsBrier=0;
 let previousBrier=0,previousEvaluated=0;
 const perLeague={},calibration={},by_market={},segments={vip:{evaluated:0,correct:0},free:{evaluated:0,correct:0}};
 for(const m of cut){const t=fixtureTimestamp(m);const past=completed.filter(x=>fixtureTimestamp(x)<t);
  const forecast=estimateMatch(m,past,t);if(!forecast)continue;
  const actual=Number(m.home_goals)>Number(m.away_goals)?'home':Number(m.home_goals)<Number(m.away_goals)?'away':'draw';
  const probs=forecast.probabilities,wasCorrect=forecast.selected===actual,actualP=clamp(probs[actual]/100,0.000001,1);
  evaluated++;correct+=Number(wasCorrect);logloss-=Math.log(actualP);
  brier+=['home','draw','away'].reduce((sum,k)=>sum+(probs[k]/100-(k===actual?1:0))**2,0);
  if(forecast.previous_lambda){
   const grid=scoreDistribution(forecast.previous_lambda.home,forecast.previous_lambda.away);
   const old={home:0,draw:0,away:0};
   for(const cell of grid)old[cell.home>cell.away?'home':cell.home<cell.away?'away':'draw']+=cell.p;
   previousBrier+=['home','draw','away'].reduce((sum,k)=>sum+(old[k]-(k===actual?1:0))**2,0);
   previousEvaluated++;
  }
  const over=Number(m.home_goals)+Number(m.away_goals)>=3,predOver=forecast.totals.over25/100;
  goalsEvaluated++;goalsCorrect+=Number((predOver>=0.5)===over);goalsBrier+=(predOver-Number(over))**2;
  const entry=perLeague[m.competition]||{evaluated:0,correct:0};entry.evaluated++;entry.correct+=Number(wasCorrect);perLeague[m.competition]=entry;
  const bucket=`${Math.floor(Math.min(99.999,forecast.confidence)/10)*10}-${Math.floor(Math.min(99.999,forecast.confidence)/10)*10+9}`;
  const bin=calibration[bucket]||{evaluated:0,correct:0,predicted_sum:0};bin.evaluated++;bin.correct+=Number(wasCorrect);bin.predicted_sum+=forecast.confidence;calibration[bucket]=bin;
  const candidate=makeCandidate({...m,scheduled_time_known:true,kickoff:new Date(t).toISOString()},forecast);
  if(candidate){const hit=selectedMarketWon(candidate,m);if(hit!==null){const seg=segments[candidate.visibility];seg.evaluated++;seg.correct+=Number(hit);
   const marketKey=JSON.parse(candidate.evidence_json).pick.key;const bucket=by_market[marketKey]||{evaluated:0,correct:0,brier_sum:0,baseline_brier_sum:0,predicted_sum:0,baseline_sum:0};
   const picked=JSON.parse(candidate.evidence_json).pick;
   const pred=Number(candidate.provider_probability)/100,base=Number(picked.baseline)/100;
   bucket.evaluated++;bucket.correct+=Number(hit);bucket.brier_sum+=(pred-Number(hit))**2;
   if(Number.isFinite(base)){
    bucket.baseline_brier_sum+=(base-Number(hit))**2;
    bucket.baseline_sum+=base;
   }else{
    bucket.baseline_brier_sum=NaN;bucket.baseline_sum=NaN;
   }
   bucket.predicted_sum+=pred;by_market[marketKey]=bucket;}}
 }
 for(const x of Object.values(perLeague))x.accuracy=x.evaluated?round(100*x.correct/x.evaluated):null;
 for(const x of Object.values(segments))x.accuracy=x.evaluated?round(100*x.correct/x.evaluated):null;
 for(const x of Object.values(by_market)){x.accuracy=round(100*x.correct/x.evaluated);x.brier=round(x.brier_sum/x.evaluated,4);
  x.baseline_brier=Number.isFinite(x.baseline_brier_sum)?round(x.baseline_brier_sum/x.evaluated,4):null;
  x.mean_forecast=round(100*x.predicted_sum/x.evaluated);
  x.mean_baseline=Number.isFinite(x.baseline_sum)?round(100*x.baseline_sum/x.evaluated):null;
  delete x.brier_sum;delete x.baseline_brier_sum;delete x.predicted_sum;delete x.baseline_sum;}
 for(const x of Object.values(calibration)){x.mean_forecast=round(x.predicted_sum/x.evaluated);x.observed_accuracy=round(100*x.correct/x.evaluated);delete x.predicted_sum;}
 return {model:MODEL_VERSION,attempted:cut.length,evaluated,accuracy:evaluated?round(100*correct/evaluated):null,
  brier:evaluated?round(brier/evaluated,4):null,logloss:evaluated?round(logloss/evaluated,4):null,
  over25_accuracy:goalsEvaluated?round(100*goalsCorrect/goalsEvaluated):null,
  over25_brier:goalsEvaluated?round(goalsBrier/goalsEvaluated,4):null,
  per_league:perLeague,segments,by_market,calibration,validated:evaluated>=40,
  comparison_previous:{previous_model:'nforce-poisson-1.3',paired_evaluated:previousEvaluated,
   previous_brier:previousEvaluated?round(previousBrier/previousEvaluated,4):null,
   current_brier:previousEvaluated?round(brier/previousEvaluated,4):null,
   brier_difference:previousEvaluated?round((brier-previousBrier)/previousEvaluated,4):null,
   note:'Brier menor significa menor error en la muestra retrospectiva; no garantiza mejor rendimiento futuro.'},
  method:'walk-forward cronológico: datos estrictamente anteriores a cada partido',
  note:'Tasas observadas retrospectivas; no son cuotas, promesas de acierto ni rendimiento garantizado.'};
}
