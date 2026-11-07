import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
const publicHome=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const landing=readFileSync(new URL('../public/landing.js',import.meta.url),'utf8');
const adminJS=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');

test('vista demostrativa es explícitamente ficticia y está en sección administrativa oculta',()=>{
 assert.match(admin,/data-section="performance-demo"/);
 assert.match(admin,/id="performanceDemoPanel" data-panel="performance-demo" hidden/);
 assert.match(admin,/DEMO · SIMULACIÓN/);
 assert.match(admin,/completamente ficticios/);
 assert.match(admin,/Ganadas \(ficticias\)/);
 assert.match(admin,/>12<\/strong>/);
 assert.match(admin,/>3<\/strong>/);
 assert.match(admin,/>80 %<\/strong>/);
 assert.match(admin,/NO REPRESENTA EL RENDIMIENTO DEL SERVICIO/);
});
test('solo dueño puede navegar a la vista de muestra',()=>{
 const allowed=adminJS.match(/const ADMIN_SECTIONS_BY_ROLE=\{([\s\S]*?)\};/);
 assert.ok(allowed);
 const roles=Object.fromEntries([...allowed[1].matchAll(/(owner|general_admin|payments_admin|analyst|moderator):\[([^\]]+)\]/g)].map(x=>[x[1],x[2]]));
 assert.equal(Object.keys(roles).length,5);
 assert.match(roles.owner,/performance-demo/);
 for(const [role,sections] of Object.entries(roles)){if(role!=='owner')assert.doesNotMatch(sections,/performance-demo/);}
 assert.match(adminJS,/allowed\.has\(section\)/);
 assert.match(adminJS,/panel\.dataset\.panel!==section/);
});
test('las cifras DEMO no contaminan el sitio público ni el endpoint real',()=>{
 assert.doesNotMatch(publicHome,/DEMO · SIMULACIÓN|ficticio A|80 %/);
 assert.doesNotMatch(landing,/ficticio A|80 %/);
 const from=server.indexOf("app.get('/api/public/performance'");
 const to=server.indexOf('// Legacy endpoint',from);
 assert.ok(from>=0&&to>from);
 const route=server.slice(from,to);
 assert.match(route,/summaryFromGroups/);
 assert.doesNotMatch(route,/simulad|12 ganad|80 %/i);
});
