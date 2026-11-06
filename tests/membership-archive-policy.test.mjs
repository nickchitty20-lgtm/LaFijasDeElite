import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMembershipArchive} from '../src/membership-archive-policy.js';

test('manual VIP without payments may be archived',()=>{
 assert.deepEqual(evaluateMembershipArchive([]),{blockedByPaypal:false,hasVerifiedPayment:false,pendingManualPayments:0});
});
test('pending card order always blocks deletion, including before PayPal order id is stored',()=>{
 for(const external_reference of [null,'ORDER-TEST-123']){
  assert.equal(evaluateMembershipArchive([{method:'card',status:'pending',external_reference}]).blockedByPaypal,true);
 }
});
test('pending Yape and Plin requests may be rejected while archiving',()=>{
 const out=evaluateMembershipArchive([{method:'yape',status:'pending'},{method:'plin',status:'pending'},{method:'direct',status:'rejected'}]);
 assert.equal(out.blockedByPaypal,false);assert.equal(out.pendingManualPayments,2);
});
test('verified payments remain historical evidence and are not refundable by archiving',()=>{
 const out=evaluateMembershipArchive([{method:'card',status:'verified'},{method:'yape',status:'pending'}]);
 assert.equal(out.hasVerifiedPayment,true);assert.equal(out.blockedByPaypal,false);
});
