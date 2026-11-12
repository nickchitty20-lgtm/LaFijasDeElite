import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vipRadarOfficialTeaser,vipRadarTelegramMessage} from '../src/nforce-vip-radar.js';
import {telegramVipPost,telegramVipPublicPreview,telegramPublicNotice,telegramCommunityNotice} from '../src/telegram-bridge.js';
import {goldOfficialAnnouncement} from '../src/gold-public-announcement.js';
import {goldPrivateMessage} from '../src/gold-telegram.js';
import {publicAnalysisText} from '../src/public-branding.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const fixtures={items:[{home:'Lima <FC>',away:'Quito & Racing',league:'Liga & Copa',kickoff:'2026-11-16T21:30:00Z',quality:82,probabilities:{home:54,draw:24,away:22},selection:'PICK_PRIVADO',ai:{hybrid:{home:56,draw:23,away:21}}}]};
const pick={id:88,auto_generated:true,title:'Lima FC vs Quito Racing',league:'Primera Liga',match_date:'2026-11-16T21:30:00Z',market:'Goles',selection:'PICK_PRIVADO',odds:1.83,analysis:'Un análisis completo con datos deportivos.',estimated_probability:65};
const boilerplate=/no (son|es) (?:una? )?(?:pron[oó]stico|fija)|no garant[ií]a|no garantiz|sujeto a incertidumbre|sujeta a incertidumbre|los resultados son inciertos|pron[oó]sticos no aprobados|proyecci[oó]n orientativa/i;
test('comparativa GOLD/VIP usa tabla adaptable sin min-width fijo y sin aviso debajo',()=>{
 const html=read('public/landing.js');const css=read('public/landing.css');
 assert.match(html,/class="membership-comparison-table"/);
 assert.match(html,/scope="row"/);
 assert.equal((html.match(/<tr><th scope="row">/g)||[]).length,7);
 assert.equal((html.match(/data-label="GOLD"/g)||[]).length,7);
 assert.equal((html.match(/data-label="VIP"/g)||[]).length,7);
 assert.doesNotMatch(html,/Las predicciones son estimaciones, no garant[ií]as/);
 assert.match(css,/\.membership-comparison-table\{table-layout:fixed;width:100%;min-width:0/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.doesNotMatch(css,/min-width:480px/);
 assert.doesNotMatch(read('public/index.html'),/Los pron[oó]sticos son an[aá]lisis orientativos, no garant[ií]as/);
});
test('Telegram GOLD, VIP, Radar y comunidad prescinden de coletillas repetidas',()=>{
 const items=[
  telegramVipPost(pick),telegramVipPublicPreview(pick,'https://fijasdeelite.xyz'),
  goldPrivateMessage(pick),goldOfficialAnnouncement('https://fijasdeelite.xyz',{...pick,visibility:'gold'}),
  vipRadarTelegramMessage(fixtures),vipRadarOfficialTeaser(fixtures,{baseUrl:'https://fijasdeelite.xyz'}),
  telegramPublicNotice({...pick,visibility:'vip'},'https://fijasdeelite.xyz'),
  telegramCommunityNotice('vip',{baseUrl:'https://fijasdeelite.xyz'}),
  telegramCommunityNotice('free',{channelUrl:'https://t.me/FijasDeEliteOficial'})
 ];
 for(const msg of items){assert.ok(msg.length>0);assert.doesNotMatch(msg,boilerplate);}
 for(const publicMsg of [items[1],items[3],items[5],items[6],items[7],items[8]]){
  assert.doesNotMatch(publicMsg,/PICK_PRIVADO|1\.83|65%|82\/100|54\/24\/22/);
 }
 assert.match(items[0],/PICK_PRIVADO/);
 assert.match(items[2],/PICK_PRIVADO/);
 assert.match(publicAnalysisText('Forma y estadísticas. Estos ajustes no garantizan mayor acierto.'),/^Forma y estad[ií]sticas\.$/);
});
