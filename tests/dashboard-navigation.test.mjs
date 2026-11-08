import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/clientes.html',import.meta.url),'utf8');
const adminJS=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const customerJS=readFileSync(new URL('../public/clientes.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
test('el panel de dueño conserva los 11 módulos y el analizador deportivo',()=>{
 for(const key of ['overview','predictions','football','payments','finance','vip','plans','customers','staff','audit','telegram','mytelegram']){
  assert.match(html,new RegExp(`data-section="${key}"`));
  assert.match(html,new RegExp(`data-panel="${key}"`));
 }
});
test('el panel de cliente conserva sus 6 módulos',()=>{
 for(const key of ['overview','predictions','membership','payments','telegram','notices']){
  assert.match(client,new RegExp(`data-client-tab="${key}"`));
  assert.match(client,new RegExp(`data-client-panel="${key}"`));
 }
});
test('permisos por cargo desacoplados del estado hidden del panel',()=>{
 assert.match(adminJS,/ADMIN_SECTIONS_BY_ROLE/);
 assert.match(adminJS,/allowed\.has\(button\.dataset\.section\)/);
 assert.doesNotMatch(adminJS,/button\.hidden=Boolean\(access && \$\(access\)\.hidden\)/);
});
test('errores secundarios no cierran la sesión administrativa',()=>{
 assert.match(adminJS,/Promise\.allSettled\(jobs\)/);
 assert.match(customerJS,/Promise\.allSettled\(\[loadCustomerPicks\(\)/);
});
test('la version y recursos del dashboard evitan caches cruzadas',()=>{
 assert.match(server,/APP_VERSION = '3\.3\.6'/);
 assert.match(server,/Cache-Control/);
 assert.match(html,/app\.js\?v=3\.3\.6/);
 assert.match(client,/clientes\.js\?v=3\.3\.2/);
});
test('sigue presente la desvinculacion sin expulsion',()=>{
 assert.match(client,/telegramUnlinkButton/);
 assert.match(html,/telegramOwnerUnlinkForm/);
});
