import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../public/', import.meta.url);
const landing = readFileSync(new URL('landing-auth-v327.css', root), 'utf8');
const client = readFileSync(new URL('client-premium-v327.css', root), 'utf8');
const index = readFileSync(new URL('index.html', root), 'utf8');
const customer = readFileSync(new URL('clientes.html', root), 'utf8');
test('el modal movil se ancla arriba y no crea un hueco por centrado', () => {
 assert.match(landing, /@media\(max-width:690px\)\{\.fe-auth-overlay\{[^}]*align-items:start/);
 assert.match(landing, /\.fe-auth-dialog\{[^}]*max-height:calc\(100dvh - 24px\)/);
 assert.match(landing, /@media\(min-width:691px\) and \(max-height:680px\)/);
});
test('la pantalla cliente abre el formulario sin intro alto en movil', () => {
 assert.match(client, /@media\(max-width:750px\)[\s\S]*body\.auth-page:not\(\.client-logged-in\) \.auth-intro\{display:none!important\}/);
});
test('el CSS corregido cambia de version para invalidar la cache', () => {
 assert.match(index, /landing-auth-v327\.css\?v=3\.2\.7\.1/);
 assert.match(customer, /client-premium-v327\.css\?v=3\.2\.7\.1/);
});
