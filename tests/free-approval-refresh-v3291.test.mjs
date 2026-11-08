import test from 'node:test';
import assert from 'node:assert/strict';
import {installNforceEngine} from '../src/nforce-engine.js';
import {estimateMatch,makeCandidate,MODEL_VERSION} from '../src/nforce-model.js';

test('GRATIS antigua: se bloquea, se reanaliza y luego se puede aprobar sin filtro VIP',async()=>{
 const now=new Date('2026-11-10T12:00:00Z');
 const teams=Array.from({length:12},(_,i)=>'Club '+String.fromCharCode(65+i));
 const table=[];let state=1;
 const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<250;i++){
  const hi=Math.floor(rnd()*12);let ai=Math.floor(rnd()*11);if(ai>=hi)ai++;
  const home=teams[hi],away=teams[ai],kickoff=new Date(now.getTime()-(250-i)*11*3600000).toISOString();
  table.push({id:i+1,competition:'en.1',league:'Premier League',home,away,kickoff,
   scheduled_time_known:1,home_goals:rnd()<.66?Math.floor(rnd()*3):Math.floor(rnd()*5),
   away_goals:rnd()<.7?Math.floor(rnd()*3):Math.floor(rnd()*5),source_checked_at:now});
 }
 const fixture={id:887799,competition:'en.1',league:'Premier League',home:'Club L',away:'Club B',kickoff:'2026-11-10T20:00:00.000Z',scheduled_time_known:1,home_goals:null,away_goals:null,source_checked_at:now};
 table.push(fixture);
 const model=estimateMatch(fixture,table.filter(m=>m.home_goals!==null),Date.parse(fixture.kickoff));
 const generated=makeCandidate(fixture,model);
 assert.equal(generated.visibility,'free','La simulación representa una candidata gratuita verdadera');
 const oldEvidence=JSON.parse(generated.evidence_json);oldEvidence.model.model='nforce-poisson-1.2';
 const row={id:1,...generated,evidence_json:JSON.stringify(oldEvidence),status:'draft'};
 const predictions=[],telegram=[];
 const conn=()=>({
  async beginTransaction(){},async commit(){},async rollback(){},release(){},
  async query(sql){if(sql.includes('FROM admins'))return [[{id:5}]];throw Error('Query inesperada: '+sql);},
  async execute(sql,args=[]){
   if(sql.includes('SELECT * FROM football_candidates WHERE id='))return [[row]];
   if(sql.includes('SELECT kickoff,home_goals,away_goals'))return [[fixture]];
   if(sql.includes('SELECT p.id FROM predictions'))return [[]];
   if(sql.includes('UPDATE football_candidates SET visibility=')){
    Object.assign(row,{visibility:args[0],home_team:args[1],away_team:args[2],league:args[3],kickoff:args[4],market:args[5],selection:args[6],provider_probability:args[7],analysis:args[8],evidence_json:args[9]});return [{affectedRows:1}];
   }
   if(sql.includes('INSERT INTO predictions')){predictions.push(args);return [{insertId:44}];}
   if(sql.includes("UPDATE football_candidates SET status='published'")){row.status='published';return [{affectedRows:1}];}
   if(sql.includes('INSERT INTO audit_logs')||sql.includes('UPDATE predictions SET telegram_status'))return [{affectedRows:1}];
   throw Error('Execute inesperada: '+sql);
  }
 });
 const db={getConnection:async()=>conn(),
  query:async(sql)=>{if(sql.includes('FROM nforce_matches'))return [table.map(m=>({...m,home_team:m.home,away_team:m.away,date_label:m.kickoff.slice(0,10),round_name:'Matchday 20'}))];throw Error('DB query inesperada: '+sql);},
  execute:async(sql,args)=>conn().execute(sql,args)};
 const app={get(){},post(){}};
 const engine=installNforceEngine(app,{db,authenticate(){},now:()=>now,sendTelegram:async payload=>{telegram.push(payload);return {state:'sent'};}});
 await assert.rejects(()=>engine.publish(1,{id:5}),/versión anterior/);
 const updated=await engine.refreshCandidate(1,{id:5});
 assert.equal(updated.refreshed,true);
 assert.equal(updated.visibility,'free');
 assert.equal(JSON.parse(row.evidence_json).model.model,MODEL_VERSION);
 assert.equal(predictions.length,0,'Reanalizar no publica ni envía');
 const approved=await engine.publish(1,{id:5});
 assert.equal(approved.published,true);
 assert.equal(approved.telegram,'sent');
 assert.equal(predictions.length,1);
 assert.equal(telegram[0].visibility,'free');
});
