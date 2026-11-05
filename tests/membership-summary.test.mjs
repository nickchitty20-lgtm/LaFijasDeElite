import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMembershipSummary} from '../src/membership-summary.js';
const now=new Date('2026-11-06T12:00:00Z').getTime();
const current={plan:'VIP Semanal',ends_at:new Date('2026-11-10T12:00:00Z')};
test('no active VIP must not be unlocked by a future plan',()=>{
 assert.equal(buildMembershipSummary(null,{ends_at:new Date('2026-12-01T12:00:00Z')},1,now),null);
});
test('without renewal, original expiration remains',()=>{
 const out=buildMembershipSummary(current,current,0,now);
 assert.equal(out.days_left,4);assert.equal(out.renewals_scheduled,0);
});
test('paid renewal extends displayed expiry now without prematurely switching current plan',()=>{
 const out=buildMembershipSummary(current,{ends_at:new Date('2026-12-10T12:00:00Z')},1,now);
 assert.equal(out.days_left,34);assert.equal(out.plan,'VIP Semanal');
 assert.equal(out.ends_at.toISOString(),'2026-12-10T12:00:00.000Z');
 assert.equal(out.renewals_scheduled,1);
});
test('two paid renewals accumulate total entitlement',()=>{
 const out=buildMembershipSummary(current,{ends_at:new Date('2026-12-17T12:00:00Z')},2,now);
 assert.equal(out.days_left,41);assert.equal(out.renewals_scheduled,2);
});
test('invalid horizon never shortens original expiry',()=>{
 const out=buildMembershipSummary(current,{ends_at:new Date('2026-11-08T12:00:00Z')},0,now);
 assert.equal(out.days_left,4);
});
