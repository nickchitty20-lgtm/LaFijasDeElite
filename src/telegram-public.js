/** Public FREE announcements are strictly channel-only.
 * A public channel username is preferred over a possibly mistyped numeric ID.
 * The legacy FREE group is NEVER a publishing fallback. */
export function freeTelegramDestination(env=process.env){
 const url=safeTelegramPublicUrl(env.TELEGRAM_FREE_CHANNEL_URL);
 if(url){
  const path=new URL(url).pathname.slice(1).replace(/\/$/,'');
  if(!path.startsWith('+') && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(path))return '@'+path;
 }
 const raw=String(env.TELEGRAM_FREE_CHANNEL_CHAT_ID||'').trim();
 return /^-100\d{5,16}$/.test(raw)||/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(raw)?raw:'';
}

/** Only allow public Telegram URLs to be surfaced on the website. */
export function safeTelegramPublicUrl(raw){
 try {
  const u=new URL(String(raw||''));
  if(u.protocol!=='https:'||u.hostname!=='t.me'||u.port||u.username||u.password||u.search||u.hash)return null;
  if(!/^\/(?:[A-Za-z0-9_]{4,32}|\+[A-Za-z0-9_-]{8,})\/?$/.test(u.pathname))return null;
  return u.href;
 }catch{return null;}
}
