/** Schedule verification: independent of the predictive model.
 * A stale community fixture file is NEVER evidence of a live kick-off/status.
 * Optional verified schedule snapshots require an explicitly configured
 * provider key. No provider branding is exposed by the public API.
 */
import {footballApi} from './football-analysis.js';
import {NFORCE_PROVIDER} from './nforce-data.js';

const MINUTE=60_000;
const asUtc=v=>v instanceof Date?v:new Date(String(v??'').replace(' ','T')+(String(v??'').match(/(?:Z|[+-]\d\d:\d\d)$/)?'':'Z'));
const sqlUtc=v=>asUtc(v).toISOString().slice(0,19).replace('T',' ');
const matchDateUTC=v=>{const d=asUtc(v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null;};
const providerLeague=Object.freeze({39:'en.1',140:'es.1',78:'de.1',135:'it.1',61:'fr.1'});
export const LIVE_VERIFICATION_LEAGUES=Object.freeze(Object.values(providerLeague));
/** Scope of the optional independent source. Outside its league/date coverage,
 * a fresh local calendar is the available evidence; never require a feed that
 * cannot be queried. This does not claim a live verification occurred. */
export function independentScheduleCoverage({competition,kickoff}={}, {now=new Date(),env=process.env}={}){
 const enabled=env.FOOTBALL_SCHEDULE_LIVE==='true'&&Boolean(env.FOOTBALL_API_KEY);
 const supported=LIVE_VERIFICATION_LEAGUES.includes(String(competition||''));
 const fixtureDate=matchDateUTC(kickoff);
 const plan=env.FOOTBALL_SCHEDULE_PLAN==='extended'?'extended':'free';
 const dates=scheduleDatesForPlan(now,plan).map(r=>r.date);
 const inWindow=Boolean(fixtureDate&&dates.includes(fixtureDate));
 return {required:enabled&&supported&&inWindow,enabled,supported,in_window:inWindow,
  fixture_date:fixtureDate,plan,allowed_from:dates[0]||null,allowed_to:dates.at(-1)||null};
}
const STATUS=new Set(['NS','TBD','1H','HT','2H','ET','BT','P','FT','AET','PEN','PST','CANC','ABD','SUSP','INT','AWD','WO','LIVE']);
const sourceFreshMs=90*MINUTE;
const safeErr=e=>String(e?.message||e).replace(/(sk_live_|sk_test_|pk_live_|pk_test_)[^\s]+/g,'[redacted]').slice(0,160);
// Free API-Football fixtures are restricted to the provider's sliding date window.
// This window is independent from N-FORCE's 72-hour prediction horizon.
// On paid plans, FOOTBALL_SCHEDULE_PLAN=extended restores the previous four-day checks.
export function scheduleDatesForPlan(date,plan='free'){
 const now=date instanceof Date?date:new Date(date);
 if(!Number.isFinite(now.getTime()))return [];
 const origin=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
 const days=plan==='extended'?[{offset:0,frequency:30},{offset:1,frequency:120},{offset:2,frequency:240},{offset:3,frequency:360}]:
  [{offset:-1,frequency:360},{offset:0,frequency:30},{offset:1,frequency:120}];
 return days.map(({offset,frequency})=>({date:new Date(origin+offset*86400000).toISOString().slice(0,10),frequencyMs:frequency*MINUTE}));
}
export function allowedDateRangeFromError(error){
 const match=String(error?.message||error||'').match(/free plans do not have access to this date[^\n]*?try from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i);
 if(!match||match[1]>match[2])return null;
 return {from:match[1],to:match[2]};
}

export function cleanTeamName(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\b(fc|ac|afc|cf|sc|ss|as|cd|club|football|soccer)\b/g,' ')
  .replace(/\s+/g,' ').trim();
}
export function normalizeScheduleFixture(raw){
 const id=Number(raw?.fixture?.id);
 const when=raw?.fixture?.date;
 const start=typeof when==='string'?new Date(when):null;
 const league=providerLeague[Number(raw?.league?.id)];
 const home=cleanTeamName(raw?.teams?.home?.name),away=cleanTeamName(raw?.teams?.away?.name);
 const status=String(raw?.fixture?.status?.short||'').toUpperCase();
 if(!Number.isSafeInteger(id)||id<1||!league||!home||!away||home===away||
   !start||!Number.isFinite(start.getTime())||!STATUS.has(status))return null;
 // Do not create a precise kick-off for a fixture marked TBD.
 const kickoff=status==='TBD'?null:start.toISOString();
 return {id,league,home,away,kickoff,status};
}
export function linkSchedules(rows,providerRows,{maxDistanceHours=72}={}){
 const fixtures=(providerRows||[]).map(normalizeScheduleFixture).filter(Boolean);
 const result=[];
 for(const local of rows||[]){
  const lHome=cleanTeamName(local.home_team),lAway=cleanTeamName(local.away_team);
  const datePart=local.match_date instanceof Date?local.match_date.toISOString().slice(0,10):String(local.match_date||'').slice(0,10);
  const localDate=matchDateUTC(local.kickoff||`${datePart}T12:00:00Z`);
  const localMs=local.kickoff?asUtc(local.kickoff).getTime():localDate?Date.parse(localDate+'T12:00:00Z'):NaN;
  const existingId=Number(local.live_fixture_id)||null;
  const matches=fixtures.filter(f=>f.league===local.competition&&f.home===lHome&&f.away===lAway&&(
   (existingId&&existingId===f.id)||
   (f.kickoff&&Number.isFinite(localMs)&&Math.abs(Date.parse(f.kickoff)-localMs)<=maxDistanceHours*3600000)
  ));
  // Only uniquely identified home + away + league fixtures may change a schedule.
  if(matches.length===1)result.push({local,fixture:matches[0]});
 }
 return result;
}
export function schedulePresentation(record,{now=Date.now(),liveConfigured=false}={}){
 const verified=record?.verified_at?asUtc(record.verified_at).getTime():NaN;
 const freshness=Number.isFinite(verified)?now-verified:null;
 const finished=['FT','AET','PEN','CANC','AWD','WO'].includes(String(record?.status||'').toUpperCase());
 const fresh=liveConfigured&&freshness!==null&&freshness>=0&&(freshness<=sourceFreshMs||finished);
 const status=String(record?.status||'unknown').toUpperCase();
 const tentative=record?.kickoff?asUtc(record.kickoff):null;
 const kickoff=tentative&&Number.isFinite(tentative.getTime())?tentative.toISOString():null;
 const liveStatus=fresh?status:'UNVERIFIED';
 return {kickoff,verified_at:Number.isFinite(verified)?new Date(verified).toISOString():null,
  status:liveStatus,schedule_verified:fresh,live_configured:liveConfigured,
  message:!liveConfigured?'Sin fuente de horarios en vivo; hora orientativa.':
   !fresh?'Horario sin verificación reciente; no se confirma el inicio.':
   status==='TBD'?'Hora aún por confirmar.':
   ['FT','AET','PEN'].includes(status)?'Partido finalizado, pendiente de verificar resultado.':
   ['PST','CANC','ABD','SUSP','INT'].includes(status)?'Partido aplazado, suspendido o cancelado.':
   ['1H','HT','2H','ET','BT','P','LIVE'].includes(status)?'Partido en juego (última comprobación disponible).':
   'Horario comprobado recientemente.'};
}
export function installLiveSchedule(app,{db,authenticate,request=footballApi,now=()=>new Date(),env=process.env}={}){
 let interval=null,running=false,lastError=null,lastRun=null;
 let providerAllowedWindow=null;
 const configured=()=>env.FOOTBALL_SCHEDULE_LIVE==='true'&&Boolean(env.FOOTBALL_API_KEY);
 const plan=()=>env.FOOTBALL_SCHEDULE_PLAN==='extended'?'extended':'free';
 const eligibleId=x=>/^\d{1,18}$/.test(String(x));
 const asIds=raw=>{
  if(typeof raw!=='string'||raw.length>850)return [];
  const chunks=raw.split(',');
  if(chunks.length>50||!chunks.every(eligibleId))return [];
  return [...new Set(chunks)];
 };
 // Only published metadata is shared: NEVER emit markets, selections or VIP analyses.
 app.get('/api/schedules/live',async(req,res)=>{
  const ids=asIds(req.query.ids||'');
  if(!ids.length)return res.status(400).json({error:'IDs inválidos (máximo 50)'});
  try{
   const [rows]=await db.query(`SELECT p.id,p.match_date AS original_kickoff,s.kickoff AS verified_kickoff,s.status,
    s.checked_at AS verified_at FROM predictions p
    LEFT JOIN football_candidates c ON c.prediction_id=p.id AND c.provider=?
    LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=c.fixture_id
    WHERE p.published_at IS NOT NULL AND p.archived_at IS NULL AND p.id IN (${ids.map(()=>'?').join(',')})`,[NFORCE_PROVIDER,...ids]);
   res.set('Cache-Control','private, no-store').json({server_time:now().toISOString(),live_configured:configured(),
    schedules:rows.map(r=>({id:String(r.id),...schedulePresentation({
      kickoff:r.status==='TBD'&&r.verified_at?null:(r.verified_kickoff||r.original_kickoff),verified_at:r.verified_at,status:r.status
     },{now:now().getTime(),liveConfigured:configured()})}))});
  }catch(e){res.status(503).json({error:'Los horarios no están disponibles'});}
 });
 // Owner-only, on-demand verification for a single existing draft. It never
 // publishes, recalculates markets or invents an NS status.
 if(typeof app.post==='function')app.post('/api/admin/schedules/verify',authenticate,async(req,res)=>{
  if(req.admin?.role!=='owner')return res.status(403).json({error:'Solo creador'});
  const candidateId=String(req.body?.candidate_id??'');
  if(!/^\d{1,18}$/.test(candidateId))return res.status(400).json({error:'ID de propuesta inválido'});
  try{
   const [rows]=await db.query(`SELECT c.id,c.provider,c.status,c.fixture_id,c.kickoff AS candidate_kickoff,
     m.match_date,m.competition,m.home_goals,m.away_goals,m.source_checked_at,
     COALESCE(s.kickoff,m.kickoff) AS kickoff,s.status AS live_status,s.checked_at AS schedule_verified_at
     FROM football_candidates c JOIN nforce_matches m ON m.id=c.fixture_id
     LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id
     WHERE c.id=? LIMIT 1`,[candidateId]);
   const candidate=rows[0];
   if(!candidate||candidate.provider!==NFORCE_PROVIDER||candidate.status!=='draft')
    return res.status(404).json({error:'La propuesta no existe o ya no está pendiente.'});
   const coverage=independentScheduleCoverage(candidate,{now:now(),env});
   if(!coverage.enabled)return res.status(409).json({code:'not_configured',error:'No está activa la verificación independiente. Configura FOOTBALL_SCHEDULE_LIVE=true y FOOTBALL_API_KEY en Railway; mientras tanto, importa el calendario local y reanaliza la propuesta.'});
   if(!coverage.supported)return res.status(409).json({code:'league_not_covered',error:'Esta liga no está cubierta por el verificador de horarios. Actualiza los datos deportivos y reanaliza la propuesta con el calendario local reciente.'});
   if(!coverage.in_window)return res.status(409).json({code:'date_outside_plan',error:`El plan ${coverage.plan} solo admite verificaciones del ${coverage.allowed_from} al ${coverage.allowed_to} (UTC). Este partido es del ${coverage.fixture_date||'día no disponible'}. Puedes importar datos deportivos recientes y reanalizar, o comprobarlo cuando la fecha entre en cobertura.`});
   if(candidate.home_goals!=null||candidate.away_goals!=null||
       (candidate.live_status&&String(candidate.live_status).toUpperCase()!=='NS'))
    return res.status(409).json({code:'started_or_finished',error:'El partido figura iniciado, finalizado o aplazado. No se verificará para publicación.'});
   if(!Number.isFinite(asUtc(candidate.kickoff).getTime())||asUtc(candidate.kickoff).getTime()<=now().getTime()+20*MINUTE)
    return res.status(409).json({code:'kickoff_passed',error:'El partido comenzó o faltan menos de 20 minutos. No se puede publicar.'});
   if(providerAllowedWindow&&(coverage.fixture_date<providerAllowedWindow.from||coverage.fixture_date>providerAllowedWindow.to))
    return res.status(409).json({code:'provider_date_restricted',error:`El verificador ha restringido las consultas al ${providerAllowedWindow.from}–${providerAllowedWindow.to} (UTC). Actualiza datos deportivos recientes o vuelve a verificar cuando el partido entre en cobertura.`});
   const report=await sync({force:true,targetDate:coverage.fixture_date});
   const [[verified]]=await db.query(`SELECT s.kickoff,s.status,s.checked_at FROM nforce_fixture_schedules s
     WHERE s.nforce_match_id=? LIMIT 1`,[candidate.fixture_id]);
   const fresh=verified?.checked_at&&now().getTime()-asUtc(verified.checked_at).getTime()<=4*3600000&&
     now().getTime()>=asUtc(verified.checked_at).getTime();
   if(!fresh){
    const reason=report.reason||lastError||'No se consiguió asociar el horario del encuentro con una comprobación reciente.';
    return res.status(409).json({code:'schedule_not_verified',error:`No se pudo confirmar este partido: ${reason}. Sin confirmación, la publicación continúa bloqueada.`,requests:report.requests||0});
   }
   if(String(verified.status||'').toUpperCase()!=='NS'||!verified.kickoff)
    return res.status(409).json({code:'status_not_pre_match',error:'El estado verificado no es «no iniciado» o su horario está sin confirmar; no se puede publicar.'});
   const changed=Math.abs(asUtc(verified.kickoff).getTime()-asUtc(candidate.candidate_kickoff).getTime())>MINUTE;
   res.set('Cache-Control','no-store').json({verified:true,changed,requests:report.requests||0,
    message:changed?'Horario comprobado: cambió respecto a tu propuesta. Reanaliza la misma propuesta antes de aprobarla.':'Horario y estado NS comprobados. Revisa la propuesta; si utiliza un modelo antiguo, reanalízala antes de aprobarla.',
    checked_at:verified.checked_at});
  }catch(e){res.status(503).json({error:'No fue posible verificar el calendario: '+safeErr(e)});}
 });
 app.get('/api/admin/schedules/status',authenticate,async(req,res)=>{
  if(req.admin?.role!=='owner')return res.status(403).json({error:'Solo creador'});
  let latest=null;
  try{const [[r]]=await db.query('SELECT MAX(checked_at) AS last_verified,COUNT(*) AS linked FROM nforce_fixture_schedules');latest=r||null;}catch{}
  const dates=scheduleDatesForPlan(now(),plan());
  res.json({live_configured:configured(),interval_minutes:5,last_run:lastRun,last_error:lastError,
   verified_matches:Number(latest?.linked||0),latest_verified:latest?.last_verified||null,
   schedule_plan:plan(),allowed_dates_utc:dates.length?{from:dates[0].date,to:dates.at(-1).date}:null,
   note:configured()?plan()==='free'?'Plan gratuito: solo se verifican las fechas admitidas; los otros horarios son orientativos. No es una señal minuto a minuto.':'Comprobaciones periódicas, no una señal minuto a minuto.':'Activa FOOTBALL_SCHEDULE_LIVE=true y configura FOOTBALL_API_KEY para contrastar horarios.'});
 });
 async function sync({force=false,targetDate=null}={}){
  if(!configured())return {skipped:true,reason:'Sin conexión de calendario verificado'};
  if(targetDate&&!scheduleDatesForPlan(now(),plan()).some(row=>row.date===targetDate))return {skipped:true,reason:'Fecha fuera de cobertura del plan'};
  if(running)return {skipped:true,reason:'Otra comprobación en marcha'};
  running=true;
  let conn=null,locked=false,matched=0,queried=0;
  try{
   conn=await db.getConnection();
   const [[lock]]=await conn.query("SELECT GET_LOCK('fijas_live_schedule_sync',1) AS acquired");
   if(Number(lock?.acquired)!==1)return {skipped:true,reason:'Verificación en otra instancia'};
   locked=true;
   const today=now();
   // A firm daily limit protects the provider's free quota. The own model still works without it.
   const [[usage]]=await conn.query('SELECT COUNT(*) AS calls FROM nforce_schedule_requests WHERE requested_at>=UTC_DATE()');
   const maxCalls=Math.max(1,Math.min(75,Number(env.FOOTBALL_SCHEDULE_MAX_CALLS||70)));
   let remaining=Math.max(0,maxCalls-Number(usage.calls||0));
   const [runDates]=await conn.query('SELECT day_utc,MAX(requested_at) AS last_requested FROM nforce_schedule_requests WHERE day_utc>=DATE_SUB(UTC_DATE(),INTERVAL 1 DAY) AND day_utc<=DATE_ADD(UTC_DATE(),INTERVAL 3 DAY) GROUP BY day_utc');
   const previous=new Map(runDates.map(r=>[String(r.day_utc instanceof Date?r.day_utc.toISOString().slice(0,10):r.day_utc).slice(0,10),r.last_requested?asUtc(r.last_requested).getTime():0]));
   const fixtures=[];
   const utcToday=today.toISOString().slice(0,10);
   if(providerAllowedWindow?.asOf!==utcToday)providerAllowedWindow=null;
   let succeeded=0,cycleError=null;
   for(const {date,frequencyMs} of scheduleDatesForPlan(today,plan()).filter(row=>!targetDate||row.date===targetDate)){
    if(remaining<=0)break;
    // Respect a narrower window learned from the provider; refresh this boundary daily.
    if(providerAllowedWindow&&(date<providerAllowedWindow.from||date>providerAllowedWindow.to))continue;
    // A manual single-date request is throttled even if force=true, to avoid
    // consuming the daily quota through repeated clicks.
    if((!force||targetDate)&&today.getTime()-(previous.get(date)||0)<(targetDate?5*MINUTE:frequencyMs))continue;
    await conn.execute('INSERT INTO nforce_schedule_requests(day_utc,requested_at) VALUES (?,UTC_TIMESTAMP())',[date]);
    remaining--;queried++;
    try{
     const response=await request('fixtures',{date});
     succeeded++;fixtures.push(...(Array.isArray(response)?response:[]));
    }catch(e){
     const restricted=allowedDateRangeFromError(e);
     if(restricted){
      providerAllowedWindow={...restricted,asOf:utcToday};
      // This is a plan date restriction, not a connectivity outage. Don't log repeatedly.
      cycleError=`El plan no permite la fecha ${date}; rango admitido ${restricted.from} a ${restricted.to}.`;
     }else{
      cycleError=safeErr(e);
      console.warn('live schedule source unavailable:',cycleError);
     }
    }
   }
   if(cycleError)lastError=cycleError;
   else if(succeeded>0)lastError=null;
   if(fixtures.length){
    const [locals]=await conn.query(`SELECT m.id,m.competition,m.home_team,m.away_team,m.kickoff,m.match_date,s.provider_fixture_id AS live_fixture_id
     FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id
     WHERE m.match_date>=DATE_SUB(UTC_DATE(),INTERVAL 3 DAY) AND m.match_date<=DATE_ADD(UTC_DATE(),INTERVAL 7 DAY)
     AND m.home_goals IS NULL LIMIT 900`);
    for(const {local,fixture} of linkSchedules(locals,fixtures)){
     await conn.execute(`INSERT INTO nforce_fixture_schedules
      (nforce_match_id,provider_fixture_id,kickoff,status,checked_at)
      VALUES (?,?,?,?,UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE provider_fixture_id=VALUES(provider_fixture_id),
        kickoff=VALUES(kickoff),status=VALUES(status),checked_at=UTC_TIMESTAMP()`,
       [local.id,fixture.id,fixture.kickoff?sqlUtc(fixture.kickoff):null,fixture.status]);
     // Future predictions and proposals should use verified revised times.
     // Do not silently alter the historical selection, probability or outcome.
     if(fixture.kickoff){
      await conn.execute(`UPDATE predictions p JOIN football_candidates c ON c.prediction_id=p.id
        SET p.match_date=? WHERE c.provider=? AND c.fixture_id=? AND p.outcome='pending'
        AND p.archived_at IS NULL AND (p.match_date IS NULL OR ABS(TIMESTAMPDIFF(MINUTE,p.match_date,?))>=1)`,
       [sqlUtc(fixture.kickoff),NFORCE_PROVIDER,local.id,sqlUtc(fixture.kickoff)]);
     }
     matched++;
    }
   }
   lastRun=now().toISOString();
   return {ok:succeeded>0||queried===0,requests:queried,matched,remaining,
    reason:queried===0?(remaining===0?'Se agotó el cupo diario o la fecha fue consultada recientemente':'La fecha ya fue consultada recientemente o está restringida'):
    succeeded===0?(lastError||'Error de consulta del calendario'):matched===0?'El proveedor no encontró una coincidencia unívoca para este partido':null};
  }finally{if(conn){if(locked)await conn.query("SELECT RELEASE_LOCK('fijas_live_schedule_sync')").catch(()=>{});conn.release();}running=false;}
 }
 function start(){if(interval)return;
  interval=setInterval(()=>sync().catch(e=>{lastError=safeErr(e);console.warn('schedule sync:',lastError);}),5*MINUTE);interval.unref?.();
  setImmediate(()=>sync().catch(e=>{lastError=safeErr(e);}));
 }
 return {sync,start,stop:()=>{if(interval)clearInterval(interval);interval=null;},configured};
}
