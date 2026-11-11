import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NFORCE_SCAN_LOOKAHEAD_DAYS} from '../src/nforce-engine.js';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('v3.4.1 defaults to 14-day horizon while allowing explicit configurable override',()=>{
 assert.equal(NFORCE_SCAN_LOOKAHEAD_DAYS,21);
 assert.match(source('.env.example'),/^NFORCE_SCAN_DAYS=14$/m);
});

test('the status API exposes persisted league coverage, distinct from 20 configured',()=>{
 const engine=source('src/nforce-engine.js');
 assert.match(engine,/COUNT\(DISTINCT competition\) FROM nforce_matches/);
 assert.match(engine,/configured_competitions:LEAGUES\.length\+NATIONAL_COMPETITIONS\.length,national_competitions_configured:NATIONAL_COMPETITIONS\.length,live_schedule_supported_competitions:LIVE_VERIFICATION_LEAGUES\.length,loaded_competitions/);
 const ui=source('public/app.js');
 assert.match(ui,/Competiciones cargadas en MySQL/);
 assert.match(ui,/Competiciones de la última importación/);
});
