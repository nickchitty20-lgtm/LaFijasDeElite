import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {matchCountdown,parseMatchDate,formatPeruKickoff,telegramMatchSchedule} from '../src/match-schedule.js';
import {telegramPublicNotice,telegramFreeAutoPost,telegramVipPost} from '../src/telegram-bridge.js';
const time='2026-11-06 20:30:00'; // UTC -> 15:30 Peru
const now=Date.parse('2026-11-06T18:00:00Z');
test('MySQL UTC timestamp renders the same instant regardless of browser local timezone',()=>{
 assert.equal(parseMatchDate(time).toISOString(),'2026-11-06T20:30:00.000Z');
 assert.equal(parseMatchDate('2026-11-06T20:30:00Z').toISOString(),'2026-11-06T20:30:00.000Z');
 assert.match(formatPeruKickoff(time),/15:30/);
 assert.equal(parseMatchDate('not-a-date'),null);
});
test('countdown distinguishes upcoming, soon and passed kickoff without pretending a verified live status',()=>{
 assert.equal(matchCountdown(time,now).label,'Comienza en 2 h 30 min');
 assert.equal(matchCountdown(time,now+2*3600000).label,'Comienza en 30 min');
 assert.equal(matchCountdown(time,Date.parse('2026-11-06T21:00:00Z')).phase,'passed');
 assert.match(matchCountdown(time,Date.parse('2026-11-07T03:00:00Z')).label,/confirma el estado/);
});
test('Telegram snapshots show Peru schedule and time left when published',()=>{
 const t=telegramMatchSchedule(time,now);
 assert.match(t,/15:30/);assert.match(t,/Comienza en 2 h 30 min/);
 const prediction={title:'Club A vs Club B',league:'Liga demo',match_date:time,visibility:'vip',market:'1X2',selection:'Club A',analysis:'Análisis deportivo'};
 assert.match(telegramVipPost(prediction),/Inicio programado/);
 assert.match(telegramFreeAutoPost({...prediction,visibility:'free'}),/hora de Perú/);
 assert.match(telegramPublicNotice(prediction,'https://example.org'),/Inicio programado/);
});
test('browser clock is included before pick consumers and refreshed automatically',()=>{
 const client=readFileSync(new URL('../public/clientes.html',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
 for(const html of [client,admin])assert.ok(html.indexOf('/match-schedule.js')<html.indexOf('/pick-report.js'));
 const browser=readFileSync(new URL('../public/match-schedule.js',import.meta.url),'utf8');
 const context={window:{setInterval(fn,ms){assert.equal(ms,30000);}},document:{}};vm.createContext(context);vm.runInContext(browser,context);
 const fn=context.window.FijasMatchSchedule;
 assert.equal(fn.parse(time).toISOString(),'2026-11-06T20:30:00.000Z');
 assert.equal(fn.countdown(time,now).label,'Comienza en 2 h 30 min');
 assert.match(fn.formatDate(time),/15:30/);
});
test('locked VIP predictions show only kickoff, not VIP selection or analysis',()=>{
 const js=readFileSync(new URL('../public/clientes.js',import.meta.url),'utf8');
 assert.match(js,/FijasMatchSchedule\?\.render\(p\.match_date/);
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/locked:true/);
});
