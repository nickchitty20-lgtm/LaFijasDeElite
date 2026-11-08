import test from 'node:test';
import assert from 'node:assert/strict';
import {usdCents,validatePaypalCapture,paypalReadiness,refundState,captureIdFromRefund} from '../src/paypal-rules.js';
const example={id:'ORDER123',status:'COMPLETED',purchase_units:[{custom_id:'42',amount:{currency_code:'USD',value:'12.00'},payments:{captures:[{id:'CAPTURE123',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'}}]}}]};
test('valid capture verifies stored USD cents, not supplied browser amount',()=>{
 assert.deepEqual(validatePaypalCapture(example,'ORDER123',42,'12.00'),{captureId:'CAPTURE123',amountUsd:'12.00'});
 for (const bad of ['11.99','12.01','0.00']) assert.equal(validatePaypalCapture(example,'ORDER123',42,bad),null);
 assert.equal(validatePaypalCapture(example,'OTHER',42,'12.00'),null);
 assert.equal(validatePaypalCapture(example,'ORDER123',43,'12.00'),null);
 assert.equal(validatePaypalCapture({...example,status:'APPROVED'},'ORDER123',42,'12.00'),null);
 assert.equal(validatePaypalCapture({...example,purchase_units:[...example.purchase_units,...example.purchase_units]},'ORDER123',42,'12.00'),null);
});
test('strict two-decimal USD interpretation',()=>{
 assert.equal(usdCents('12.01'),1201);assert.equal(usdCents('12'),1200);
 for(const bad of ['12.001','1e2','NaN','-1',null])assert.equal(usdCents(bad),null);
});
test('Live fails closed without webhook and owner opt-in',()=>{
 const env={PAYPAL_MODE:'live',PAYPAL_ENABLE:'true',PAYPAL_CLIENT_ID:'abc',PAYPAL_CLIENT_SECRET:'def',PAYPAL_PEN_PER_USD:'3.5',PUBLIC_BASE_URL:'https://example.com'};
 assert.equal(paypalReadiness(env).ready,false);
 assert.equal(paypalReadiness({...env,PAYPAL_WEBHOOK_ID:'WH-123',PAYPAL_LIVE_RELEASE_ACK:'true'}).ready,true);
 assert.equal(paypalReadiness({...env,PAYPAL_WEBHOOK_ID:'WH-123',PAYPAL_LIVE_RELEASE_ACK:'false'}).ready,false);
});
test('refund boundary requires full amount before full reversal',()=>{
 assert.equal(refundState('1.00','10.00'),'partially_refunded');
 assert.equal(refundState('10.00','10.00'),'refunded');
 assert.equal(refundState('0.00','10.00'),'captured');
});
test('refund capture IDs only accepted from valid PayPal resource fields',()=>{
 assert.equal(captureIdFromRefund({supplementary_data:{related_ids:{capture_id:'CAPTURE987'}}}),'CAPTURE987');
 assert.equal(captureIdFromRefund({links:[{rel:'up',href:'https://api-m.paypal.com/v2/payments/captures/CAPTURE123'}]}),'CAPTURE123');
 assert.equal(captureIdFromRefund({links:[{rel:'other',href:'https://api-m.paypal.com/v2/payments/captures/CAPTURE123'}]}),null);
});
