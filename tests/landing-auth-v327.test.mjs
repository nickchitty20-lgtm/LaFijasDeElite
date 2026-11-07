import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(file)=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const index=source('index.html');
const landing=source('landing.js');
const auth=source('landing-auth-v327.js');
const client=source('clientes.html');
const clientJs=source('clientes.js');
const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
test('La portada presenta acceso y registro sin redirección previa',()=>{
 assert.match(index,/id="landingAuth"[^>]+hidden/);
 assert.match(index,/role="dialog" aria-modal="true"/);
 assert.match(index,/data-auth-open="login"/);
 assert.match(index,/data-auth-open="register"/);
 assert.match(auth,/event\.preventDefault\(\)/);
 for(const form of ['landingSignin','landingRegister','landingForgot'])assert.match(index,new RegExp(`id="${form}"`));
});
test('Los planes preservan elección y navegan a pagos solo tras autenticación',()=>{
 assert.match(landing,/data-plan-auth=/);
 assert.match(auth,/selectedPlan = safePlanId/);
 assert.match(auth,/api\('\/api\/login'/);
 assert.match(auth,/destination\(selectedPlan\)/);
 assert.match(clientJs,/\?\s*'payments'\s*:\s*'overview'/);
 assert.match(clientJs,/new URLSearchParams\(location\.search\)\.get\('plan'\)/);
});
test('Registro, inicio y recuperación reutilizan endpoints del servidor',()=>{
 assert.match(auth,/api\('\/api\/customers\/register'/);
 assert.match(auth,/api\('\/api\/customers\/forgot-password'/);
 assert.match(auth,/api\('\/api\/login'/);
 assert.match(server,/app\.post\('\/api\/customers\/register'/);
 assert.match(server,/app\.post\('\/api\/login'/);
 assert.match(server,/app\.post\('\/api\/customers\/forgot-password'/);
});
test('El panel cliente conserva secciones y PayPal/reset; el CSS se versiona',()=>{
 for(const section of ['overview','predictions','membership','payments','telegram','notices'])assert.match(client,new RegExp(`data-client-panel="${section}"`));
 assert.match(client,/client-premium-v327\.css\?v=3\.2\.7/);
 assert.match(index,/landing-auth-v327\.css\?v=3\.2\.7/);
 assert.match(index,/landing-auth-v327\.js\?v=3\.2\.7/);
 assert.match(clientJs,/pendingPayPalReturn/);
 assert.match(clientJs,/reset_token/);
 assert.match(server,/new URL\('\/clientes\.html',process\.env\.PUBLIC_BASE_URL\)/);
});
