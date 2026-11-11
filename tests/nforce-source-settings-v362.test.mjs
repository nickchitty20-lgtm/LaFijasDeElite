import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceEnabled,sourceEnabledFromRows,readSecondarySource,saveSecondarySource} from '../src/nforce-source-settings.js';
import {importSecondaryFixtures} from '../src/secondary-fixtures.js';
const source=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('fuente secundaria: el interruptor persistido tiene prioridad sobre la antigua variable',async()=>{
 assert.equal(sourceEnabled('1'),true);
 assert.equal(sourceEnabledFromRows([{source_id:'thesportsdb',enabled:0}]),false);
 assert.throws(()=>sourceEnabledFromRows([]),/No se ha inicializado/);
 const db={query:async()=>[[{source_id:'thesportsdb',enabled:0,updated_at:'2026-11-11',updated_by:1}]]};
 assert.equal((await readSecondarySource(db)).enabled,false);
 const calls=[];
 const conn={query:async sql=>{calls.push(sql);return [[]];},execute:async()=>{throw Error('No debería ejecutarse');}};
 const disabled=await importSecondaryFixtures({conn,env:{FOOTBALL_SECONDARY_SCHEDULE:'true'},enabled:false});
 assert.equal(disabled.enabled,false);assert.equal(calls.length,0);
 const enabled=await importSecondaryFixtures({conn,env:{FOOTBALL_SECONDARY_SCHEDULE:'false'},enabled:true,
  fetchLeague:async()=>[],fetchDay:async()=>[]});
 assert.equal(enabled.enabled,true);assert.ok(enabled.requests>=20);
});
test('guarda cambios reales con transacción y auditoría',async()=>{
 const events=[];
 let stored=0;
 const conn={
  beginTransaction:async()=>events.push('begin'),
  execute:async(sql,args)=>{
   if(sql.startsWith('SELECT enabled'))return [[{enabled:stored}]];
   if(sql.startsWith('UPDATE nforce_source_settings')){stored=args[0];events.push('updated');return [{affectedRows:1}];}
   if(sql.startsWith('INSERT INTO audit_logs')){events.push('audit');assert.deepEqual(JSON.parse(args[2]),{previous:false,enabled:true});return [{insertId:1}];}
   throw Error('SQL no esperado: '+sql);
  },
  commit:async()=>events.push('commit'),
  rollback:async()=>events.push('rollback'),
  release:()=>events.push('release')
 };
 const db={getConnection:async()=>conn};
 const result=await saveSecondarySource(db,{enabled:true,actorId:1});
 assert.deepEqual(result,{id:'thesportsdb',enabled:true,changed:true});
 assert.deepEqual(events,['begin','updated','audit','commit','release']);
 events.length=0;
 const repeat=await saveSecondarySource(db,{enabled:true,actorId:1});
 assert.equal(repeat.changed,false);assert.deepEqual(events,['begin','commit','release']);
 await assert.rejects(()=>saveSecondarySource(db,{enabled:'true',actorId:1}),/booleano/);
});
test('la base inicial conserva la decisión previa y la API es solo del propietario',()=>{
 const migrate=source('src/init-db.js'),engine=source('src/nforce-engine.js');
 assert.match(migrate,/CREATE TABLE IF NOT EXISTS nforce_source_settings/);
 assert.match(migrate,/INSERT IGNORE INTO nforce_source_settings/);
 assert.match(engine,/readSecondarySource\(conn\)/);
 assert.match(engine,/saveSecondarySource\(db/);
 assert.match(engine,/app\.post\(api\('sources\/secondary'\),authenticate/);
 assert.match(engine,/if\(!owner\(req\)\)return res\.status\(403\)/);
});
test('sección propietaria tiene interruptor, guardado y actualización de datos',()=>{
 const html=source('views/panel.html'),js=source('public/app.js');
 assert.match(html,/data-section="sources"/);
 assert.match(html,/data-panel="sources"/);
 assert.match(html,/sportsSecondaryToggle/);
 assert.match(html,/sportsSourcesImport/);
 assert.match(js,/loadSportsSources\(\)/);
 assert.match(js,/sources\/secondary/);
 assert.match(js,/body:JSON\.stringify\(\{enabled\}\)/);
 assert.match(js,/source.*sources/i);
});
