/** Strict, fail-closed evidence gate for N-FORCE premium picks.
 * Retrospective results are diagnostic, not a guarantee or bookmaker edge.
 * A VIP remains unpublished if the specific market has insufficient evidence.
 */
import {MODEL_VERSION} from './nforce-model.js';
export const VIP_POLICY=Object.freeze({minOverall:80,minMarket:40,minAccuracy:70,minWilsonLower:58,
 maxCalibrationGap:12,minBrierSkill:0.01,minBaselineLift:5,minVipOverFree:5,maxAgeDays:8});

const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const percent=(x)=>Math.round(Number(x)*10)/10;
export function wilsonLower(correct,evaluated,z=1.96){
 const n=Number(evaluated),wins=Number(correct);
 if(!Number.isInteger(n)||n<=0||!Number.isFinite(wins)||wins<0||wins>n)return null;
 const p=wins/n,den=1+z*z/n;
 return 100*(p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/den;
}
export function evaluateVipEvidence(candidate,validation,{asOf=new Date()}={}){
 if(candidate?.visibility!=='vip')return {approved:true,reason:'La política VIP no aplica a GRATIS'};
 const evidence=typeof candidate.evidence_json==='string'?safeJson(candidate.evidence_json):candidate.evidence_json||{};
 const pick=evidence?.pick,model=evidence?.model;
 const deny=(code,reason,extra={})=>({approved:false,code,reason,...extra});
 if(model?.model!==MODEL_VERSION||!pick?.key)
  return deny('outdated','Propuesta de una versión antigua; ejecuta Analizar ahora para actualizarla.');
 if(!validation||validation.model_version!==MODEL_VERSION||!validation.created_at)
  return deny('missing_backtest','Falta validar el modelo actualizado; pulsa Validar modelo.');
 const date=validation.created_at instanceof Date?validation.created_at:new Date(String(validation.created_at).replace(' ','T')+(String(validation.created_at).match(/Z|[+-]\d\d:?\d\d$/)?'':'Z'));
 const age=asOf.getTime()-date.getTime();
 if(!Number.isFinite(age)||age<0||age>VIP_POLICY.maxAgeDays*86400000)
  return deny('stale_backtest','La validación está vencida; ejecuta Validar modelo nuevamente.');
 const report=typeof validation.metrics_json==='string'?safeJson(validation.metrics_json):validation.metrics_json||{};
 if(Number(validation.evaluated)<VIP_POLICY.minOverall||report.model!==MODEL_VERSION)
  return deny('low_overall_sample',`Se requieren al menos ${VIP_POLICY.minOverall} partidos evaluados con el modelo actual.`,{evaluated:Number(validation.evaluated||0)});
 // Never authorize international picks using club-dominated backtest results.
 // New v1.8 validations carry stratified cohorts. Legacy/mock reports are
 // allowed only for club fixtures; national fixtures always fail closed.
 const national=model.history_group==='selecciones';
 const cohort=report.by_context?.[national?'national':'club'];
 if(national&&!cohort)return deny('missing_context_backtest','Falta validación retrospectiva independiente de selecciones; ejecuta Validar modelo.');
 if(cohort&&Number(cohort.evaluated)<VIP_POLICY.minOverall)
  return deny('low_context_sample',`El historial ${national?'de selecciones':'de clubes'} tiene ${Number(cohort.evaluated||0)}/${VIP_POLICY.minOverall} partidos evaluados.`,{evaluated:Number(cohort.evaluated||0)});
 const metric=cohort?cohort.by_market?.[pick.key]:report.by_market?.[pick.key];
 const n=Number(metric?.evaluated||0),wins=Number(metric?.correct||0);
 if(n<VIP_POLICY.minMarket)return deny('low_market_sample',`El mercado ${pick.key} tiene ${n}/${VIP_POLICY.minMarket} selecciones retrospectivas; no hay validación suficiente.`,{evaluated:n});
 if(!Number.isFinite(wins)||wins<0||wins>n)return deny('invalid_metrics','El historial de resultados del mercado es inválido.');
 const accuracy=percent(100*wins/n),lower=wilsonLower(wins,n),pred=Number(metric.mean_forecast),baseline=Number(metric.mean_baseline);
 const brier=Number(metric.brier),baseBrier=Number(metric.baseline_brier);
 const details={evaluated:n,accuracy,wilson_lower:percent(lower),mean_forecast:finite(metric.mean_forecast)?pred:null,
  mean_baseline:finite(metric.mean_baseline)?baseline:null,brier:finite(metric.brier)?brier:null,
  baseline_brier:finite(metric.baseline_brier)?baseBrier:null};
 if(![metric.mean_forecast,metric.mean_baseline,metric.brier,metric.baseline_brier].every(finite))
  return deny('missing_skill_metrics','Ejecuta nuevamente Validar modelo para obtener calibración y comparación histórica.',details);
 if(accuracy<VIP_POLICY.minAccuracy||lower<VIP_POLICY.minWilsonLower)
  return deny('weak_accuracy',`Rendimiento VIP insuficiente: ${accuracy}% observado en ${n} pruebas; límite inferior ${percent(lower)}%.`,details);
 if(Math.abs(pred-accuracy)>VIP_POLICY.maxCalibrationGap)
  return deny('poor_calibration',`Probabilidad mal calibrada: promedio estimado ${percent(pred)}% frente al ${accuracy}% observado.`,details);
 if(accuracy-baseline<VIP_POLICY.minBaselineLift)
  return deny('weak_lift',`No supera la frecuencia histórica de referencia por al menos ${VIP_POLICY.minBaselineLift} puntos.`,details);
 if(baseBrier-brier<VIP_POLICY.minBrierSkill)
  return deny('weak_skill','No demuestra suficiente mejora del error probabilístico frente a la referencia histórica.',details);
 const segmentVip=(cohort?.segments||report.segments)?.vip,segmentFree=(cohort?.segments||report.segments)?.free;
 if(Number(segmentVip?.evaluated)>=VIP_POLICY.minMarket&&Number(segmentFree?.evaluated)>=VIP_POLICY.minMarket){
  const gap=100*Number(segmentVip.correct)/Number(segmentVip.evaluated)-100*Number(segmentFree.correct)/Number(segmentFree.evaluated);
  if(!Number.isFinite(gap)||gap<VIP_POLICY.minVipOverFree)
   return deny('weak_vs_free','En el backtest global las VIP no superan suficientemente a las GRATIS; se suspende la categoría premium.',
    {...details,observed_vip_gap:Number.isFinite(gap)?percent(gap):null});
 }
 return {approved:true,code:'approved',reason:'Mercado VIP con muestra y validación retrospectiva suficientes (sin garantía de acierto).',...details};
}
function safeJson(value){try{return JSON.parse(value);}catch{return {};}}
