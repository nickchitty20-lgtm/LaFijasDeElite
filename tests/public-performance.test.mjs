import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicPerformanceFilters,performanceWhere,summaryFromGroups,publicRecentResults} from '../src/performance-stats.js';

const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const landing=readFileSync(new URL('../public/landing.js',import.meta.url),'utf8');
const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('sin registros no se inventa un porcentaje de acierto',()=>{
 const stats=summaryFromGroups([]);
 assert.deepEqual(stats.overall,{total:0,won:0,lost:0,void:0,pending:0,decided:0,archived:0,source_checked:0,manual_checked:0,accuracy:null});
 assert.equal(stats.by_visibility.vip.accuracy,null);
});
test('el acierto excluye anulados y pendientes',()=>{
 const s=summaryFromGroups([{visibility:'free',total:12,won:3,lost:2,void:2,archived:1}]);
 assert.equal(s.overall.accuracy,60);
 assert.equal(s.overall.pending,5);
 assert.equal(s.overall.decided,5);
 assert.equal(s.overall.archived,1);
});
test('la suma separada gratis y VIP incluye las retiradas y conserva el denominador',()=>{
 const s=summaryFromGroups([{visibility:'vip',total:4,won:1,lost:2,void:0,archived:2},{visibility:'free',total:5,won:2,lost:1,void:1,archived:1}]);
 assert.equal(s.overall.total,9);
 assert.equal(s.overall.won,3);
 assert.equal(s.overall.lost,3);
 assert.equal(s.overall.void,1);
 assert.equal(s.overall.pending,2);
 assert.equal(s.overall.archived,3);
 assert.equal(s.overall.accuracy,50);
 assert.equal(s.by_visibility.vip.accuracy,33.3);
 assert.equal(s.by_visibility.free.accuracy,66.7);
});
test('filtros validados protegen contra SQL injection',()=>{
 assert.deepEqual(publicPerformanceFilters({period:'30d',visibility:'vip'}),{period:'30d',visibility:'vip'});
 assert.deepEqual(publicPerformanceFilters({period:"30d; DROP TABLE predictions",visibility:"vip' OR 1=1"}),{period:'all',visibility:'all'});
 const clause=performanceWhere({period:'90d',visibility:'free'});
 assert.deepEqual(clause.params,[90,'free']);
 assert.match(clause.sql,/published_at IS NOT NULL/);
 assert.doesNotMatch(clause.sql,/archived_at/);
});
test('el historial público no expone selecciones, cuotas ni análisis VIP',()=>{
 const recent=publicRecentResults([{id:15,title:'Equipo A vs B',league:'Liga',visibility:'vip',outcome:'lost',match_date:'2026-11-04T18:00:00Z',archived_at:'2026-11-05',selection:'Victoria B',odds:'6.5',analysis:'Secreto',market:'Over 2.5',telegram_id:123}]);
 assert.deepEqual(Object.keys(recent[0]).sort(),['id','title','league','visibility','outcome','match_date','withdrawn','result_source','score'].sort());
 assert.equal(recent[0].withdrawn,true);
 assert.equal(recent[0].outcome,'lost');
});
test('el endpoint público no consulta usuarios ni expone el texto de una fija VIP',()=>{
 const start=server.indexOf("app.get('/api/public/performance'");
 const end=server.indexOf('// Legacy endpoint',start);
 assert.ok(start>=0&&end>start);
 const route=server.slice(start,end);
 assert.doesNotMatch(route,/p\.selection|p\.analysis|p\.odds/);
 assert.match(route,/p\.archived_at IS NOT NULL/);
 assert.match(route,/GROUP BY p\.visibility/);
 assert.match(route,/publicRecentResults/);
});
test('corrección después del cierre requiere dueño, motivo y auditoría',()=>{
 const start=server.indexOf("app.patch('/api/admin/predictions/:id/outcome'");
 const end=server.indexOf('// Owner-only logical deletion',start);
 const route=server.slice(start,end);
 assert.match(route,/req\.admin\.role!=='owner'/);
 assert.match(route,/!parsed\.data\.reason/);
 assert.match(route,/prediction_outcome_corrected/);
 assert.match(route,/previous/);
 assert.match(route,/FOR UPDATE/);
});
test('página principal muestra estadísticas sin valores de muestra',()=>{
 assert.match(home,/id="rendimiento"/);
 assert.match(home,/id="performanceStats"/);
 assert.match(home,/id="performancePeriod"/);
 assert.match(home,/id="performanceVisibility"/);
 assert.match(landing,/fetch\(`\/api\/public\/performance/);
 assert.match(home,/id="performanceQuickSummary"/);
 assert.match(home,/class="performance-method"/);
 assert.doesNotMatch(home,/Fuente indicada al consultar el historial/);
 assert.match(landing,/Cotejos automáticos/);
 assert.match(landing,/Registro manual/);
 assert.match(home,/registros deportivos públicos de terceros, no oficiales/);
});
