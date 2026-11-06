import test from 'node:test';
import assert from 'node:assert/strict';
import {pickScanFixtures,canRunManual,FOOTBALL_SCAN_FIXTURES_LIMIT} from '../src/football-scan-policy.js';

const fixture=(id,league)=>({fixture:{id},league:{id:league,name:`Liga ${league}`}});

test('prioriza variedad de ligas para analizar partidos, sin duplicar fixtures',()=>{
 const matches=[fixture(1,1),fixture(2,1),fixture(3,1),fixture(4,2),fixture(5,3),fixture(6,4),fixture(7,5),fixture(8,6),fixture(1,1)];
 assert.deepEqual(pickScanFixtures(matches).map(m=>m.fixture.id),[1,4,5,6,7]);
 assert.equal(pickScanFixtures(matches).length,FOOTBALL_SCAN_FIXTURES_LIMIT);
 assert.deepEqual(pickScanFixtures(matches,3).map(m=>m.fixture.id),[1,4,5]);
});

test('completa el cupo con partidos de ligas repetidas cuando no hay más ligas',()=>{
 assert.deepEqual(pickScanFixtures([fixture(1,1),fixture(2,1),fixture(3,2),fixture(4,2)],4).map(m=>m.fixture.id),[1,3,2,4]);
});

test('permite escaneo manual inmediato independiente del automático, pero solo dos al día',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 assert.equal(canRunManual({now,countToday:0}).allowed,true);
 assert.equal(canRunManual({now,countToday:0}).remaining,2);
 assert.equal(canRunManual({now,countToday:2}).allowed,false);
 assert.match(canRunManual({now,countToday:2}).reason,/límite de 2/);
});

test('exige 10 minutos entre dos análisis manuales',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 const lastStartedAt='2026-11-06T17:55:00.000Z';
 const locked=canRunManual({now,countToday:1,lastStartedAt});
 assert.equal(locked.allowed,false);
 assert.equal(locked.remaining,1);
 assert.equal(locked.nextAt,'2026-11-06T18:05:00.000Z');
 assert.equal(canRunManual({now:now+6*60*1000,countToday:1,lastStartedAt}).allowed,true);
});
