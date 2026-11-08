// Rank 0 is not an administrative permission level; it is a server-side account block.
export const isBlacklisted = account => account?.account_status === 'blacklisted';
export const roleRank = role => ({blacklist:0,customer:1,moderator:2,analyst:3,payments_admin:4,general_admin:5,owner:6})[role] ?? 1;
export const blockedAccountResponse = {error:'Esta cuenta está en lista negra. Contacta con soporte para solicitar una revisión.',code:'ACCOUNT_BLACKLISTED'};
