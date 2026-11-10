import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('panel and server identify the matching build and prevent cached UI ambiguity',()=>{
 assert.match(source('src/server.js'),/const APP_VERSION = '3\.3\.9'/);
 assert.match(source('views/panel.html'),/id="adminBuildVersion"/);
 assert.match(source('views/panel.html'),/app\.js\?v=3\.3\.9/);
 assert.match(source('public/app.js'),/const ADMIN_PANEL_BUILD='3\.3\.9'/);
 assert.match(source('public/app.js'),/Versión distinta:/);
 assert.match(source('src/server.js'),/X-Fijas-Build/);
});
test('admin prediction API gives explicit UTC date and fallback does not invent a live state',()=>{
 assert.match(source('src/server.js'),/DATE_FORMAT\(match_date,'%Y-%m-%dT%H:%i:%sZ'\) AS match_kickoff_utc/);
 const js=source('public/app.js');
 const match=js.match(/function fallbackAdminKickoff\(value\)\{[\s\S]*?\n\}/);
 assert.ok(match);
 const document={createElement(){return {className:'',textContent:''};}};
 const ctx={document,Intl,Date};vm.createContext(ctx);
 const fn=vm.runInContext('('+match[0]+')',ctx);
 assert.match(fn('2026-11-08T16:15:00Z').textContent,/11:15.*Perú.*sin confirmar en vivo/);
 assert.match(fn(null).textContent,/horario no disponible/);
});
