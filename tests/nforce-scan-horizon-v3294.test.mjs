import test from 'node:test';
import assert from 'node:assert/strict';
import {NFORCE_SCAN_LOOKAHEAD_DAYS,NFORCE_SCAN_FIXTURE_LIMIT} from '../src/nforce-engine.js';
import {readFileSync} from 'node:fs';

// Keep a strict 72-hour horizon, without lowering VIP evidence requirements.
test('N-FORCE scans no further than 3 days without widening VIP thresholds',()=>{
 assert.equal(NFORCE_SCAN_LOOKAHEAD_DAYS,3);
 assert.equal(NFORCE_SCAN_FIXTURE_LIMIT,240);
 const engine=readFileSync(new URL('../src/nforce-engine.js',import.meta.url),'utf8');
 assert.match(engine,/NFORCE_SCAN_LOOKAHEAD_DAYS\*DAY/);
 assert.match(engine,/Date\.parse\(x\.kickoff\)>time\+60\*60000/);
 assert.match(engine,/scheduled_time_known&&x\.kickoff/);
 assert.match(engine,/existingByStatus\[storedStatus/);
 const panel=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(panel,/Ya registradas \(pendientes \/ descartadas \/ publicadas\)/);
});
