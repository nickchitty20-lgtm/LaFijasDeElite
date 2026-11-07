import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/mobile-viewport.css',import.meta.url),'utf8');
for(const file of ['index.html','clientes.html','admin.html']){
 test(`la pagina ${file} carga estilos para viewport movil`,()=>{
  const html=readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
  assert.match(html, /mobile-viewport\.css\?v=3\.2\.3/);
 });
}
test('la pagina no se desplaza lateralmente y los menus si',()=>{
 assert.match(css,/overflow-x:\s*clip/);
 assert.match(css,/\.admin-nav, \.client-nav/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/\.ambient \{right:0/);
});
