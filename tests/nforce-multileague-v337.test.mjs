import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {LEAGUES,allowedDatasets,normalizeOpenFootball,zonedKickoff,fetchOpenFootball} from '../src/nforce-data.js';

test('20 leagues are allowlisted and include calendar-year Brazil with distinct seasons',()=>{
 const paths=allowedDatasets(new Date('2026-11-09T12:00:00Z')).map(x=>x.path);
 assert.equal(LEAGUES.length,20);
 assert.equal(new Set(LEAGUES.map(l=>l.code)).size,20);
 assert.equal(paths.length,60);
 assert.ok(paths.includes('2026-27/en.2.json')&&paths.includes('2026-27/pt.1.json'));
 assert.ok(paths.includes('2026/br.1.json')&&!paths.includes('2026-27/br.1.json'));
});

test('Brazil league converts confirmed wall time to UTC and rejects unknown kickoff',()=>{
 const dataset=allowedDatasets(new Date('2026-11-09')).find(d=>d.path==='2026/br.1.json');
 const rows=normalizeOpenFootball({matches:[
  {date:'2026-11-19',time:'20:00',team1:'Time A',team2:'Time B'},
  {date:'2026-11-22',team1:'Time C',team2:'Time D'}
 ]},dataset,new Date('2026-11-09'));
 assert.equal(rows.length,2);
 assert.equal(rows[0].kickoff,'2026-11-19T23:00:00.000Z');
 assert.equal(rows[1].kickoff,null);
 assert.equal(rows[1].scheduled_time_known,false);
 assert.equal(zonedKickoff('2026-11-19','20:00','America/Sao_Paulo').toISOString(),rows[0].kickoff);
});

test('Any non-allowlisted path rejected before issuing HTTP requests',async()=>{
 let called=false;
 const dataset=allowedDatasets(new Date('2026-11-09'))[0];
 await assert.rejects(fetchOpenFootball({...dataset,path:'2026-27/br.1.json'}, {fetcher:async()=>{called=true;}}),/no autorizada/);
 assert.equal(called,false);
});

test('Longer scan horizon is opt-in and bounded without changing publication criteria',()=>{
 const script="import {NFORCE_SCAN_LOOKAHEAD_DAYS as d} from './src/nforce-engine.js';console.log(d)";
 for(const [value,days] of [['14','14'],['3','3'],['21','21'],['22','21'],['-1','21'],['hello','21']]){
  const out=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url).pathname,
    env:{...process.env,NFORCE_SCAN_DAYS:value},encoding:'utf8'}).trim();
  assert.equal(out,days);
 }
});
