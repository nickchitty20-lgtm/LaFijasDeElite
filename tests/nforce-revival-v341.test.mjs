import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateModelVersion,discardedInBuild,isOlderModelVersion,isOlderBuildVersion,canReopenOldDiscard} from '../src/nforce-candidate-revival.js';
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
 assert.equal(canReopenOldDiscard(row('nforce-poisson-1.6'),MODEL_VERSION),true,'Un descarte antiguo de la app 3.4.0 también se puede recalcular');
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

test('un descarte estampado en esta versión no se reabre aunque el modelo sea anterior',()=>{
 const old={...row('nforce-poisson-1.5'),evidence_json:JSON.stringify({model:{model:'nforce-poisson-1.5'},discarded_in_build:'3.4.1'})};
 assert.equal(canReopenOldDiscard(old,MODEL_VERSION),false);
 const fromPreviousBuild={...row(MODEL_VERSION),evidence_json:JSON.stringify({model:{model:MODEL_VERSION},discarded_in_build:'3.4.0'})};
 assert.equal(canReopenOldDiscard(fromPreviousBuild,MODEL_VERSION),true);
});
