import test from 'node:test';
import assert from 'node:assert/strict';
import {scanRetryWindow,selectFreshFixtures} from '../src/football-automation.js';

test('no retrasa cuatro horas un escaneo sin resultados',()=>{
 const at='2026-11-06T15:00:00.000Z';
 const empty=scanRetryWindow({started_at:at,examined:10,drafts_created:0});
 assert.equal(empty.minutes,60);
 assert.equal(empty.next_at,'2026-11-06T16:00:00.000Z');
 const noMatches=scanRetryWindow({started_at:at,examined:0,drafts_created:0});
 assert.equal(noMatches.minutes,30);
 assert.equal(noMatches.next_at,'2026-11-06T15:30:00.000Z');
 const success=scanRetryWindow({started_at:at,examined:3,drafts_created:1});
 assert.equal(success.minutes,240);
 assert.equal(success.next_at,'2026-11-06T19:00:00.000Z');
 assert.equal(scanRetryWindow(null).next_at,null);
});
test('puede seleccionar partidos nuevos tras 120 partidos conocidos o pospuestos',()=>{
 const upcoming=Array.from({length:131},(_,n)=>({fixture:{id:n+10000,date:'2026-11-07T20:00:00.000Z'},league:{id:39,name:'Premier League'}}));
 const known=new Set(upcoming.slice(0,100).map(x=>x.fixture.id));
 const deferred=new Set(upcoming.slice(100,130).map(x=>x.fixture.id));
 const selected=selectFreshFixtures(upcoming,known,deferred);
 assert.equal(selected.alreadyPresent,100);
 assert.equal(selected.recentlySkipped,30);
 assert.deepEqual(selected.fixtures.map(x=>x.fixture.id),[10130]);
});
