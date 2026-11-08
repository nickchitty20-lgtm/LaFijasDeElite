import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('el dueño puede actualizar análisis y los límites protegen la API',()=>{
 const a=src('src/football-automation.js');
 assert.match(a,/refresh-advanced/);assert.match(a,/Solo creador/);
 assert.match(a,/advancedQueries<1/);assert.match(a,/football_advanced_refresh/);
 assert.match(a,/DATE\(created_at\)=UTC_DATE\(\)/);
 assert.match(a,/status='draft'/);
});
test('los paneles cliente y dueño muestran el estudio',()=>{
 assert.match(src('public/clientes.js'),/FijasPickReport\.advanced/);
 assert.match(src('public/app.js'),/FijasPickReport\.advanced/);
 assert.match(src('public/app.js'),/Actualizar lesiones y alineaciones/);
 assert.match(src('public/pick-report.js'),/if\(!p\|\|p\.locked/);
});
test('el backend oculta toda evidencia VIP a clientes sin permiso',()=>{
 const server=src('src/server.js');
 assert.match(server,/if\(p\.visibility==='vip'&&!vip\)return \{id:p\.id,title:p\.title,league:p\.league,match_date:p\.match_date,visibility:'vip',locked:true\}/);
 assert.match(src('src/football-report.js'),/advancedReportForPublic/);
});
test('los adelantos VIP públicos no incorporan el estudio privado',()=>{
 const bridge=src('src/telegram-bridge.js');
 assert.match(bridge,/telegramVipPublicPreview/);assert.match(bridge,/telegramAdvancedSummary/);
 assert.doesNotMatch(bridge.match(/export function telegramVipPublicPreview[\s\S]*?\n\}/)?.[0]||'',/telegramAdvancedSummary/);
});
