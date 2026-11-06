import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeCooldownMinutes,
  changeIsAllowed,
  TELEGRAM_CHANGE_COOLDOWN_DAYS,
  TELEGRAM_CHANGE_TOKEN_MINUTES,
  TELEGRAM_CHANGE_REISSUE_MINUTES,
} from '../src/telegram-change-policy.js';

const eligible={hasVip:true,hasLink:true,pending:false,cooldownMinutes:0,reissueMinutes:0};
test('Telegram changes require an active VIP membership',()=>{
 const result=changeIsAllowed({...eligible,hasVip:false});
 assert.equal(result.allowed,false);assert.equal(result.status,403);
});
test('Telegram changes require an existing Telegram link',()=>{
 const result=changeIsAllowed({...eligible,hasLink:false});
 assert.equal(result.allowed,false);assert.equal(result.status,409);
});
test('only one completed Telegram change each 30 days',()=>{
 assert.equal(TELEGRAM_CHANGE_COOLDOWN_DAYS,30);
 const result=changeIsAllowed({...eligible,cooldownMinutes:8});
 assert.equal(result.allowed,false);assert.equal(result.status,429);
});
test('owner-authorized cooldown reset allows a change',()=>{
 assert.deepEqual(changeIsAllowed(eligible),{allowed:true});
});
test('a pending change may reissue only after 30-minute cooldown',()=>{
 assert.equal(TELEGRAM_CHANGE_REISSUE_MINUTES,30);
 const rejected=changeIsAllowed({...eligible,pending:true,reissueMinutes:18});
 assert.equal(rejected.allowed,false);assert.equal(rejected.status,429);
 assert.deepEqual(changeIsAllowed({...eligible,pending:true,reissueMinutes:0}),{allowed:true});
});
test('a pending change does not bypass requirement for active VIP',()=>{
 const rejected=changeIsAllowed({...eligible,hasVip:false,pending:true,reissueMinutes:0});
 assert.equal(rejected.allowed,false);
});
test('new link is short-lived and negative/invalid cooldowns are safe',()=>{
 assert.equal(TELEGRAM_CHANGE_TOKEN_MINUTES,10);
 for(const value of [null,undefined,-1,'oops',Infinity,NaN])assert.equal(changeCooldownMinutes(value),0);
 assert.equal(changeCooldownMinutes(2.7),3);
});
