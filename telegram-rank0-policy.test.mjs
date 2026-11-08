import test from 'node:test';
import assert from 'node:assert/strict';
import {rank0ActionForTransition,rank0ActionMatchesStatus,rank0DesiredAction} from '../src/telegram-rank0-policy.js';
test('Rank 0 debe solicitar ban en Telegram',()=>{
 assert.equal(rank0ActionForTransition('active','blacklisted'),'ban');
 assert.equal(rank0ActionForTransition('blacklisted','blacklisted'),'ban');
});
test('Quitar Rank 0 solicita desbloquear aunque el cliente carezca de VIP',()=>{
 assert.equal(rank0ActionForTransition('blacklisted','active'),'unban');
});
test('Cambiar entre rangos normales no desbloquea Telegram',()=>{
 assert.equal(rank0ActionForTransition('active','active'),null);
});
test('Acción vieja de unban no debe aplicarse si volvió a Rank 0',()=>{
 assert.equal(rank0ActionMatchesStatus('unban','blacklisted'),false);
 assert.equal(rank0ActionMatchesStatus('ban','active'),false);
 assert.equal(rank0ActionMatchesStatus('unban','active'),true);
 assert.equal(rank0ActionMatchesStatus('ban','blacklisted'),true);
});
test('Sincronización prevalece según estado real, nunca concede VIP',()=>{
 assert.equal(rank0DesiredAction('blacklisted'),'ban');
 assert.equal(rank0DesiredAction('active'),'unban');
});
