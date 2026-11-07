import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readCookie,csrfForCookie,verifyCsrfHeader,evaluateApiRequest} from '../src/request-security.js';

const secret='un-secreto-muy-largo-para-pruebas-123456789';
const origin='https://fijas.example';
const session='jwt-placeholder-for-security-tests';
const req=(overrides={})=>({method:'POST',requestOrigin:origin,secret,sessionCookie:session,
 headers:{'content-type':'application/json',origin,'sec-fetch-site':'same-origin',
 'x-csrf-token':csrfForCookie(session,secret)},...overrides});

test('extracción de cookie de sesión y token ligado a sesión',()=>{
 assert.equal(readCookie('a=1; fijas_session=jwt%2Eabc; b=2'),'jwt.abc');
 assert.equal(readCookie('other=1'),null);
 assert.equal(readCookie('fijas_session=%'),null);
 assert.equal(verifyCsrfHeader(session,secret,csrfForCookie(session,secret)),true);
 assert.equal(verifyCsrfHeader('otro',secret,csrfForCookie(session,secret)),false);
 assert.equal(verifyCsrfHeader(session,secret,'f'.repeat(64)),false);
 assert.equal(verifyCsrfHeader(session,secret,'invalid'),false);
});

test('acepta mutación JSON del mismo origen con token correcto',()=>{
 assert.deepEqual(evaluateApiRequest(req()),{ok:true});
 assert.deepEqual(evaluateApiRequest(req({method:'PATCH'})),{ok:true});
 assert.deepEqual(evaluateApiRequest(req({method:'GET',headers:{origin:'https://otro.example'}})),{ok:true});
});

test('rechaza CSRF con cookie sin token o token de otra sesión',()=>{
 for(const change of [
  {'x-csrf-token':undefined},
  {'x-csrf-token':csrfForCookie('jwt-otro',secret)},
  {'x-csrf-token':'bad'}
 ]){
  const result=evaluateApiRequest(req({headers:{...req().headers,...change}}));
  assert.equal(result.status,403);assert.equal(result.code,'CSRF_INVALID');
 }
});

test('rechaza solicitudes cruzadas e intentos de formularios clásicos',()=>{
 const cases=[
  {headers:{...req().headers,origin:'https://attacker.example'}},
  {headers:{...req().headers,'sec-fetch-site':'cross-site'}},
  {headers:{...req().headers,'sec-fetch-site':'same-site'}},
  {headers:{...req().headers,'content-type':'text/plain'}},
  {headers:{...req().headers,'content-type':'application/x-www-form-urlencoded'}},
  {headers:{...req().headers,origin:undefined,referer:undefined,'sec-fetch-site':undefined}},
  {headers:{...req().headers,origin:undefined,referer:'https://attacker.example/form','sec-fetch-site':undefined}},
 ];
 for(const changes of cases){const result=evaluateApiRequest(req(changes));assert.equal(result.ok,false,JSON.stringify(changes));assert.ok([403,415].includes(result.status));}
});

test('login sin cookie admite llamadas JSON de cliente de API; bloquea solicitudes entre sitios',()=>{
 const anonymous=req({sessionCookie:null,headers:{'content-type':'application/json',origin}});
 assert.equal(evaluateApiRequest(anonymous).ok,true);
 assert.equal(evaluateApiRequest(req({sessionCookie:null,headers:{'content-type':'application/json','sec-fetch-site':'cross-site'}})).status,403);
});

test('sin Origin permite el propio documento con Referer exacto o Fetch Metadata mismo origen',()=>{
 const h={...req().headers,origin:undefined,referer:`${origin}/clientes.html`,'sec-fetch-site':undefined};
 assert.equal(evaluateApiRequest(req({headers:h})).ok,true);
 assert.equal(evaluateApiRequest(req({headers:{...h,referer:undefined,'sec-fetch-site':'same-origin'}})).ok,true);
});

test('las tres interfaces cargan el guard antes de sus scripts y el backend lo valida',()=>{
 const f=name=>readFileSync(new URL(name,import.meta.url),'utf8');
 for(const [html,script] of [['../public/index.html','landing-auth-v327.js'],['../public/clientes.html','clientes.js'],['../views/panel.html','app.js']]){
  const source=f(html);assert.ok(source.indexOf('request-guard.js?v=3.2.9')>=0);
  assert.ok(source.indexOf('request-guard.js?v=3.2.9')<source.indexOf(`/${script}?`));
 }
 for(const script of ['../public/landing-auth-v327.js','../public/clientes.js','../public/app.js'])
  assert.match(f(script),/FijasSecurity\.apiFetch/);
 const server=f('../src/server.js');
 assert.match(server,/evaluateApiRequest\(/);assert.match(server,/app\.get\('\/api\/security\/csrf'/);
 assert.match(server,/app\.get\('\/panel',authenticate/);
 assert.match(server,/privilegedWriteLimit/);assert.match(server,/frameAncestors/);
});

test('el guard del navegador nunca envía el token a hosts externos',async()=>{
 const calls=[];
 const window={location:{origin},FijasSecurity:null};
 const ctx={window,URL,Headers,Error,fetch:async(url,opts)=>{
  calls.push([url,opts]);
  if(url==='/api/security/csrf')return {ok:true,json:async()=>({csrfToken:'abc123'})};
  return {ok:true,json:async()=>({ok:true})};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/request-guard.js',import.meta.url),'utf8'),ctx);
 await assert.rejects(window.FijasSecurity.apiFetch('https://evil.example/api/admin/predictions',{method:'POST'}),/Ruta de API no permitida/);
 assert.equal(calls.length,0);
 await window.FijasSecurity.apiFetch('/api/admin/predictions',{method:'POST',body:'{}'});
 assert.equal(calls.length,2);
 assert.equal(calls[1][0],'/api/admin/predictions');
 assert.equal(calls[1][1].headers.get('X-CSRF-Token'),'abc123');
 assert.equal(calls[1][1].credentials,'same-origin');
});
