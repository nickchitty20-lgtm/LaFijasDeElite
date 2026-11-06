import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPredictionNotice,noticeShouldSend,noticeKindColumn} from '../src/notification-policy.js';

test('notificaciones: desactivadas por defecto no pueden enviarse',()=>{
 assert.equal(noticeShouldSend({active:true,linked:true,pendingChange:false,optedIn:false}),false);
});
test('notificaciones: requieren cuenta activa y Telegram vinculado',()=>{
 assert.equal(noticeShouldSend({active:false,linked:true,pendingChange:false,optedIn:true}),false);
 assert.equal(noticeShouldSend({active:true,linked:false,pendingChange:false,optedIn:true}),false);
});
test('notificaciones: durante cambio de Telegram no se envía nada',()=>{
 assert.equal(noticeShouldSend({active:true,linked:true,pendingChange:true,optedIn:true}),false);
});
test('notificaciones: predicción VIP requiere derecho VIP actual',()=>{
 assert.equal(noticeShouldSend({active:true,linked:true,pendingChange:false,optedIn:true,eligible:false}),false);
 assert.equal(noticeShouldSend({active:true,linked:true,pendingChange:false,optedIn:true,eligible:true}),true);
});
test('mensajes gratuitos nunca revelan selección ni cuotas',()=>{
 const text=formatPredictionNotice('free','https://example.com/clientes.html');
 assert.match(text,/gratuito/i);assert.ok(!text.includes('Cuota'));
 assert.ok(!text.includes('Selección'));
 assert.match(text,/https:\/\/example.com/);
});
test('mensaje VIP es genérico, no incluye pick completo',()=>{
 const text=formatPredictionNotice('vip','https://example.com/clientes.html');
 assert.match(text,/VIP/);assert.ok(!text.includes('análisis'));
 assert.ok(!text.includes('mercado'));
});
test('solo hay columnas de preferencias conocidas en la selección SQL',()=>{
 assert.deepEqual(Object.keys(noticeKindColumn).sort(),['new_prediction','vip_activated','vip_expiring']);
 for(const value of Object.values(noticeKindColumn))assert.match(value,/^(vip_enabled|expiry_enabled|picks_enabled)$/);
});
