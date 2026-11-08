import test from 'node:test';
import assert from 'node:assert/strict';
import {isBlacklisted,roleRank,blockedAccountResponse} from '../src/account-policy.js';

test('rank 0 is reserved for the blacklist',()=>{
 assert.equal(roleRank('blacklist'),0);
 assert.equal(roleRank('customer'),1);
 assert.equal(roleRank('owner'),6);
});
test('blacklist is a stored account state, not a client-supplied rank',()=>{
 assert.equal(isBlacklisted({account_status:'blacklisted'}),true);
 assert.equal(isBlacklisted({account_status:'active',role:'blacklist'}),false);
 assert.equal(isBlacklisted(null),false);
 assert.equal(blockedAccountResponse.code,'ACCOUNT_BLACKLISTED');
});
