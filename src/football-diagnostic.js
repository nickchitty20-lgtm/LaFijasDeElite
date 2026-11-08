import {footballApi,utcDate,upcomingFixtures,createAssessment,fixtureKickoff,DEFAULT_MAX_HOURS} from './football-analysis.js';
import {pickScanFixtures} from './football-scan-policy.js';

// A read-only check of real API-Football responses, never a simulated prediction.
// At most: status + up to two fixture dates + one prediction = four provider calls.
export async function diagnoseFootball({now=new Date(),request=footballApi}={}){
 const checkedAt=now.toISOString();
 const status=await request('status');
 const reqInfo=status?.requests||{};
 const end=new Date(now.getTime()+DEFAULT_MAX_HOURS*3600000);
 const dates=[utcDate(now)];
 if(utcDate(end)!==dates[0])dates.push(utcDate(end));
 const fixtures=[];
 for(const date of dates){
  const response=await request('fixtures',{date});
  if(!Array.isArray(response))throw Error('La API devolvió una respuesta inesperada para partidos.');
  fixtures.push(...response);
 }
 const upcoming=upcomingFixtures(fixtures,now);
 const result={
  ok:true,read_only:true,checked_at:checkedAt,api_connected:true,
  provider_requests_current:Number.isFinite(Number(reqInfo.current))?Number(reqInfo.current):null,
  provider_requests_limit:Number.isFinite(Number(reqInfo.limit_day??reqInfo.limit))?Number(reqInfo.limit_day??reqInfo.limit):null,
  fixtures_returned:fixtures.length,fixtures_in_window:upcoming.length,
  window:`1 a ${DEFAULT_MAX_HOURS} horas`,sample:null,reason:null,api_calls:1+dates.length
 };
 if(!upcoming.length){
  const future=fixtures.filter(f=>fixtureKickoff(f)&&fixtureKickoff(f)>now&&['NS','TBD'].includes(f?.fixture?.status?.short)).sort((a,b)=>fixtureKickoff(a)-fixtureKickoff(b));
  result.reason=future.length?`La API responde, pero no hay partidos válidos entre 1 y ${DEFAULT_MAX_HOURS} horas.`:'La API responde, pero no se encontraron partidos programados en las fechas consultadas.';
  if(future[0])result.next_fixture={match:`${future[0]?.teams?.home?.name||'?'} vs ${future[0]?.teams?.away?.name||'?'}`,kickoff:fixtureKickoff(future[0]).toISOString()};
  return result;
 }
 const first=pickScanFixtures(upcoming,1)[0];
 const id=first.fixture.id;
 result.sample={match:`${first.teams.home.name} vs ${first.teams.away.name}`,kickoff:fixtureKickoff(first).toISOString(),fixture_id:id};
 const predictions=await request('predictions',{fixture:id});
 result.api_calls++;
 if(!Array.isArray(predictions)||!predictions.length){
  result.reason='Se encontraron partidos próximos, pero el proveedor aún no ofrece una predicción para la muestra.';
  result.sample.prediction_available=false;
  return result;
 }
 result.sample.prediction_available=true;
 const analysis=createAssessment(first,predictions[0]);
 if(!analysis){
  result.reason='La API entrega predicciones, pero la muestra no cumple los filtros de confianza y evidencias. Esto es normal: no se inventan propuestas.';
  result.sample.passes_filters=false;
 }else{
  result.reason='API, partidos y predicciones comprobados. Esta muestra supera los filtros básicos (sin publicar).';
  result.sample.passes_filters=true;
  result.sample.visibility=analysis.visibility;
  result.sample.estimated_probability=analysis.confidence;
 }
 return result;
}
