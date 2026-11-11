import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateModelVersion,discardedInBuild,discardReason,reasonForDiscard,hasLegacyDistribution,isOlderModelVersion,isOlderBuildVersion,canReopenOldDiscard} from '../src/nforce-candidate-revival.js';
import {MODEL_VERSION} from '../src/nforce-model.js';

const row=(version,status='discarded')=>({status,prediction_id:null,published_at:null,
 evidence_json:JSON.stringify({model:{model:version}})});

test('solo un modelo anterior reconocido permite reevaluar un descarte',()=>{
 assert.equal(MODEL_VERSION,'nforce-poisson-1.6');
 assert.equal(isOlderModelVersion('nforce-poisson-1.5',MODEL_VERSION),true);
 assert.equal(isOlderModelVersion('nforce-poisson-1.4',MODEL_VERSION),true);
 assert.equal(isOlderModelVersion('nforce-poisson-1.6',MODEL_VERSION),false);
 assert.equal(isOlderModelVersion('nforce-poisson-1.7',MODEL_VERSION),false);
 assert.equal(isOlderModelVersion('versión desconocida',MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard(row('nforce-poisson-1.5'),MODEL_VERSION),true);
 assert.equal(canReopenOldDiscard(row('nforce-poisson-1.6'),MODEL_VERSION),false,'Sin pruebas de incompatibilidad no revivir descartes de versiones antiguas');
 assert.equal(canReopenOldDiscard({...row('nforce-poisson-1.6'),evidence_json:JSON.stringify({model:{model:MODEL_VERSION},discarded_in_build:'3.4.1'})},MODEL_VERSION),false);
 assert.equal(isOlderBuildVersion('3.4.0','3.4.1'),true);
 assert.equal(canReopenOldDiscard(row('nforce-poisson-1.7'),MODEL_VERSION),false);
});

test('nunca reabre publicaciones, borradores o descartes sin versión verificable',()=>{
 assert.equal(canReopenOldDiscard({...row('nforce-poisson-1.5'),status:'published'},MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({...row('nforce-poisson-1.5'),status:'draft'},MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({...row('nforce-poisson-1.5'),prediction_id:200},MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({...row('nforce-poisson-1.5'),published_at:'2026-11-08'},MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({status:'discarded',evidence_json:'{}'},MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({status:'discarded',evidence_json:'invalid JSON'},MODEL_VERSION),false);
 assert.equal(candidateModelVersion(row('nforce-poisson-1.5').evidence_json),'nforce-poisson-1.5');
 assert.equal(discardedInBuild(JSON.stringify({discarded_in_build:'3.4.0'})),'3.4.0');
});

test('se reabre incompatibilidad anterior, pero nunca un descarte manual',()=>{
 const old={...row('nforce-poisson-1.5'),evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.5'},discarded_in_build:'3.4.1'})};
 assert.equal(canReopenOldDiscard(old,MODEL_VERSION),true);
 const fromPreviousBuild={...row(MODEL_VERSION),evidence_json:JSON.stringify({model:{model:MODEL_VERSION},discarded_in_build:'3.4.0'})};
 assert.equal(canReopenOldDiscard(fromPreviousBuild,MODEL_VERSION),false);
 const explicitManual={...old,evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.5'},discarded_in_build:'3.4.1',discard_reason:'manual'})};
 assert.equal(canReopenOldDiscard(explicitManual,MODEL_VERSION),false);
 assert.equal(reasonForDiscard(explicitManual,MODEL_VERSION),'version_incompatible');
 const manualValid={...row(MODEL_VERSION),evidence_json:JSON.stringify({model:{model:MODEL_VERSION},discard_reason:'manual'})};
 assert.equal(reasonForDiscard(manualValid,MODEL_VERSION),'manual');
 assert.equal(discardReason(manualValid.evidence_json),'manual');
});

test('las propuestas antiguas del perfil abierto pueden volver solo tras reevaluación',()=>{
 const old={...row(MODEL_VERSION),provider:'nforce-openfootball',visibility:'free'};
 assert.equal(hasLegacyDistribution(old),true);
 assert.equal(canReopenOldDiscard(old,MODEL_VERSION),true);
 const newGold={...old,visibility:'gold'};
 assert.equal(canReopenOldDiscard(newGold,MODEL_VERSION),false);
 const legacyManual={...old,evidence_json:JSON.stringify({model:{model:MODEL_VERSION},discard_reason:'manual'})};
 assert.equal(canReopenOldDiscard(legacyManual,MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({...old,prediction_id:12},MODEL_VERSION),false);
 assert.equal(canReopenOldDiscard({...old,status:'published'},MODEL_VERSION),false);
});


test('una incompatibilidad explícita puede reintentarse en el próximo escaneo sin reinstalar la app',()=>{
 const incompatible={...row('nforce-poisson-1.5'),
  evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.5'},discarded_in_build:'3.5.5',discard_reason:'version_incompatible'})};
 assert.equal(canReopenOldDiscard(incompatible,MODEL_VERSION,'3.5.5'),true);
 const manuallyDiscarded={...incompatible,evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.5'},discarded_in_build:'3.5.2',discard_reason:'manual'})};
 assert.equal(canReopenOldDiscard(manuallyDiscarded,MODEL_VERSION,'3.5.5'),false);
 const newerModel={...row('nforce-poisson-1.7'),evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.7'},discard_reason:'version_incompatible',discarded_in_build:'3.5.1'})};
 assert.equal(canReopenOldDiscard(newerModel,MODEL_VERSION,'3.5.5'),false);
});
