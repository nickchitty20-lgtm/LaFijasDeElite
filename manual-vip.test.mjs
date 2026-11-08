import test from 'node:test';
import assert from 'node:assert/strict';
import {manualVipPeriod} from '../src/manual-vip.js';
const now=new Date('2026-11-06T10:00:00Z');
test('grants VIP from now when user has none',()=>{
 const {start,end}=manualVipPeriod(null,30,now);
 assert.equal(start.toISOString(),'2026-11-06T10:00:00.000Z');
 assert.equal(end.toISOString(),'2026-12-06T10:00:00.000Z');
});
test('renews by extending an existing latest end',()=>{
 const {start,end}=manualVipPeriod('2027-01-05T10:00:00Z',90,now);
 assert.equal(start.toISOString(),'2027-01-05T10:00:00.000Z');
 assert.equal(end.toISOString(),'2027-04-05T10:00:00.000Z');
});
test('expired VIP does not add time to expired dates',()=>{
 const {start,end}=manualVipPeriod('2026-10-06T10:00:00Z',7,now);
 assert.equal(start.toISOString(),now.toISOString());
 assert.equal(end.toISOString(),'2026-11-13T10:00:00.000Z');
});
test('rejects zero, negative and unrealistic durations',()=>{
 for(const days of [0,-1,3660,1.5,NaN])assert.throws(()=>manualVipPeriod(null,days,now));
});
test('invalid historical dates cannot shift the entitlement',()=>{
 const {start}=manualVipPeriod('not a date',7,now);
 assert.equal(start.toISOString(),now.toISOString());
});
