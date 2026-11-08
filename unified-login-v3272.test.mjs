import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const raw=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const index=raw('../public/index.html'), landing=raw('../public/landing-auth-v327.js');
const client=raw('../public/clientes.js'), admin=raw('../views/panel.html');
const adminJs=raw('../public/app.js'), server=raw('../src/server.js');
test('se elimina el enlace administrativo publico y el archivo admin.html',()=>{
 assert.doesNotMatch(index,/admin\.html|>Administración<|href="\/panel"/);
 assert.equal(existsSync(new URL('../public/admin.html',import.meta.url)),false);
});
test('todo acceso de la portada usa el mismo /api/login con rol decidido por servidor',()=>{
 assert.match(landing,/api\('\/api\/login'/);
 assert.match(landing,/session\.accountType === 'admin' \? '\/panel'/);
 assert.match(landing,/result\.accountType === 'admin' \? '\/panel'/);
 assert.match(client,/r\.accountType==='admin'\)\{location\.replace\('\/panel'\)/);
 assert.match(client,/session\.accountType==='admin'\)\{location\.replace\('\/panel'\)/);
 assert.doesNotMatch(client+landing,/admin\.html/);
});
test('panel privado se sirve solo con authenticate y no ofrece login alternativo',()=>{
 assert.match(server,/app\.get\('\/panel',authenticate,/);
 assert.match(server,/sendFile\(path\.resolve\(root,'\.\.\/views\/panel\.html'\)\)/);
 assert.doesNotMatch(admin,/(id="loginForm"|id="setupForm"|id="showSetup")/);
 assert.match(admin,/id="dashboard"/);
 assert.doesNotMatch(adminJs,/api\/auth\/login|refreshSetup|loginForm/);
 assert.match(server,/app\.post\('\/api\/login'/);
 assert.match(server,/app\.get\('\/api\/admin\/me',authenticate/);
});
test('cierre de sesion administrativa vuelve a portada sin mostrar formulario propio',()=>{
 assert.match(adminJs,/api\/logout/);
 assert.match(adminJs,/location\.replace\('\/'\)/);
});
