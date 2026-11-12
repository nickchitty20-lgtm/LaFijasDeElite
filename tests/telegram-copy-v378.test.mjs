import test from 'node:test';
import assert from 'node:assert/strict';
import {vipRadarTelegramMessage,vipRadarOfficialTeaser} from '../src/nforce-vip-radar.js';
import {telegramVipPublicPreview,telegramVipPost,telegramFreeAutoPost,telegramCommunityNotice} from '../src/telegram-bridge.js';
import {goldOfficialAnnouncement} from '../src/gold-public-announcement.js';
import {goldPrivateMessage} from '../src/gold-telegram.js';
import {goldAuthorizationText} from '../src/gold-whitelist.js';
import {formatPredictionNotice} from '../src/notification-policy.js';

const url='https://fijasdeelite.xyz/clientes.html?plan=vip';
const pick={id:44,visibility:'vip',auto_generated:true,title:'Lima FC vs Quito FC',league:'Liga & Copa',
 match_date:'2026-11-18T20:00:00Z',market:'1X2 (PRIVADO_44)',selection:'Local SECRET_44',odds:1.67,
 analysis:'Análisis PRIVADO_44',estimated_probability:67};
const fixtures={items:[{home:'Lima <X>',away:'Quito & Y',league:'Torneo & Copa',
 kickoff:'2026-11-18T20:00:00Z',quality:78,probabilities:{home:51,draw:27,away:22},
 ai:{hybrid:{home:53,draw:25,away:22}},selection:'SECRET_44',analysis:'PRIVADO_44'}]};

test('Radar VIP: comunicación premium que diferencia el seguimiento anticipado de selecciones validadas',()=>{
 const vip=vipRadarTelegramMessage(fixtures);
 const publicAd=vipRadarOfficialTeaser(fixtures,{baseUrl:url});
 assert.match(vip,/ANÁLISIS ANTICIPADO/);
 assert.doesNotMatch(vip,/selecciones VIP validadas se publican por separado/);
 assert.match(publicAd,/análisis anticipado/);
 assert.doesNotMatch(publicAd,/selecciones VIP validadas se publican por separado/);
 assert.doesNotMatch(vip+publicAd,/NO SON FIJAS|no pronósticos VIP aprobados|resultados garantizados/i);
 assert.doesNotMatch(publicAd,/SECRET_44|PRIVADO_44|51\.0%|53\.0%|78\/100/);
 assert.match(publicAd,/Lima &lt;X&gt;/);
 assert.doesNotMatch(publicAd,/clientes\.html|plan=vip/);
 assert.equal(vipRadarOfficialTeaser({items:[]},{baseUrl:url}),'');
});

test('Anuncios de selección VIP y GOLD reservan el pronóstico completo',()=>{
 const publicVip=telegramVipPublicPreview(pick,url);
 const publicGold=goldOfficialAnnouncement(url,{...pick,visibility:'gold'});
 for(const txt of [publicVip,publicGold]){
  assert.match(txt,/FIJAS DE ÉLITE/);
  for(const secret of ['PRIVADO_44','SECRET_44','1.67','67'])assert.equal(txt.includes(secret),false,secret);
  assert.doesNotMatch(txt,/clientes\.html|plan=vip/);
  assert.doesNotMatch(txt,/incertidumbre/);
 }
 assert.equal((publicGold.match(/🗓/g)||[]).length,1);
 const vipFull=telegramVipPost(pick);
 const goldFull=goldPrivateMessage(pick);
 for(const full of [vipFull,goldFull]){
  assert.match(full,/SECRET_44/);
  assert.match(full,/PRIVADO_44/);
  assert.doesNotMatch(full,/incertidumbre|incierto/);
 }
 const goldManual=goldOfficialAnnouncement(url,{...pick,visibility:'gold',auto_generated:false,title:'SECRET_44'});
 assert.doesNotMatch(goldManual,/SECRET_44/);
});

test('Avisa en comunidad sin detalles privados y sin avisos redundantes',()=>{
 const free=telegramCommunityNotice('free',{channelUrl:'https://t.me/FijasDeEliteOficial',baseUrl:url});
 const vip=telegramCommunityNotice('vip',{baseUrl:url});
 assert.ok(free.length<180&&vip.length<180);
 assert.doesNotMatch(free+vip,/SECRET_44|PRIVADO_44|1.67/);
 const message=telegramFreeAutoPost({...pick,visibility:'free'},url);
 assert.doesNotMatch(message,/Nivel de riesgo: alto/);
 assert.match(message,/probabilidad estimada/i);
 assert.doesNotMatch(message,/incertidumbre/);
});

test('Notificaciones privadas mantienen beneficios y diferencian los rangos',()=>{
 assert.match(goldAuthorizationText('Abcde_22'),/lista blanca GOLD/);
 assert.match(formatPredictionNotice('vip',url),/VIP/);
 assert.match(formatPredictionNotice('free',url),/análisis deportivo/);
 assert.doesNotMatch(formatPredictionNotice('vip',url),/PRIVADO_44|SECRET_44/);
});
