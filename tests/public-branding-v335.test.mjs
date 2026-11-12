import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicAnalysisText} from '../src/public-branding.js';

const legacy=['Football','Intelligence'].join(' ');
test('legacy analysis branding is normalized without changing statistical claims',()=>{
 const original=`N-FORCE ${legacy} · Modelo estadístico v1.4. Probabilidades estimadas SIN CALIBRAR; datos históricos.`;
 const result=publicAnalysisText(original);
 assert.match(result,/^N-FORCE · Modelo estadístico/);
 assert.match(result,/SIN CALIBRAR/);
 assert.doesNotMatch(result,/intelligence/i);
});

test('publicly served page and engine strings omit former marketing terms',()=>{
 for(const file of ['public/index.html','public/clientes.html','views/panel.html','public/app.js','src/nforce-model.js','src/nforce-engine.js']){
  const contents=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
  assert.ok(!contents.toLowerCase().includes(legacy.toLowerCase()),`${file} still contains outdated branding`);
 }
 assert.match(readFileSync(new URL('../views/panel.html',import.meta.url),'utf8'),/Panel v3\.7\.9/);
});
