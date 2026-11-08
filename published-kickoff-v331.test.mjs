import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('published admin predictions show the kickoff from the database, next to result controls',()=>{
 const app=read('public/app.js');
 const server=read('src/server.js');
 assert.match(server,/SELECT id,title,analysis,visibility,outcome,published_at,league,match_date,market,selection,odds,telegram_status/);
 const list=app.slice(app.indexOf('async function loadPredictions()'),app.indexOf('async function refreshPredictionSummary()'));
 assert.match(list,/FijasMatchSchedule\?\.render\(p\.match_date,\{prediction_id:p\.id\}\)/);
 assert.match(list,/Inicio del partido: horario no disponible/);
 assert.ok(list.indexOf('FijasMatchSchedule?.render(p.match_date,{prediction_id:p.id})')<list.indexOf('Guardar resultado'));
 assert.match(read('views/panel.html'),/Cada ficha muestra el inicio programado del partido en hora de Perú/);
});

test('public previews include Peru kickoff without displaying a locked VIP selection',()=>{
 const landing=read('public/landing.js'),html=read('public/index.html');
 assert.match(landing,/function teaserKickoff\(value\)/);
 assert.match(landing,/FijasMatchSchedule\?\.formatDate\(value\)/);
 assert.match(landing,/teaserKickoff\(p\.match_date\)/);
 assert.ok(html.indexOf('src="/match-schedule.js')<html.indexOf('src="/landing.js'));
 assert.doesNotMatch(landing.slice(landing.indexOf('async function loadPicks()'),landing.indexOf('async function loadTelegramCommunity()')),/\$\{p\.selection\}/);
});

test('kickoff clock renders date and time correctly in Lima with explicit passed-status disclaimer',()=>{
 function createElement(tag){
  return {tag,children:[],dataset:{},append(...nodes){this.children.push(...nodes);},
   querySelectorAll(selector){const found=[];const walk=n=>{if(selector==='[data-fixture-kickoff-ms]'&&n.dataset?.fixtureKickoffMs)found.push(n);for(const child of n.children||[])walk(child);};walk(this);return found;}};
 }
 const context={window:{setInterval(_fn,period){assert.equal(period,30000);}},document:{createElement}};
 vm.createContext(context);vm.runInContext(read('public/match-schedule.js'),context);
 const schedule=context.window.FijasMatchSchedule;
 const card=schedule.render('2026-11-08 16:15:00');
 assert.match(card.children.find(n=>n.tag==='time').textContent,/11:15 · Hora de Perú/);
 assert.match(card.children.find(n=>n.tag==='small').textContent,/estado en vivo debe verificarse/);
 assert.match(schedule.countdown('2026-11-08T16:15:00Z',Date.parse('2026-11-08T18:00:00Z')).label,/confirma el estado del partido/);
 assert.equal(schedule.render(null),null);
});
