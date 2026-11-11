/** Owner-only, read-only VIP funnel diagnostics.
 * Never changes risk thresholds, validation records, or publication eligibility.
 * Counts by market are NOT counts of different fixtures.
 */
import {evaluateVipEvidence} from './nforce-vip-gate.js';
import {canAutoPublishCandidate} from './football-publication-policy.js';
import {MODEL_VERSION} from './nforce-model.js';

export const VIP_REJECTION_DESCRIPTIONS=Object.freeze({
 insufficient_recent_evidence:'Historial reciente, local/visitante o calidad de muestra insuficientes',
 missing_goal_sensitivity:'Faltan datos para probar cambios en los goles esperados',
 vip_1x2_margin:'El favorito 1X2 no supera la diferencia mínima',
 inconsistent_probability:'La estimación no coincide con el cálculo de escenarios',
 weak_nominal_edge:'Probabilidad estimada o diferencia histórica insuficiente',
 fragile_prediction:'El pronóstico cambia demasiado al variar los supuestos',
 invalid_market:'Mercado no evaluable'
});
export const VIP_VALIDATION_DESCRIPTIONS=Object.freeze({
 outdated:'Modelo antiguo: reanalizar la propuesta',
 missing_backtest:'Falta validar el modelo actual',
 stale_backtest:'Validación retrospectiva vencida',
 low_overall_sample:'No hay suficientes partidos retrospectivos',
 low_market_sample:'No hay suficientes selecciones del mercado',
 missing_context_backtest:'Falta validación específica del fútbol internacional',
 low_context_sample:'No hay suficientes partidos retrospectivos en el grupo de clubes/selecciones',
 invalid_metrics:'Métricas retrospectivas inválidas',
 weak_accuracy:'Rendimiento histórico insuficiente',
 poor_calibration:'La probabilidad estimada no está bien calibrada',
 weak_lift:'No supera suficientemente la frecuencia histórica de referencia',
 weak_skill:'No mejora suficientemente el error probabilístico de referencia',
 weak_vs_free:'No supera al perfil de acceso general',
 missing_skill_metrics:'Faltan métricas de calibración y referencia'
});
const read=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
const count=(value)=>Math.max(0,Number(value)||0);

export function summarizeVipScan(scan){
 if(!scan||scan.ok!==true)return {available:false,reason:scan?.error||'Sin un escaneo completo en este proceso'};
 const rejection=scan.vip_rejections_by_market_reason||{};
 return {available:true,fixtures_in_window:count(scan.fixtures_in_window),modeled:count(scan.modeled),
  eligible_vip:count(scan.eligible_by_category?.vip),eligible_gold:count(scan.eligible_by_category?.gold),
  insufficient_history:count(scan.insufficient_history),
  model_missing_examples:Array.isArray(scan.model_missing_examples)?scan.model_missing_examples.slice(0,12):[],
  rejected:count(scan.below_filters),
  rejection_by_market:Object.entries(rejection).map(([code,total])=>({code,label:VIP_REJECTION_DESCRIPTIONS[code]||code,count:count(total)}))
    .sort((a,b)=>b.count-a.count),
  sample_gap_fixtures:count(scan.vip_sample_gap_fixtures),
  sample_gaps_by_requirement:Object.entries(scan.vip_sample_gaps_by_requirement||{})
    .map(([code,total])=>({code,count:count(total)})).sort((a,b)=>b.count-a.count),
  sample_gap_examples:Array.isArray(scan.vip_sample_gap_examples)?scan.vip_sample_gap_examples.slice(0,10):[],
  // Only models available for analysis can become VIP. Each model tests nine
  // markets, so do NOT add per-market rejection counts as unique matches.
  meaning:'Los rechazos por mercado pueden repetirse dentro de un mismo partido. No son apuestas ni resultados.'};
}
export function summarizeVipDatabase({rows=[],total={},validation=null,scan=null,asOf=new Date(),telegramReady=false}={}){
 const summary={model:MODEL_VERSION,
  total_vip_drafts:count(total.vip_drafts),total_vip_published:count(total.vip_published),total_gold_drafts:count(total.gold_drafts),
  total_drafts:count(total.total_drafts),drafts_checked:0,publishable_by_model:0,validated:0,
  blocked_by_model:0,blocked_by_backtest:0,validation_reasons:{},examples:[],
  telegram_vip_ready:Boolean(telegramReady),scan:summarizeVipScan(scan),
  backtest:validation?{evaluated:count(validation.evaluated),created_at:validation.created_at,
   model_version:validation.model_version,by_context:Object.fromEntries(Object.entries(read(validation.metrics_json).by_context||{})
    .map(([key,group])=>[key,{evaluated:count(group?.evaluated),by_market:Object.entries(group?.by_market||{})
     .map(([market,value])=>({market,evaluated:count(value?.evaluated),accuracy:value?.accuracy??null}))}])),
   by_market:Object.entries(read(validation.metrics_json).by_market||{})
    .map(([key,value])=>({market:key,evaluated:count(value?.evaluated),accuracy:value?.accuracy??null}))}:null};
 for(const row of rows){
  if(row.status!=='draft'||row.visibility!=='vip')continue;
  summary.drafts_checked++;
  const modelOk=canAutoPublishCandidate(row);
  if(!modelOk){summary.blocked_by_model++;if(summary.examples.length<5)summary.examples.push({match:`${row.home_team} vs ${row.away_team}`,market:row.market,code:'model_changed',reason:'El modelo o selección del borrador necesita actualizarse'});continue;}
  summary.publishable_by_model++;
  const result=evaluateVipEvidence(row,validation,{asOf});
  if(result.approved)summary.validated++;
  else{
   summary.blocked_by_backtest++;
   summary.validation_reasons[result.code]=(summary.validation_reasons[result.code]||0)+1;
   if(summary.examples.length<5)summary.examples.push({match:`${row.home_team} vs ${row.away_team}`,market:row.market,code:result.code,reason:result.reason});
  }
 }
 const scanData=summary.scan;
 if(summary.total_vip_drafts>summary.drafts_checked)summary.partial=true;
 if(summary.total_vip_drafts>0&&summary.validated>0){
  summary.diagnosis=telegramReady?'Hay VIP validadas pendientes de revisión; comprueba también el horario del partido antes de publicar.':'Hay VIP validadas, pero falta configurar el canal VIP de Telegram.';
  summary.next_step=telegramReady?'Revisar borradores VIP y comprobar horario/estado actual antes de publicar.':'Configurar TELEGRAM_BOT_TOKEN y TELEGRAM_VIP_CHAT_ID en Railway.';
 }else if(summary.total_vip_drafts>0){
  summary.diagnosis='Hay borradores VIP, pero todavía no pasan la comprobación de versión del modelo o el backtest exigido.';
  summary.next_step='Ejecutar Validar modelo; si falla, revisar los motivos por mercado antes de intentar publicar.';
 }else if(!scanData.available){
  summary.diagnosis='No hay borradores VIP y falta un escaneo reciente con diagnóstico de filtros.';
  summary.next_step='Importar datos deportivos y ejecutar Analizar ahora (21 días).';
 }else if(scanData.fixtures_in_window===0){
  summary.diagnosis='No se detectaron partidos futuros con horario suficiente en la última búsqueda.';
  summary.next_step='Revisar Fuentes deportivas y los partidos importados.';
 }else if(scanData.modeled===0){
  summary.diagnosis='Hay partidos, pero ninguno tiene suficiente historial para calcular el modelo.';
  summary.next_step='Revisar el histórico por liga y equipo; ampliar calendario no crea historial.';
 }else if(scanData.eligible_vip===0){
  summary.diagnosis='Se calcularon modelos, pero ninguno alcanzó los filtros de riesgo VIP.';
  summary.next_step='Consulta qué muestra falta a cada partido; importa histórico ampliado y reanaliza. No se rebajan los filtros VIP.';
 }else{
  summary.diagnosis='El escaneo identificó VIP, pero no hay borradores VIP actualmente activos: pueden estar publicados, descartados o haber cambiado al reanalizar.';
  summary.next_step='Revisar propuestas publicadas, descartadas y pendientes.';
 }
 return summary;
}
