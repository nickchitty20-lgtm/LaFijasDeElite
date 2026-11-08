import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedVip,STAFF_ROLES,paidVipSql,staffVipSql,effectiveVipSql,getVipEntitlement} from '../src/vip-access.js';

test('Los cinco cargos tienen VIP por su rango',()=>{
 assert.deepEqual(STAFF_ROLES,['owner','general_admin','payments_admin','analyst','moderator']);
 for(const role of STAFF_ROLES)assert.match(staffVipSql('u'),new RegExp(`'${role}'`));
});
test('Un cliente normal NO tiene VIP por defecto',()=>{
 assert.equal(allowedVip({accountStatus:'active',paidVip:0,staffVip:0}),false);
});
test('Un personal autorizado recibe VIP aunque no pague',()=>{
 assert.equal(allowedVip({accountStatus:'active',paidVip:0,staffVip:1}),true);
});
test('VIP pagado sigue habilitado aunque pierda el rango',()=>{
 assert.equal(allowedVip({accountStatus:'active',paidVip:1,staffVip:0}),true);
});
test('Rank 0 prevalece sobre cualquier membresía o rango',()=>{
 assert.equal(allowedVip({accountStatus:'blacklisted',paidVip:1,staffVip:1}),false);
});
test('Un cambio de Telegram pendiente niega acceso aunque sea staff',()=>{
 assert.equal(allowedVip({accountStatus:'active',paidVip:1,staffVip:1,changePending:true}),false);
});
test('La condición SQL aplica OR entre VIP real y beneficio por cargo',()=>{
 assert.match(effectiveVipSql('u'),/memberships/);
 assert.match(effectiveVipSql('u'),/admins/);
 assert.match(effectiveVipSql('u'),/ OR /);
 assert.match(paidVipSql('u'),/archived_at IS NULL/);
});
test('Consulta VIP sin pagos no crea registros de membresía ficticios',async()=>{
 let called=0;
 const fake={execute:async(sql,params)=>{
  called++;assert.match(sql,/SELECT u.account_status/);assert.match(sql,/admins/);assert.match(sql,/memberships/);
  assert.deepEqual(params,[25]);return [[{account_status:'active',paid_vip:0,staff_vip:1}]];
 }};
 const r=await getVipEntitlement(fake,25);
 assert.deepEqual(r,{paid:false,staff:true,hasVip:true});assert.equal(called,1);
});
test('Cuenta bloqueada no tiene beneficio de personal',async()=>{
 const fake={execute:async()=>[[{account_status:'blacklisted',paid_vip:1,staff_vip:1}]]};
 assert.deepEqual(await getVipEntitlement(fake,3),{paid:false,staff:false,hasVip:false});
});
test('Sin registro de usuario no concede VIP',async()=>{
 const fake={execute:async()=>[[]]};
 assert.deepEqual(await getVipEntitlement(fake,3),{paid:false,staff:false,hasVip:false});
});
