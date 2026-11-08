import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const landing=readFileSync(new URL('../public/landing.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/performance.css',import.meta.url),'utf8');

test('portada no muestra lenguaje técnico de origen en la primera impresión',()=>{
 const front=html.slice(0,html.indexOf('<section class="metrics'));
 assert.doesNotMatch(front,/OpenFootball|fuente/ig);
 assert.match(front,/VIP frente a Gratis/);
 assert.match(front,/performanceQuickSummary/);
});
test('metodología sigue contando con transparencia el origen comunitario no oficial y registros manuales',()=>{
 assert.match(html,/<details class="performance-method">/);
 assert.match(html,/registros deportivos públicos de terceros, no oficiales/);
 assert.doesNotMatch(html,/OpenFootball|API-Football|API-Sports/gi);
 assert.match(html,/registros manuales los introduce nuestro equipo/);
 assert.match(css,/performance-method summary:focus-visible/);
});
test('las cifras no son ficticias ni altera el contador de resultados',()=>{
 assert.match(landing,/fetch\(`\/api\/public\/performance/);
 assert.match(landing,/perfNumber\(v\.source_checked\)/);
 assert.match(landing,/perfNumber\(v\.manual_checked\)/);
 assert.match(landing,/p\.withdrawn/);
 assert.doesNotMatch(landing,/OpenFootball no es una fuente oficial/);
});
