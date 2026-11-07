import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const html=read('public/index.html'),css=read('public/landing-community-v331.css'),script=read('public/landing.js');

test('public landing prominently shows configurable group with separate channel card',()=>{
 for(const id of ['comunidad','telegramFreeGroupCta','telegramCommunityGroupCard','telegramCommunityGroupLink','telegramCommunityChannelCard','telegramCommunityChannelLink','telegramFreeGroupFooter'])
  assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/Comunidad Fijas de Élite/);
 assert.match(html,/Avisos breves|avisos breves/);
 assert.match(html,/landing-community-v331\.css/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(read('src/server.js'),/free_group_url:safeTelegramPublicUrl\(process\.env\.TELEGRAM_FREE_GROUP_URL\)/);
});

async function runLoad(links){
 const elements=Object.fromEntries(['comunidad','telegramFreeGroupCta','telegramFreeGroupFooter','telegramCommunityGroupCard','telegramCommunityGroupLink','telegramFreeChannelCta','telegramFreeChannelFooter','telegramCommunityChannelCard','telegramCommunityChannelLink'].map(id=>[id,{hidden:true,href:null}]));
 const start=script.indexOf('async function loadTelegramCommunity(){');
 const end=script.indexOf('\nel(\'year\')',start);
 assert.ok(start>=0&&end>start);
 const code=script.slice(start,end);
 const ctx={fetch:async()=>({ok:true,json:async()=>links}),el:id=>elements[id],URL};
 await vm.runInNewContext(`${code}\nloadTelegramCommunity()`,ctx);
 return elements;
}

test('with group URL the community block and group CTA are visible',async()=>{
 const e=await runLoad({free_channel_url:'https://t.me/FijasDeEliteOficial',free_group_url:'https://t.me/FijasDeEliteComunidad'});
 assert.equal(e.comunidad.hidden,false);
 assert.equal(e.telegramFreeGroupCta.hidden,false);
 assert.equal(e.telegramCommunityGroupLink.href,'https://t.me/FijasDeEliteComunidad');
 assert.equal(e.telegramCommunityChannelCard.hidden,false);
 assert.equal(e.telegramCommunityChannelLink.href,'https://t.me/FijasDeEliteOficial');
});
test('without group URL featured block stays hidden, even if channel exists',async()=>{
 const e=await runLoad({free_channel_url:'https://t.me/FijasDeEliteOficial',free_group_url:null});
 assert.equal(e.comunidad.hidden,true);
 assert.equal(e.telegramFreeGroupCta.hidden,true);
 assert.equal(e.telegramFreeChannelCta.hidden,false);
});
test('malicious or non-Telegram group URL is never linked',async()=>{
 for(const url of ['https://t.me.evil.example/grupo','javascript:alert(1)','https://evil.example/groups']){
  const e=await runLoad({free_group_url:url});
  assert.equal(e.comunidad.hidden,true);
  assert.equal(e.telegramCommunityGroupLink.href,null);
 }
});
