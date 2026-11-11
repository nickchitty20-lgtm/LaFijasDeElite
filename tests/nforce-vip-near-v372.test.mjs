import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareVipRadar,VIP_RADAR_MIN_LEAD_HOURS,VIP_RADAR_NEAR_DAYS} from '../src/nforce-vip-radar.js';

const now=new Date('2026-11-11T21:20:00.000Z');
const fixture=(id,when,extra={})=>({id,home:`Home ${id}`,away:`Away ${id}`,
 competition:'int.unl',league:'UEFA Nations League',date:when?.slice(0,10)||'2026-11-12',
 kickoff:when,scheduled_time_known:Boolean(when),home_goals:null,away_goals:null,live_status:'NS',...extra});

test('el radar no descarta mañana solo porque falten menos de 24 horas',()=>{
 const rows=[fixture(1,'2026-11-12T17:00:00.000Z'),fixture(2,'2026-11-13T19:45:00.000Z')];
 const report=prepareVipRadar(rows,{now});
 assert.equal(VIP_RADAR_MIN_LEAD_HOURS,2);
 assert.equal(VIP_RADAR_NEAR_DAYS,7);
 assert.equal(report.counts.within_window,2);
 assert.equal(report.counts.near_term_detected,2);
 assert.equal(report.counts.near_term_without_history,2);
 assert.equal(report.near_term.eligible,0);
 assert.equal(report.watchlist.length,2);
 assert.ok(report.watchlist.every(x=>x.reason_text&&x.official_vip===false));
});

test('un fixture de mañana sin hora aparece solo como observación, no como recomendación',()=>{
 const rows=[fixture(3,null,{date:'2026-11-12',scheduled_time_known:false})];
 const report=prepareVipRadar(rows,{now});
 assert.equal(report.counts.unknown_start,1);
 assert.equal(report.counts.near_term_unknown_start,1);
 assert.equal(report.watchlist[0].kickoff,null);
 assert.match(report.watchlist[0].reason_text,/hora/);
 assert.equal(report.eligible_total,0);
});

test('fechas vencidas, estados no NS y goleadores ya finalizados no se publican como scouts',()=>{
 const report=prepareVipRadar([
  fixture(4,'2026-11-11T20:00:00.000Z'),
  fixture(5,'2026-11-12T17:00:00.000Z',{live_status:'PST'}),
  fixture(6,'2026-11-12T19:45:00.000Z',{home_goals:1,away_goals:0}),
  fixture(7,null,{date:'2026-11-10'})
 ],{now});
 assert.equal(report.near_term.detected,0);
 assert.equal(report.near_term.missing_calendar,true);
 assert.equal(report.eligible_total,0);
 assert.equal(report.counts.non_ns,1);
});

test('la ventana de 2 horas no transforma un partido a 30 minutos en boletín',()=>{
 const report=prepareVipRadar([fixture(8,'2026-11-11T21:50:00.000Z')],{now});
 assert.equal(report.counts.too_close,1);
 assert.equal(report.eligible_total,0);
 assert.equal(report.watchlist[0].reason,'too_close');
});

test('incluye 2026 entre las temporadas de Nations League admitidas para importar',async()=>{
 const {nationalDatasets}=await import('../src/nforce-internationals.js');
 assert.ok(nationalDatasets(now).some(x=>x.code==='int.unl'&&x.season==='2026'));
});
