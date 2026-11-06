import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPreserveDetachedMember,canBeginNewTelegramLink,shouldReleaseDetachedReservation} from '../src/telegram-detach-policy.js';

test('unlink preserves subscriber if detached and account active',()=>{
 assert.equal(shouldPreserveDetachedMember('detached','active',true),true);
 assert.equal(shouldPreserveDetachedMember('active','active',true),false);
 assert.equal(shouldPreserveDetachedMember('detached','blacklisted',true),false);
 assert.equal(shouldPreserveDetachedMember('detached','active',false),false); // expired VIP is removed as usual
});
test('second telegram cannot be linked while slot reserved or cooldown runs',()=>{
 assert.equal(canBeginNewTelegramLink(true,0),false);
 assert.equal(canBeginNewTelegramLink(true,10),false);
 assert.equal(canBeginNewTelegramLink(false,1440),false);
 assert.equal(canBeginNewTelegramLink(false,0),true);
});
test('detached seat released only after confirmed exit',()=>{
 assert.equal(shouldReleaseDetachedReservation('detached','member'),false);
 assert.equal(shouldReleaseDetachedReservation('detached','creator'),false);
 assert.equal(shouldReleaseDetachedReservation('detached','left'),true);
 assert.equal(shouldReleaseDetachedReservation('detached','kicked'),true);
 assert.equal(shouldReleaseDetachedReservation('detached','restricted',false),true);
 assert.equal(shouldReleaseDetachedReservation('detached','restricted',true),false);
 assert.equal(shouldReleaseDetachedReservation('active','left'),false);
});
