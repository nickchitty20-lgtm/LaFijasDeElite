import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicAnalysisText} from '../src/public-branding.js';
import {telegramFreeAutoPost,telegramVipPost} from '../src/telegram-bridge.js';
import {publicRecentResults} from '../src/performance-stats.js';

const raw=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const names=/OpenFootball|API[- ]?Football|API[- ]?Sports|football-data\.org/i;
test('portada, metodología y dashboard visible no muestran nombres de proveedores',()=>{
 for(const path of ['../public/index.html','../public/admin.html','../public/app.js'])
  assert.doesNotMatch(raw(path),names, path);
 assert.match(raw('../public/index.html'),/terceros, no oficiales/);
 assert.match(raw('../public/index.html'),/registros manuales los introduce nuestro equipo/);
 assert.match(raw('../src/server.js'),/metodology|methodology/);
});
test('texto antiguo guardado para clientes conserva matemáticas, elimina marcas',()=>{
 const a='Fuente: OpenFootball CC0. Modelo 1X2 64%. Fuente: API-Football /predictions. Otros: football-data.org.';
 const b=publicAnalysisText(a);
 assert.doesNotMatch(b,names);assert.match(b,/64%/);assert.match(b,/terceros/);
 assert.equal(publicAnalysisText(null),'');
});
test('Telegram gratuito y VIP no publican nombres externos en análisis antiguos',()=>{
 const p={title:'Club A vs Club B',league:'Liga',match_date:'2026-11-10 19:00',market:'1X2',selection:'Club A',
   analysis:'Fuente: OpenFootball CC0. Probabilidad calculada 64%. API-Football',visibility:'free',odds:2.1};
 assert.doesNotMatch(telegramFreeAutoPost(p),names);
 assert.doesNotMatch(telegramVipPost({...p,visibility:'vip'}),names);
 assert.match(telegramVipPost({...p,visibility:'vip'}),/64%/);
});
test('API publica resultado automático sin exponer nombre de proveedor, las retiradas siguen',()=>{
 const v=publicRecentResults([{id:99,visibility:'vip',outcome:'lost',title:'A vs B',settlement_source:'nforce-openfootball',settlement_score:'1-0',archived_at:'2026-11-06'}]);
 assert.equal(v[0].result_source,'automatic');assert.equal(v[0].withdrawn,true);
 assert.doesNotMatch(JSON.stringify(v),names);
});
