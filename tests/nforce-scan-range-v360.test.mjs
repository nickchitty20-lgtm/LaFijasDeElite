import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const contents=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('panel permite comparar periodos 7 14 21 30 sin variables de Railway',()=>{
 const html=contents('views/panel.html');
 assert.match(html,/id="footballScanDays"/);
 for(const n of [7,14,21,30])assert.match(html,new RegExp(`value="${n}"`));
 const js=contents('public/app.js');
 assert.match(js,/JSON\.stringify\(\{days\}\)/);
});
test('backend valida rango manual y el diagnóstico refleja los días elegidos',()=>{
 const engine=contents('src/nforce-engine.js');
 assert.match(engine,/scan\(\{manual:true,days\}\)/);
 assert.match(engine,/if\(!Number\.isInteger\(days\)\|\|days<3\|\|days>30\)/);
 assert.match(engine,/lookahead_days:days/);
 assert.match(engine,/const horizon=time\+days\*DAY/);
});
