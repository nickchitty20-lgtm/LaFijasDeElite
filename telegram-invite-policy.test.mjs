import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../src/telegram-bridge.js';
import {canApproveJoinRequest} from '../src/telegram-invite-policy.js';

const legitimate={
 requestedTelegramId:'123456789',linkedTelegramId:'123456789',
 accountStatus:'active',hasActiveVip:1,alreadyMember:false,
 expectedInviteHash:sha256('https://t.me/+test-link-123'),
 providedInviteLink:'https://t.me/+test-link-123'
};

test('VIP activo, ID vinculado e invitación vigente en DB puede solicitar entrar',()=>{
 assert.equal(canApproveJoinRequest(legitimate),true);
});
test('invitación reenviada a otro ID no da acceso',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,requestedTelegramId:'222222222'}),false);
});
test('una invitación antigua con hash reemplazado no da acceso',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,providedInviteLink:'https://t.me/+old-link'}),false);
});
test('enlace vencido y eliminado de la DB no da acceso',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,expectedInviteHash:null}),false);
});
test('rank 0 no da acceso aunque enlace y membresía coincidan',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,accountStatus:'blacklisted'}),false);
});
test('cliente sin VIP activo no obtiene acceso',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,hasActiveVip:0}),false);
});
test('no aprueba nuevamente a un usuario que ya es miembro',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,alreadyMember:true}),false);
});
test('sin invitación de Telegram no da acceso',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,providedInviteLink:undefined}),false);
});
test('usuario ID inválido no da acceso',()=>{
 assert.equal(canApproveJoinRequest({...legitimate,requestedTelegramId:'@persona'}),false);
});
