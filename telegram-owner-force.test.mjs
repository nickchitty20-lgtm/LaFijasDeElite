import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerForceCanProceed,shouldPreserveOwnerMember} from '../src/telegram-detach-policy.js';
import {readFileSync} from 'node:fs';
const routes=readFileSync(new URL('../src/telegram-routes.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/clientes.html',import.meta.url),'utf8');

test('only active accounts with a Telegram and no earlier preserved member can force unlink',()=>{
 const x={isOwner:true,hasLinkedTelegram:true,alreadyPreserved:false,accountStatus:'active'};
 assert.equal(ownerForceCanProceed(x),true);
 assert.equal(ownerForceCanProceed({...x,isOwner:false}),false);
 assert.equal(ownerForceCanProceed({...x,alreadyPreserved:true}),false);
 assert.equal(ownerForceCanProceed({...x,hasLinkedTelegram:false}),false);
 assert.equal(ownerForceCanProceed({...x,accountStatus:'blacklisted'}),false);
});
test('prior member kept only while prior owner exception has active VIP and is not Rank 0',()=>{
 assert.equal(shouldPreserveOwnerMember({user_id:4},'active',true),true);
 assert.equal(shouldPreserveOwnerMember({user_id:4},'active',false),false);
 assert.equal(shouldPreserveOwnerMember({user_id:4},'blacklisted',true),false);
 assert.equal(shouldPreserveOwnerMember(null,'active',true),false);
});
test('owner route requires owner, reauth, audit, keeps channel untouched',()=>{
 const section=routes.split("app.post('/api/admin/telegram/force-unlink'")[1].split("app.post('/api/admin/telegram/check-preserved'")[0];
 assert.match(section,/req\.admin\.role!=='owner'/);
 assert.match(section,/bcrypt\.compare\(password,owner\.password_hash\)/);
 assert.match(section,/confirm_keep_old/);
 assert.match(section,/telegram_owner_preserved/);
 assert.match(section,/DELETE FROM telegram_links WHERE user_id/);
 assert.match(section,/cooldown_until=NULL/);
 assert.match(section,/audit_logs/);
 assert.doesNotMatch(section,/(?:await api\('|await api\(\")\s*(?:banChatMember|unbanChatMember)/);
});
test('known member audits and Telegram updates preserve owner-allowlisted former member',()=>{
 assert.match(routes,/if\(shouldPreserveOwnerMember\(ownerPreserved,ownerPreserved\?\.account_status,ownerPreserved\?\.active_vip\)\)/);
 assert.match(routes,/DELETE FROM telegram_owner_preserved WHERE telegram_user_id/);
 assert.match(routes,/telegram_owner_preserved p/);
});
test('creator UI exists without removing older navigation or self-service normal unlink',()=>{
 for(const heading of ['telegramOwnerUnlinkForm','telegramOwnerForceUnlinkForm','telegramPreservedCheckForm','telegramChangeExceptionForm','staffPanel','vipPanel','financePanel'])
  assert.ok(admin.includes(heading),heading);
 assert.match(client,/telegramUnlinkForm/);
});
