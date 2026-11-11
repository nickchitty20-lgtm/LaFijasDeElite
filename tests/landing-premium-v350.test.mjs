import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const landing=readFileSync(new URL('../public/landing.js',import.meta.url),'utf8');
const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const backend=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');

test('dos tarjetas GOLD y VIP habilitan rutas privadas por nivel',()=>{
 const script=landing.slice(0,landing.indexOf('// Fecha real del encuentro'));
 const context={Number,String,Array,encodeURIComponent,console};
 vm.createContext(context);
 vm.runInContext(script,context);
 const content=vm.runInContext("renderMembershipPlans([{id:1,name:'ÉLITE GOLD · 30 días',tier:'gold',duration_days:30,price_pen:59.90},{id:2,name:'VIP Mensual',tier:'vip',duration_days:30,price_pen:149.90},{id:3,name:'VIP Trimestral',tier:'vip',duration_days:90,price_pen:399.90}])",context);
 assert.equal((content.match(/class="plan tier-card/g)||[]).length,2);
 assert.match(content,/ÉLITE <em>GOLD<\/em>/);
 assert.match(content,/por mensaje directo/);
 assert.match(content,/ÉLITE <em>VIP<\/em>/);
 assert.match(content,/149[.,]9/);
 assert.match(content,/data-plan-auth="2"/);
 assert.match(content,/data-plan-auth="1"/);
 assert.equal((content.match(/data-plan-auth=/g)||[]).length,5);
 assert.doesNotMatch(content,/100 %|80 %|resultados garantizados/);
});

test('muestras pequeñas no usan tasas de éxito como reclamo comercial',()=>{
 assert.match(landing,/MIN_PUBLIC_RESULTS=30/);
 assert.match(landing,/En seguimiento/);
 assert.match(home,/sin cifras simuladas/);
 assert.match(home,/incluidos fallos y publicaciones retiradas/);
 assert.match(home,/Los importes GOLD y VIP/);
 assert.match(backend,/APP_VERSION = '3\.5\.7'/);
});
