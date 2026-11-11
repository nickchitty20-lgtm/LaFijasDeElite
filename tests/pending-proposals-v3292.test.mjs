import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installNforceEngine} from '../src/nforce-engine.js';
import {installFootballAutomation} from '../src/football-automation.js';

const candidate = (id,status,provider) => ({
 id,fixture_id:id+100,visibility:'free',home_team:'Local',away_team:'Visitante',
 league:'Prueba',kickoff:new Date('2026-11-15T17:00:00Z'),market:'1X2',selection:'Local',
 provider_probability:46,odds:null,analysis:'Prueba',evidence_json:'{}',status,
 prediction_id:null,created_at:new Date('2026-11-08T00:00:00Z'),provider
});

for(const [label, installer, provider] of [
 ['N-FORCE',installNforceEngine,'nforce-openfootball'],
 ['clásico',installFootballAutomation,'api-football']
]){
 test(`${label}: descartar retira de pendientes sin borrar el historial`, async()=>{
  const candidates=[candidate(1,'draft',provider),candidate(2,'discarded',provider),candidate(3,'published',provider)];
  const routes={};const app={
   get(route,...handlers){routes[`GET ${route}`]=handlers.at(-1);},
   post(route,...handlers){routes[`POST ${route}`]=handlers.at(-1);}
  };
  const executed=[];
  const db={
   async query(sql){
    if(sql.includes('FROM football_candidates')&&sql.includes('LIMIT')){
     // Comprobar que el SQL filtra en MySQL antes de aplicar el límite.
     assert.match(sql,/status='draft'/);
     return [candidates.filter(c=>c.status==='draft'&&(provider==='api-football'||c.provider===provider))];
    }
    if(sql.includes('FROM nforce_backtests'))return [[null]];
    throw Error('Consulta inesperada: '+sql);
   },
   async execute(sql,args){
    executed.push({sql,args});
    if(sql.includes('SELECT provider,visibility,status,prediction_id,published_at,evidence_json FROM football_candidates')){
     return [[candidates.find(c=>c.id===Number(args.at(-1))&&c.status==='draft')]];
    }
    if(sql.includes("UPDATE football_candidates SET status='discarded'")){
     const match=candidates.find(c=>c.id===Number(args.at(-1))&&c.status==='draft');
     if(!match)return [{affectedRows:0}];
     match.status='discarded';return [{affectedRows:1}];
    }
    if(sql.includes('INSERT INTO audit_logs'))return [{affectedRows:1}];
    throw Error('Escritura inesperada: '+sql);
   }
  };
  installer(app,{db,authenticate(){}});
  async function run(method,path,id){
   let status=200,body;
   const res={status(code){status=code;return this;},json(v){body=v;return this;}};
   const fn=routes[`${method} ${path}`];
   assert.ok(fn,`${method} ${path} registrado`);
   await fn({admin:{id:4,role:'owner'},params:{id}},res);
   return {status,body};
  }
  const endpoint='/api/admin/football/candidates';
  let result=await run('GET',endpoint);
  assert.deepEqual(result.body.candidates.map(c=>c.id),[1]);
  result=await run('POST',`${endpoint}/:id/discard`,1);
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(candidates[0].status,'discarded');
  assert.equal(candidates.length,3,'No se eliminan filas del historial');
  assert.equal(executed.some(x=>x.sql.includes('INSERT INTO audit_logs')),true);
  result=await run('GET',endpoint);
  assert.deepEqual(result.body.candidates,[],'La propuesta descartada ya no ocupa un lugar');
  result=await run('POST',`${endpoint}/:id/discard`,1);
  assert.equal(result.status,409,'No se puede descartar dos veces');
 });
}

test('panel retira tarjeta al confirmar descarte y mantiene reanalizar de propuestas GRATIS',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(action==='discard'&&response\.ok\)\s*\{[\s\S]*?item\.remove\(\)/);
 assert.match(app,/if\(!list\.querySelector\('\.football-candidate'\)\)/);
 assert.match(app,/Reanalizar esta propuesta/);
 const panel=readFileSync(new URL('../views/panel.html',import.meta.url),'utf8');
 assert.match(panel,/app\.js\?v=3\.6\.8/);
});
