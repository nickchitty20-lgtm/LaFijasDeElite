import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {summaryFromGroups} from '../src/performance-stats.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/landing.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../public/performance.css',import.meta.url),'utf8');

function renderWithStats(groups){
 const stats=summaryFromGroups(groups);
 const nodes=new Map();
 const element=id=>{
  if(!nodes.has(id))nodes.set(id,{value:id==='performancePeriod'||id==='performanceVisibility'?'all':'',innerHTML:'',textContent:'',replaceChildren(){this.innerHTML='';},addEventListener(){}});
  return nodes.get(id);
 };
 const fetch=async url=>({ok:true,async json(){
  if(url==='/api/plans')return {plans:[]};
  if(url==='/api/predictions/teasers')return {predictions:[]};
  if(url.startsWith('/api/public/performance'))return {...stats,recent:[],generated_at:'2026-11-06T12:00:00Z'};
  throw Error('Unexpected request '+url);
 }});
 vm.runInNewContext(js,{document:{getElementById:element},fetch,Intl,Date,Number,String,Math,encodeURIComponent,Array,Error,console});
 return new Promise(resolve=>setImmediate(()=>resolve(nodes)));
}

test('DEMO muestra dos muestras coherentes y siempre rotuladas como SIMULADAS',()=>{
 assert.match(admin,/Comparación VIP frente a Gratis · DEMO/);
 assert.match(admin,/completamente ficticios/);
 assert.match(admin,/>SIMULADO</);
 assert.match(admin,/max="9" value="8"/);
 assert.match(admin,/max="6" value="4"/);
 assert.match(admin,/>88,9 %</);
 assert.match(admin,/>66,7 %</);
 assert.match(admin,/VIP 8 \+ Gratis 4 = 12 ganadas/);
 assert.match(admin,/VIP 1 \+ Gratis 2 = 3 perdidas/);
 assert.match(admin,/SOLO|Solo panel del dueño/);
});

test('web pública muestra comparación lado a lado sin cifras DEMO',()=>{
 assert.match(html,/Pronósticos VIP <em>vs\.<\/em> Gratis/);
 assert.match(html,/id="performanceComparisonHint"/);
 assert.match(html,/id="performanceBreakdown"/);
 assert.match(style,/\.performance-split\.is-vip/);
 assert.match(style,/\.performance-split\.is-free/);
 assert.doesNotMatch(html,/88,9|66,7|12 ganadas|DEMO · SIMULACIÓN/);
});

test('los datos reales VIP y gratis son independientes y se muestran con denominadores',async()=>{
 const nodes=await renderWithStats([
  {visibility:'vip',total:10,won:8,lost:1,void:1},
  {visibility:'free',total:9,won:4,lost:2,void:0}
 ]);
 const result=nodes.get('performanceBreakdown').innerHTML;
 assert.match(result,/Pronósticos VIP/);
 assert.match(result,/Pronósticos GOLD/);
 assert.match(result,/Pronósticos gratuitos/);
 assert.match(result,/En seguimiento/);
 assert.doesNotMatch(result,/88[.,]9 %|66[.,]7 %/);
 assert.match(result,/8 ganadas de 9 decididas/);
 assert.match(result,/4 ganadas de 6 decididas/);
 assert.match(result,/Pendientes <b>3<\/b>/);
 assert.equal((result.match(/class="performance-split /g)||[]).length,3);
 assert.match(nodes.get('performanceComparisonHint').textContent,/30 resultados decididos/);
});

test('sin datos, ambas categorías muestran raya y no inventan victorias',async()=>{
 const nodes=await renderWithStats([]);
 const result=nodes.get('performanceBreakdown').innerHTML;
 assert.equal((result.match(/Sin resultados decididos/g)||[]).length,6);
 assert.match(result,/performance-compare-rate">—<\/strong>/);
 assert.doesNotMatch(result,/88,9 %|66,7 %/);
});

test('v3.5.0 muestra porcentaje cuando la muestra tiene al menos 30 resultados',async()=>{
 const nodes=await renderWithStats([
  {visibility:'vip',total:31,won:24,lost:6,void:0,pending:1},
  {visibility:'free',total:31,won:15,lost:15,void:0,pending:1}
 ]);
 const html=nodes.get('performanceBreakdown').innerHTML;
 assert.match(html,/80 %/);
 assert.match(html,/50 %/);
 assert.match(html,/Perdidas <b>6<\/b>/);
 assert.match(html,/Perdidas <b>15<\/b>/);
});
