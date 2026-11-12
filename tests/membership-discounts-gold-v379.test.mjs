import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discountForPlan,validateDiscount} from '../src/plan-discounts.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base={price_pen:'249.90',discount_active:1,discount_kind:'percent',discount_amount:'20',discount_reason:'Aniversario',discount_starts_at:'2026-11-10',discount_ends_at:'2026-11-20'};
test('descuento porcentual usa centavos y una ventana de vigencia',()=>{
 const p=discountForPlan(base,'2026-11-12');assert.equal(p.price_pen,199.92);assert.equal(p.original_price_pen,249.9);assert.equal(p.discount.saving_pen,49.98);
 assert.equal(discountForPlan(base,'2026-11-09').price_pen,249.9);
 assert.equal(discountForPlan(base,'2026-11-21').discount,null);
 assert.equal(discountForPlan({...base,discount_active:0},'2026-11-12').price_pen,249.9);
});
test('descuento fijo jamás crea precio negativo o gratuidad total',()=>{
 assert.equal(discountForPlan({...base,discount_kind:'fixed',discount_amount:'49.95'},'2026-11-12').price_pen,199.95);
 validateDiscount(249.9,'fixed',10);validateDiscount(249.9,'percent',15);
 for(const [kind,amount] of [['fixed',300],['fixed',249.9],['percent',95],['percent',0],['fixed',0.001],['unknown',1]]){
  assert.throws(()=>validateDiscount(249.9,kind,amount));
 }
});
test('precio promocional se toma al crear la solicitud, no recalcula recibos pasados',()=>{
 const source=read('src/server.js');
 assert.match(source,/discountForPlan\(plan\)\.price_pen,p\.data\.reference/);
 assert.match(source,/plan=\{\.\.\.quoted,\.\.\.discountForPlan\(quoted\)\}/);
 assert.match(source,/\['owner'\]|req\.admin\.role!=='owner'/);
 assert.match(read('src/init-db.js'),/CREATE TABLE IF NOT EXISTS plan_discounts/);
});
test('GOLD manual permite renovación del mismo nivel y preserva canal VIP',()=>{
 const code=read('src/server.js');const ui=read('public/app.js');
 assert.match(code,/tier IN \('gold','vip'\) LIMIT 1/);
 assert.match(code,/p\.tier=\(SELECT tier FROM plans WHERE id=\?\)/);
 assert.match(code,/manualVipPeriod\(last\?\.last_end/);
 assert.match(code,/if\(plan\.tier==='vip'\)await enqueueVipActivation/);
 assert.match(code,/plan\.tier\.toUpperCase\(\)/);
 assert.match(ui,/p\.active && \['vip','gold'\]\.includes\(p\.tier\)/);
 assert.match(ui,/discountPlanSelect/);
 assert.match(read('public/landing.js'),/Compara las membresías/);
});
