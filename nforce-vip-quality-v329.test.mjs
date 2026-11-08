import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateVipEvidence,wilsonLower,VIP_POLICY} from '../src/nforce-vip-gate.js';
import {MODEL_VERSION,walkForwardBacktest} from '../src/nforce-model.js';
const now=new Date('2026-11-10T12:00:00.000Z');
const vip={visibility:'vip',evidence_json:{model:{model:MODEL_VERSION},pick:{key:'1X'}}};
const base={model_version:MODEL_VERSION,created_at:now,evaluated:120,metrics_json:{model:MODEL_VERSION,
 by_market:{'1X':{evaluated:60,correct:48,mean_forecast:82,mean_baseline:70,brier:0.15,baseline_brier:0.23}}}};
test('VIP premium: ausencia de validación y versiones antiguas bloquean hasta la aprobación manual',()=>{
 assert.equal(evaluateVipEvidence(vip,null,{asOf:now}).approved,false);
 assert.equal(evaluateVipEvidence({...vip,evidence_json:{model:{model:'viejo'},pick:{key:'1X'}}},base,{asOf:now}).code,'outdated');
 assert.equal(evaluateVipEvidence(vip,{...base,created_at:new Date('2026-10-01T12:00:00Z')},{asOf:now}).code,'stale_backtest');
});
test('VIP premium: exige tamaño de muestra, calibración y ventaja histórica reproducible',()=>{
 const verified=evaluateVipEvidence(vip,base,{asOf:now});
 assert.equal(verified.approved,true,verified.reason);
 assert.ok(verified.wilson_lower>=VIP_POLICY.minWilsonLower);
 assert.equal(evaluateVipEvidence(vip,{...base,metrics_json:{...base.metrics_json,by_market:{'1X':{...base.metrics_json.by_market['1X'],evaluated:12,correct:10}}}},{asOf:now}).code,'low_market_sample');
 assert.equal(evaluateVipEvidence(vip,{...base,metrics_json:{...base.metrics_json,by_market:{'1X':{...base.metrics_json.by_market['1X'],mean_forecast:98}}}},{asOf:now}).code,'poor_calibration');
 assert.equal(evaluateVipEvidence(vip,{...base,metrics_json:{...base.metrics_json,by_market:{'1X':{...base.metrics_json.by_market['1X'],baseline_brier:0.151}}}},{asOf:now}).code,'weak_skill');
 assert.equal(evaluateVipEvidence(vip,{...base,metrics_json:{...base.metrics_json,by_market:{'1X':{...base.metrics_json.by_market['1X'],mean_baseline:78}}}},{asOf:now}).code,'weak_lift');
 assert.equal(evaluateVipEvidence(vip,{...base,metrics_json:{...base.metrics_json,by_market:{'1X':{...base.metrics_json.by_market['1X'],correct:38}}}},{asOf:now}).code,'weak_accuracy');
 const badComparison={...base,metrics_json:{...base.metrics_json,segments:{vip:{evaluated:45,correct:30},free:{evaluated:50,correct:34}}}};
 assert.equal(evaluateVipEvidence(vip,badComparison,{asOf:now}).code,'weak_vs_free');
});
test('no se falsifican métricas: estadísticas antiguas sin skill bloqueadas; GRATIS no afectadas',()=>{
 assert.equal(evaluateVipEvidence({...vip,visibility:'free'},null,{asOf:now}).approved,true);
 const old={...base,metrics_json:{model:MODEL_VERSION,by_market:{'1X':{evaluated:70,correct:55,brier:0.15}}}};
 assert.equal(evaluateVipEvidence(vip,old,{asOf:now}).code,'missing_skill_metrics');
 assert.ok(wilsonLower(1,1)<100);
});
