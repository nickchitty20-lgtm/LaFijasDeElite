import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/football-engine.css',import.meta.url),'utf8');
const engine=readFileSync(new URL('../src/nforce-engine.js',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../src/football-automation.js',import.meta.url),'utf8');
test('El resultado de aprobar y publicar está fuera del contenedor que se reemplaza',()=>{
 assert.match(html,/id="footballActionResult"/);
 assert.match(js,/showFootballActionResult\(result/);
 assert.match(js,/await loadFootballEngine\(\)/);
 assert.match(js,/response\.reason/);
 assert.match(css,/#footballActionResult\[data-state="error"\]/);
});
test('Se indica el plazo real de cada motor sin alterar el rechazo del servidor',()=>{
 assert.match(js,/isOwnEngine\?20:10/);
 assert.match(js,/Plazo cerrado:/);
 assert.match(js,/button\.disabled=true/);
 assert.match(engine,/kickoff\.getTime\(\)<now\(\)\.getTime\(\)\+20\*60000/);
 assert.match(legacy,/when\.getTime\(\)<=Date\.now\(\)\+10\*60000/);
});
test('Se informa por separado el estado web y telegram y los errores de publicación',()=>{
 assert.match(js,/Publicado en la web/);
 assert.match(js,/Telegram: \$\{telegram\}/);
 assert.match(js,/No se pudo \$\{action/);
 assert.match(js,/Publicando y contactando Telegram/);
});
