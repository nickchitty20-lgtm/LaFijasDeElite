import {sha256,safeTelegramId} from './telegram-bridge.js';

// Approval requires an exact matching Telegram ID and an unexpired active invitation
// (the caller selects only expires_at > UTC_TIMESTAMP()). Forwarded/old links are useless.
export function canApproveJoinRequest({requestedTelegramId,linkedTelegramId,accountStatus,hasActiveVip,alreadyMember,expectedInviteHash,providedInviteLink}){
 if(!safeTelegramId(requestedTelegramId)||!safeTelegramId(linkedTelegramId))return false;
 if(String(requestedTelegramId)!==String(linkedTelegramId))return false;
 if(accountStatus!=='active'||!Boolean(hasActiveVip)||Boolean(alreadyMember))return false;
 if(typeof expectedInviteHash!=='string'||!/^[a-f0-9]{64}$/i.test(expectedInviteHash))return false;
 if(typeof providedInviteLink!=='string'||providedInviteLink.length<10)return false;
 return sha256(providedInviteLink)===expectedInviteHash;
}
