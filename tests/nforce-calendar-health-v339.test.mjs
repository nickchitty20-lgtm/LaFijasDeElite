import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseNforceCalendar} from '../src/nforce-calendar-health.js';

const base={competition:'de.1',league:'Bundesliga',home_goals:null,away_goals:null,live_status:null};
const now=new Date('2026-11-10T15:00:00Z');

test('fixture after an international break enters 14 days; an hour conversion does not erase it',()=>{
 const m={...base,date:'2026-11-20',kickoff:'2026-11-20T19:30:00.000Z',scheduled_time_known:true,home:'Bayern',away:'Köln'};
 const d=diagnoseNforceCalendar([m],{now,days:14});
 assert.equal(d.known_time_in_window,1);
 assert.equal(d.date_only_in_window,0);
 assert.equal(d.next_known.match,'Bayern vs Köln');
});

test('unknown time is counted distinctly, never invented as a date-only kickoff',()=>{
 const m={...base,date:'2026-11-12',kickoff:null,scheduled_time_known:false,home:'A',away:'B'};
 const d=diagnoseNforceCalendar([m],{now,days:14});
 assert.equal(d.known_time_in_window,0);
 assert.equal(d.date_only_in_window,1);
 assert.match(d.diagnosis,/sin hora/);
});

test('suspended, finished, and rescheduled fixtures are not treated as ready',()=>{
 const matches=['PST','FT','TBD'].map(status=>({...base,date:'2026-11-12',kickoff:'2026-11-12T17:00:00Z',scheduled_time_known:true,live_status:status}));
 const d=diagnoseNforceCalendar(matches,{now,days:14});
 assert.equal(d.known_time_in_window,0);
 assert.equal(d.known_time_blocked_status,3);
});

test('past kickoff with future date is flagged as inconsistent, not analyzed',()=>{
 const d=diagnoseNforceCalendar([{...base,date:'2026-11-18',kickoff:'2026-11-09T12:00:00Z',scheduled_time_known:true}],{now,days:14});
 assert.equal(d.past_kickoffs_with_future_date,1);
 assert.equal(d.known_time_in_window,0);
});

test('November 20 fixture with a stated 20:30 Berlin kickoff converts to 19:30 UTC and remains searchable',async()=>{
 const {allowedDatasets,normalizeOpenFootball}=await import('../src/nforce-data.js');
 const dataset=allowedDatasets(now).find(d=>d.path==='2026-27/de.1.json');
 assert.ok(dataset);
 const [fixture]=normalizeOpenFootball({matches:[{
  date:'2026-11-20',time:'20:30',team1:'FC Bayern München',team2:'1. FC Köln'
 }]},dataset,now);
 assert.equal(fixture.kickoff,'2026-11-20T19:30:00.000Z');
 const d=diagnoseNforceCalendar([{...fixture,home_goals:null,away_goals:null}],{now,days:14});
 assert.equal(d.known_time_in_window,1);
});
