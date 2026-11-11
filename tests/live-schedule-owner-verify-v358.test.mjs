import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {independentScheduleCoverage,installLiveSchedule} from '../src/live-schedule.js';

const date=new Date('2026-11-11T12:00:00Z');
const fixtureDate='2026-11-12T20:00:00Z';
const env={FOOTBALL_SCHEDULE_LIVE:'true',FOOTBALL_API_KEY:'mock-provider',FOOTBALL_SCHEDULE_PLAN:'free'};
const candidate={id:77,provider:'nforce-openfootball',status:'draft',fixture_id:101,competition:'fr.1',
 kickoff:new Date(fixtureDate),candidate_kickoff:new Date(fixtureDate),match_date:'2026-11-12',home_goals:null,away_goals:null,
 live_status:null,source_checked_at:new Date('2026-11-08T12:00:00Z')};
const response=()=>({code:200,headers:{},status(code){this.code=code;return this;},set(key,val){this.headers[key]=val;return this;},json(body){this.body=body;return this;}});
function harness({entry=candidate,providerResponse=null,clientEnv=env,previousRequest=null,verifiedOverride=null}={}){
 const routes=new Map();let providerCalls=0;let storedVerification=verifiedOverride;
 const previous=previousRequest;
 const local={id:101,competition:'fr.1',home_team:'Le Havre AC',away_team:'FC Lorient',match_date:'2026-11-12',kickoff:'2026-11-12 20:00:00'};
 const db={
  async query(sql,args=[]){
   if(sql.includes('FROM football_candidates c JOIN nforce_matches'))return [[entry]];
   if(sql.includes('SELECT s.kickoff,s.status,s.checked_at FROM nforce_fixture_schedules'))return [[storedVerification]];
   throw Error('Unexpected db.query '+sql.slice(0,100));
  },
  async getConnection(){return {
   async query(sql){
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
    if(sql.includes('COUNT(*) AS calls'))return [[{calls:0}]];
    if(sql.includes('GROUP BY day_utc'))return [previous?[{day_utc:'2026-11-12',last_requested:previous}]:[]];
    if(sql.includes('FROM nforce_matches m'))return [[local]];
    throw Error('Unexpected connection.query '+sql.slice(0,100));
   },
   async execute(sql,args=[]){
    if(sql.includes('INSERT INTO nforce_fixture_schedules'))storedVerification={kickoff:new Date(args[2]),status:args[3],checked_at:date};
    return [{affectedRows:1}];
   },release(){}
  };}
 };
 const app={get(route,...handlers){routes.set(route,handlers.at(-1));},post(route,...handlers){routes.set(route,handlers.at(-1));}};
 const updater=installLiveSchedule(app,{db,authenticate(){},now:()=>date,env:clientEnv,
  request:async(endpoint,{date:requestedDate})=>{
   assert.equal(endpoint,'fixtures');assert.equal(requestedDate,'2026-11-12');providerCalls++;
   return providerResponse??[{fixture:{id:444,date:fixtureDate,status:{short:'NS'}},league:{id:61},
    teams:{home:{name:'Le Havre'},away:{name:'FC Lorient'}}}];
  }});
 const run=async({body={candidate_id:77},admin={role:'owner'}}={})=>{
  const res=response();await routes.get('/api/admin/schedules/verify')({body,admin},res);return res;
 };
 return {run,updater,getProviderCalls:()=>providerCalls,app};
}

test('solo el dueño puede pedir verificación de una propuesta pendiente',async()=>{
 const h=harness();
 const denied=await h.run({admin:{role:'staff'}});
 assert.equal(denied.code,403);assert.equal(h.getProviderCalls(),0);
 const invalid=await h.run({body:{candidate_id:'1 OR 1=1'}});
 assert.equal(invalid.code,400);assert.equal(h.getProviderCalls(),0);
});

test('la cobertura independiente depende de la liga y del plan, no solo de la clave global',()=>{
 const covered=independentScheduleCoverage(candidate,{now:date,env});
 assert.equal(covered.required,true);
 assert.equal(independentScheduleCoverage({...candidate,competition:'xx.unknown'},{now:date,env}).required,false);
 assert.equal(independentScheduleCoverage({...candidate,kickoff:'2026-11-15T20:00:00Z'},{now:date,env}).required,false);
 assert.equal(independentScheduleCoverage({...candidate,kickoff:'2026-11-15T20:00:00Z'},{now:date,env:{...env,FOOTBALL_SCHEDULE_PLAN:'extended'}}).required,false);
 assert.equal(independentScheduleCoverage({...candidate,kickoff:'2026-11-14T20:00:00Z'},{now:date,env:{...env,FOOTBALL_SCHEDULE_PLAN:'extended'}}).required,true);
});

test('comprobación manual del calendario confirma NS en la fecha del partido sin crear publicaciones',async()=>{
 const h=harness();const result=await h.run();
 assert.equal(result.code,200,JSON.stringify(result.body));
 assert.equal(result.body.verified,true);
 assert.equal(result.body.changed,false);
 assert.equal(result.body.requests,1);
 assert.equal(h.getProviderCalls(),1);
});

test('si proveedor no devuelve una coincidencia verificable, publicar sigue bloqueado',async()=>{
 const h=harness({providerResponse:[]});const result=await h.run();
 assert.equal(result.code,409);
 assert.equal(result.body.code,'schedule_not_verified');
 assert.match(result.body.error,/bloqueada/);
 assert.equal(h.getProviderCalls(),1);
});

test('no consulta proveedor en liga no cubierta, fecha fuera de plan o sin configuración',async()=>{
 const fixtures=[
  {entry:{...candidate,competition:'xx.unknown'},code:'league_not_covered'},
  {entry:{...candidate,kickoff:new Date('2026-11-16T20:00:00Z')},code:'date_outside_plan'},
  {clientEnv:{FOOTBALL_SCHEDULE_LIVE:'false',FOOTBALL_API_KEY:'mock-provider'},code:'not_configured'}
 ];
 for(const f of fixtures){const h=harness(f);const r=await h.run();
  assert.equal(r.code,409);assert.equal(r.body.code,f.code);assert.equal(h.getProviderCalls(),0);}
});

test('si un encuentro cambió de horario, indica reanálisis y no publica',async()=>{
 const h=harness({providerResponse:[{fixture:{id:444,date:'2026-11-12T21:00:00Z',status:{short:'NS'}},league:{id:61},teams:{home:{name:'Le Havre'},away:{name:'FC Lorient'}}}]});
 const r=await h.run();assert.equal(r.code,200);assert.equal(r.body.changed,true);
 assert.match(r.body.message,/Reanaliza la misma propuesta/);
});

test('clics repetidos no gastan más peticiones del cupo: se exige separación mínima',async()=>{
 const h=harness({previousRequest:new Date('2026-11-11T11:59:00Z')});
 const r=await h.run();assert.equal(r.code,409);assert.equal(h.getProviderCalls(),0);
 assert.match(r.body.error,/No se pudo confirmar/);
});

test('panel incluye botón para verificar estado y conserva publicación bloqueada hasta verificar',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/Verificar horario y estado del partido/);
 assert.match(js,/\/api\/admin\/schedules\/verify/);
 assert.match(js,/c\.source_readiness&&!c\.source_readiness\.ready/);
});
