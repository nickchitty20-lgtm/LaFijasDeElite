import {freeTelegramDestination} from './telegram-public.js';
import {footballApi,utcDate,upcomingFixtures,createAssessment,extractMatchWinnerOdds,kickOffString,DEFAULT_MAX_HOURS,headToHeadParams} from './football-analysis.js';
import {diagnoseFootball} from './football-diagnostic.js';
import {pickScanFixtures,canRunManual,MANUAL_SCAN_DAILY_LIMIT} from './football-scan-policy.js';
import {predictedResult} from './football-analysis.js';
import {sendPredictionToTelegram} from './telegram-bridge.js';
import {publishedFootballDetails} from './football-report.js';
import {canAutoPublishCandidate} from './football-publication-policy.js';
import {fetchAdvancedSnapshot,advancedAnalysisLines} from './football-advanced.js';

const SCAN_COOLDOWN_MINUTES=240;
const EMPTY_SCAN_RETRY_MINUTES=60;
const NO_MATCH_RETRY_MINUTES=30;
// Inspect existing drafts every 15 minutes; API scan cooldown is separate.
const DEFAULT_SCAN_INTERVAL_MS=15*60*1000;
// A valid empty scan should NOT block four hours. Revisit new fixtures sooner,
// but still respect the provider daily budget and per-minute rate limit.
export function scanRetryWindow(prior){
 if(!prior?.started_at)return {minutes:0,next_at:null,reason:'Sin escaneos anteriores'};
 const drafts=Number(prior.drafts_created||0);
 const examined=Number(prior.examined||0);
 const minutes=drafts>0?SCAN_COOLDOWN_MINUTES:(examined>0?EMPTY_SCAN_RETRY_MINUTES:NO_MATCH_RETRY_MINUTES);
 const raw=prior.started_at;
 const started=raw instanceof Date?raw:new Date(String(raw).includes('T')?String(raw):String(raw).replace(' ','T')+'Z');
 const timestamp=started.getTime();
 return {minutes,next_at:Number.isFinite(timestamp)?new Date(timestamp+minutes*60000).toISOString():null,
  reason:drafts>0?'Último escaneo creó propuestas':examined>0?'Último escaneo no creó propuestas':'Sin partidos nuevos analizados'};
}

const validId=id=>/^\d{1,18}$/.test(String(id));
const sqlDateToUtc=value=>value instanceof Date?value:new Date(String(value).replace(' ','T')+'Z');
const safeError=e=>String(e?.message||e).replace(/(sk_live_|sk_test_|pk_live_|pk_test_)[^\s]+/g,'[redacted]').slice(0,160);

async function defaultEnqueueEvent(db,predictionId,visibility){
 const {enqueuePredictionEvent}=await import('./notification-center.js');
 return enqueuePredictionEvent(db,predictionId,visibility);
}
// A large fixture day can have >100 matches. Filtering known games
// before ranking means a new covered match will not be starved by old ones.
export function selectFreshFixtures(upcoming,knownIds=new Set(),deferredIds=new Set()){
 const games=Array.isArray(upcoming)?upcoming:[];
 const id=f=>Number(f?.fixture?.id);
 const alreadyPresent=games.filter(f=>knownIds.has(id(f))).length;
 const recentlySkipped=games.filter(f=>!knownIds.has(id(f))&&deferredIds.has(id(f))).length;
 const fresh=games.filter(f=>!knownIds.has(id(f))&&!deferredIds.has(id(f)));
 return {fixtures:pickScanFixtures(fresh,10),alreadyPresent,recentlySkipped};
}

export function installFootballAutomation(app,{db,authenticate,request=footballApi,sendTelegram=sendPredictionToTelegram,enqueueEvent=defaultEnqueueEvent}){
 let scanning=false;
 let publishing=false;
 let lastScanReport=null;
 let lastPublishReport=null;
 let lastSchedulerMessage=null;
 let lastError='';
 let lastSuccess=null;
 let lastDiagnostic=null;
 let lastDiagnosticAt=0;
 let dailyDiagnosticCount=0;
 let diagnosticDay='';
 const isOwner=req=>req.admin?.role==='owner';

 async function scan({manual=false}={}){
  if(scanning)return {busy:true,message:'Análisis en ejecución.'};
  if(!process.env.FOOTBALL_API_KEY)throw Error('Configura FOOTBALL_API_KEY en Railway');
  scanning=true;
  let lock;
  try{lock=await db.getConnection();}catch(error){scanning=false;throw error;}
  let acquired=false;
  try{
   const [[lockRow]]=await lock.query("SELECT GET_LOCK('fijas_football_auto_scan',1) AS acquired");
   if(Number(lockRow.acquired)!==1)return {busy:true,message:'Otro proceso está analizando.'};
   acquired=true;
   // Manual checks are independent of the 4-hour automatic cooldown.
   // They have a transparent, small daily limit persisted in MySQL.
   if(manual){
    const [[used]]=await lock.query("SELECT COUNT(*) AS total,MAX(started_at) AS latest FROM football_scans WHERE initiated_by='manual' AND DATE(started_at)=UTC_DATE()");
    const allowance=canRunManual({countToday:Number(used.total),lastStartedAt:used.latest?new Date(used.latest).toISOString():null});
    if(!allowance.allowed)return {cooldown:true,next_scan_at:allowance.nextAt,remaining_manual_scans:allowance.remaining,message:allowance.reason};
   }else{
    const [[prior]]=await lock.query("SELECT started_at,examined,drafts_created FROM football_scans WHERE status='completed' ORDER BY id DESC LIMIT 1");
    const retry=scanRetryWindow(prior);
    if(retry.next_at && Date.now()<Date.parse(retry.next_at)){
     return {cooldown:true,next_scan_at:retry.next_at,message:`Próxima búsqueda: ${retry.next_at}. ${retry.reason}. Puedes ejecutar el análisis manual sujeto al límite diario.`};
    }
   }
   // Status does not consume the daily quota. Stop before an expensive scan
   // when there are insufficient remaining calls on the provider account.
   const account=await request('status');
   const used=Number(account?.requests?.current), limit=Number(account?.requests?.limit_day);
   // Leave a 20-call reserve for later checks and diagnostics. A complete
   // scan may spend at most 18 calls INCLUDING optional research. Unknown
   // provider quota means conservative fallback (10 calls).
   const available=Number.isFinite(used)&&Number.isFinite(limit)&&limit>0?Math.max(0,limit-used):null;
   const maxCalls=available===null?10:Math.max(0,Math.min(18,Math.floor(available-20)));
   if(maxCalls<7){
    return {cooldown:true,message:`API-Football: ${available===null?'cuota desconocida':`quedan ${available} de ${limit} consultas`}. Se reserva presupuesto para las siguientes horas; no se analiza por ahora.`,provider_quota_remaining:available};
   }
   let spent=0;
   const budgetedApi=async(endpoint,params={})=>{
    if(spent>=maxCalls)throw Error('Presupuesto de consultas agotado en este escaneo');
    spent++;
    return request(endpoint,params);
   };
   const [created]=await lock.execute('INSERT INTO football_scans (status,initiated_by,started_at) VALUES (?,?,UTC_TIMESTAMP())',['running',manual?'manual':'scheduled']);
   const runId=created.insertId;
   const now=new Date();
   let examined=0,drafts=0,missingPredictions=0,discardedByFilters=0,providerErrors=0,qualified=0;
   let windowMatches=0;
   const rejectionExamples=[];
   const warnings=[];
   try{
    const end=new Date(now.getTime()+DEFAULT_MAX_HOURS*3600000);
    const dates=[utcDate(now)];
    if(utcDate(end)!==dates[0])dates.push(utcDate(end));
    const games=[];
    for(const date of dates){games.push(...await budgetedApi('fixtures',{date}));}
    const upcoming=upcomingFixtures(games,now);
    windowMatches=upcoming.length;
    // Filter already known/deferred fixtures BEFORE selecting the best ten.
    // Previously, 100 top-ranked fixtures were selected first, potentially
    // excluding all newly available matches when the first 100 were known.
    const [known]=await lock.query("SELECT fixture_id FROM football_candidates WHERE provider='api-football' AND kickoff>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)");
    const knownIds=new Set(known.map(x=>Number(x.fixture_id)));
    const [notYet]=await lock.query("SELECT fixture_id FROM football_fixture_checks WHERE provider='api-football' AND next_retry_at>UTC_TIMESTAMP()");
    const deferredIds=new Set(notYet.map(x=>Number(x.fixture_id)));
    const selected=selectFreshFixtures(upcoming,knownIds,deferredIds);
    const {fixtures,alreadyPresent,recentlySkipped}=selected;
    const deferFixture=async(id,reason,hours)=>lock.execute(`INSERT INTO football_fixture_checks
      (provider,fixture_id,reason,checked_at,next_retry_at)
      VALUES ('api-football',?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? HOUR))
      ON DUPLICATE KEY UPDATE reason=VALUES(reason),checked_at=VALUES(checked_at),next_retry_at=VALUES(next_retry_at)`,[id,reason,hours]);
    const maxPredictions=Math.max(0,Math.min(10,maxCalls-dates.length-3));
    const candidateCount={free:0,vip:0};
    let h2hQueries=0,oddsQueries=0,advancedQueries=0;
    for(const fixture of fixtures){
     if(examined>=maxPredictions)break;
     examined++;
     let predictionArr;
     try{predictionArr=await budgetedApi('predictions',{fixture:fixture.fixture.id});}
     catch(error){
      providerErrors++;
      const warning=`Predicciones de ${fixture.teams.home.name} vs ${fixture.teams.away.name}: ${safeError(error)}`;
      warnings.push(warning);console.warn('football predictions unavailable:',warning);
      continue; // A rejected fixture must not abort all remaining fixtures.
     }
     const pred=predictionArr[0];
     if(!pred){
      missingPredictions++;
      await deferFixture(fixture.fixture.id,'no_prediction',6);
      if(rejectionExamples.length<5)rejectionExamples.push({match:`${fixture.teams.home.name} vs ${fixture.teams.away.name}`,reason:'Sin predicción disponible del proveedor'});
      continue;
     }
     // Preliminary assessment uses provider's own h2h when available.
     let assessment=createAssessment(fixture,pred);
     // The provider's embedded H2H may lack completed scores. Spend at most one
     // optional H2H call per scan also for an eligible candidate, so goals can
     // be explained from actual results. Do not let this call block publication.
     const usableH2h=(Array.isArray(pred?.h2h)?pred.h2h:[]).filter(x=>x?.fixture?.status?.short==='FT'&&Number.isInteger(x?.goals?.home)&&Number.isInteger(x?.goals?.away)).length;
     if((!assessment || (assessment && usableH2h<3)) && h2hQueries<1 && spent<maxCalls-(maxPredictions-examined)-2 && (predictedResult(pred)?.confidence??0)>=40){
      h2hQueries++;
      const head=Number(fixture.teams.home.id),away=Number(fixture.teams.away.id);
      try{
       // `last` is forbidden by API-Football Free. Limit results locally.
       const h2h=await budgetedApi('fixtures/headtohead',headToHeadParams(head,away));
       assessment=createAssessment(fixture,pred,{h2h})||assessment;
      }catch(error){
       const warning=`Antecedentes no disponibles para ${fixture.teams.home.name} vs ${fixture.teams.away.name}: ${safeError(error)}`;
       warnings.push(warning);console.warn('football h2h optional:',warning);
       // H2H is supplementary; do not fail the scan because it is unavailable.
      }
     }
     if(!assessment){
      discardedByFilters++;
      await deferFixture(fixture.fixture.id,'below_filters',8);
      if(rejectionExamples.length<5){
       const best=predictedResult(pred);
       const reason=!best?'Probabilidades 1X2 incompletas o inconsistentes':
        `Mayor estimación ${best.confidence}% y margen ${best.margin} puntos: insuficiente confianza o evidencia para los filtros.`;
       rejectionExamples.push({match:`${fixture.teams.home.name} vs ${fixture.teams.away.name}`,reason});
      }
      continue;
     }
     // A few per visibility; no duplicate fixtures even across redeploys.
     if(candidateCount[assessment.visibility]>=3)continue;
     candidateCount[assessment.visibility]++;
     qualified++;
     // The free preview is educational and may have no quoted bookmaker odds.
     // Reserve the scarce optional odds request for an eligible VIP candidate.
     if(oddsQueries<1&&assessment.visibility==='vip'&&spent<maxCalls-(maxPredictions-examined)-2){
      oddsQueries++;
      try{
       const oddsArr=await budgetedApi('odds',{fixture:fixture.fixture.id,page:1});
       const exact=extractMatchWinnerOdds(oddsArr,assessment.selection,assessment.home,assessment.away);
       if(exact){assessment.odds=exact.odds;assessment.raw_evidence.bookmaker=exact.bookmaker;}
      }catch(e){console.warn('football odds optional:',safeError(e));}
     }
     // Supplementary research is capped to ONE eligible match per scan for
     // Free API quotas (~3 requests); other matches retain provider form data.
     if(advancedQueries<1&&spent<maxCalls-(maxPredictions-examined)-2){
      advancedQueries++;
      try{
       const extended=await fetchAdvancedSnapshot({fixture,prediction:pred,api:budgetedApi,now});
       assessment.raw_evidence.advanced=extended;
       const base=assessment.analysis.split('\n\n[ESTUDIO AVANZADO V2.2]')[0].slice(0,5700);
       assessment.analysis=(base+'\n\n[ESTUDIO AVANZADO V2.2]\n'+advancedAnalysisLines(extended).join('\n')).slice(0,7900);
      }catch(err){console.warn('football advanced optional:',safeError(err));}
     }
     const [insert]=await lock.execute(`INSERT IGNORE INTO football_candidates
      (provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,[
       assessment.provider,assessment.fixture_id,assessment.visibility,assessment.home,assessment.away,assessment.league,
       assessment.kickoff,assessment.market,assessment.selection,assessment.confidence,assessment.odds,
       assessment.analysis,JSON.stringify(assessment.raw_evidence)]);
     if(insert.affectedRows)drafts++;
    }
    // If every provider prediction failed, keep this scan retryable instead of
    // erroneously applying the four-hour success cooldown.
    if(examined>0 && providerErrors===examined)throw Error(warnings[0]||'No se pudieron consultar predicciones');
    await lock.execute("UPDATE football_scans SET status='completed',finished_at=UTC_TIMESTAMP(),examined=?,drafts_created=?,window_matches=?,without_prediction=?,below_filters=?,provider_errors=?,qualified=?,already_present=?,recently_skipped=? WHERE id=?",[examined,drafts,windowMatches,missingPredictions,discardedByFilters,providerErrors,qualified,alreadyPresent,recentlySkipped,runId]);
    lastError='';lastSuccess=Date.now();
    lastScanReport={ok:true,fixtures_in_window:windowMatches,examined,drafts_created:drafts,qualified,already_present:alreadyPresent,recently_skipped:recentlySkipped,
     provider_calls:spent+1,provider_budget:maxCalls+1,without_prediction:missingPredictions,below_filters:discardedByFilters,
     provider_errors:providerErrors,rejection_examples:rejectionExamples,warnings:warnings.slice(0,4),mode:manual?'manual':'scheduled',
     note:drafts?'Se guardaron propuestas reales. Si la autopublicación está activa, se publicarán sin aprobación manual.':
       'Sin nuevas propuestas: revisa los descartes y propuestas existentes. Nunca se inventan pronósticos.'};
    return lastScanReport;
   }catch(e){
    lastError=safeError(e);
    lastScanReport={ok:false,error:lastError};
    await lock.execute("UPDATE football_scans SET status='failed',finished_at=UTC_TIMESTAMP(),error_message=? WHERE id=?",[lastError,runId]);
    throw e;
   }
  }finally{
   if(acquired)await lock.query("SELECT RELEASE_LOCK('fijas_football_auto_scan')").catch(()=>{});
   lock.release();scanning=false;
  }
 }

 async function publish(id,admin,{automatic=false}={}){
  if(!validId(id))throw Error('ID de análisis inválido');
  const conn=await db.getConnection();
  let row,predictionId;
  try{
   await conn.beginTransaction();
   const [candidates]=await conn.execute("SELECT * FROM football_candidates WHERE id=? FOR UPDATE",[id]);
   row=candidates[0];
   if(!row||row.status!=='draft'){await conn.rollback();return {published:false,reason:'Ya procesado o inexistente'};}
   const when=sqlDateToUtc(row.kickoff);
   if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now()+10*60000)throw Error('El partido está demasiado cerca o ya comenzó');
   if(automatic){
    if(!canAutoPublishCandidate(row))throw Error('No cumple requisitos para publicación automática: evidencias y probabilidad insuficientes');
    const [[count]]=await conn.execute(`SELECT COUNT(*) AS total FROM football_candidates
     WHERE visibility=? AND status='published' AND DATE(published_at)=UTC_DATE()`,[row.visibility]);
    const limit=row.visibility==='vip'?2:1;
    if(Number(count.total)>=limit){await conn.rollback();return {published:false,reason:'Límite diario alcanzado'};}
   }
   const [[owner]]=await conn.query("SELECT id FROM admins WHERE role='owner' AND is_active=1 ORDER BY id LIMIT 1");
   if(!owner)throw Error('No existe una cuenta de dueño activa para atribuir el pronóstico');
   const title=`${row.home_team} vs ${row.away_team}`.slice(0,200);
   const [p]=await conn.execute(`INSERT INTO predictions
    (title,analysis,visibility,outcome,published_at,author_id,league,match_date,market,selection,odds,telegram_status)
    VALUES (?,?,?,'pending',UTC_TIMESTAMP(),?,?,?,?,?,?,'pending')`,[
    title,row.analysis,row.visibility,owner.id,row.league,row.kickoff,row.market,row.selection,row.odds]);
   predictionId=p.insertId;
   await conn.execute("UPDATE football_candidates SET status='published',prediction_id=?,published_at=UTC_TIMESTAMP() WHERE id=?",[predictionId,id]);
   await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,?, 'prediction', ?, JSON_OBJECT('candidate_id',?,'fixture_id',?,'automatic',?))",[
    automatic?null:admin?.id,'football_prediction_published',String(predictionId),id,row.fixture_id,automatic?1:0]);
   await conn.commit();
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  // Telegram is outside transaction: failures never undo a prediction stored on the site.
  const payload={id:predictionId,title:`${row.home_team} vs ${row.away_team}`,analysis:row.analysis,
   visibility:row.visibility,league:row.league,match_date:kickOffString(sqlDateToUtc(row.kickoff)),market:row.market,
   selection:row.selection,odds:row.odds,estimated_probability:Number(row.provider_probability),auto_generated:true,football_details:publishedFootballDetails(row.evidence_json)};
  let telegram='not_configured';
  try{telegram=(await sendTelegram(payload,process.env,{db})).state;}
  catch(e){telegram='failed';console.error('auto prediction Telegram:',safeError(e));}
  await db.execute('UPDATE predictions SET telegram_status=? WHERE id=?',[telegram,predictionId]);
  try{await enqueueEvent(db,predictionId,row.visibility);}catch(e){console.warn('auto notification enqueue:',safeError(e));}
  return {published:true,prediction_id:predictionId,telegram};
 }

 // Dispatch eligible existing drafts even when a fresh provider scan is on cooldown.
 // MySQL advisory lock serializes this across multiple Railway instances.
 async function publishPending(){
  if(publishing||process.env.FOOTBALL_AUTO_PUBLISH!=='true')return {skipped:true,reason:'Publicación desactivada u ocupada'};
  publishing=true;let conn,acquired=false;
  let sent=0,failed=0,blockedByFilters=0,missingChannel=0,dailyLimit=0;
  try{
   conn=await db.getConnection();
   const [[lk]]=await conn.query("SELECT GET_LOCK('fijas_football_dispatch',1) AS acquired");
   if(Number(lk.acquired)!==1)return {busy:true};
   acquired=true;
   const [rows]=await conn.query("SELECT * FROM football_candidates WHERE status='draft' AND kickoff>DATE_ADD(UTC_TIMESTAMP(),INTERVAL 20 MINUTE) AND kickoff<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 25 HOUR) ORDER BY kickoff ASC LIMIT 60");
   for(const row of rows){
    if(!canAutoPublishCandidate(row)){blockedByFilters++;continue;}
    // Don't silently announce a VIP on the web without a usable VIP channel.
    // Free picks likewise require the actual community group.
    const canSend=row.visibility==='vip'?
      !!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID):
      !!(process.env.TELEGRAM_BOT_TOKEN&&freeTelegramDestination(process.env));
    if(!canSend){missingChannel++;continue;}
    try{const r=await publish(row.id,null,{automatic:true});if(r?.published)sent++;else if(r?.reason==='Límite diario alcanzado')dailyLimit++;}
    catch(e){failed++;console.warn('football auto publish error:',safeError(e));}
    if(sent>=3)break;
   }
   lastPublishReport={at:new Date().toISOString(),published:sent,failed,reviewed:rows.length,blocked_by_filters:blockedByFilters,missing_channel:missingChannel,daily_limit:dailyLimit,reason:!sent?(missingChannel?'Faltan token/ID de Telegram para al menos un candidato.':blockedByFilters?'Propuestas pendientes sin evidencias o confianza suficientes.':dailyLimit?'Límite de publicaciones de hoy alcanzado.':'No hay propuestas futuras pendientes aptas.') : null};
   return lastPublishReport;
  }finally{
   if(acquired)await conn.query("SELECT RELEASE_LOCK('fijas_football_dispatch')").catch(()=>{});
   conn?.release();publishing=false;
  }
 }

 app.get('/api/admin/football/status',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [[stats]]=await db.query(`SELECT
    (SELECT COUNT(*) FROM football_candidates WHERE status='draft') AS drafts,
    (SELECT COUNT(*) FROM football_candidates f JOIN predictions p ON p.id=f.prediction_id WHERE f.status='published' AND p.archived_at IS NULL) AS published,
    (SELECT SUM(outcome='won') FROM predictions p JOIN football_candidates f ON f.prediction_id=p.id WHERE f.status='published') AS won,
    (SELECT SUM(outcome='lost') FROM predictions p JOIN football_candidates f ON f.prediction_id=p.id WHERE f.status='published') AS lost`);
   const [[latest]]=await db.query('SELECT status,initiated_by,started_at,finished_at,error_message,examined,drafts_created,window_matches,without_prediction,below_filters,provider_errors,qualified,already_present,recently_skipped FROM football_scans ORDER BY id DESC LIMIT 1');
   const [[lastComplete]]=await db.query("SELECT started_at,examined,drafts_created FROM football_scans WHERE status='completed' ORDER BY id DESC LIMIT 1");
   const scanWindow=scanRetryWindow(lastComplete);
   const [[manualUsage]]=await db.query("SELECT COUNT(*) AS total,MAX(started_at) AS latest FROM football_scans WHERE initiated_by='manual' AND DATE(started_at)=UTC_DATE()");
   const allowance=canRunManual({countToday:Number(manualUsage.total),lastStartedAt:manualUsage.latest?new Date(manualUsage.latest).toISOString():null});
   const decided=Number(stats.won||0)+Number(stats.lost||0);
   res.json({configured:!!process.env.FOOTBALL_API_KEY,auto_scan:process.env.FOOTBALL_AUTO_SCAN==='true',
    auto_publish:process.env.FOOTBALL_AUTO_PUBLISH==='true',
    free_public_full:true,telegram_free_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&freeTelegramDestination(process.env)),telegram_vip_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID),
    drafts:Number(stats.drafts||0),published:Number(stats.published||0),
    won:Number(stats.won||0),lost:Number(stats.lost||0),accuracy:decided?Number((stats.won*100/decided).toFixed(1)):null,
    latest:latest||null,scanning,publishing,last_scan_report:lastScanReport,last_publish_report:lastPublishReport,last_scheduler_message:lastSchedulerMessage,last_error:lastError,last_success:lastSuccess,scheduled_retry_at:process.env.FOOTBALL_AUTO_SCAN==='true'?scanWindow.next_at:null,scheduled_retry_reason:scanWindow.reason,
    manual_scan:{available:allowance.allowed,remaining:allowance.remaining,next_at:allowance.nextAt,reason:allowance.reason,daily_limit:MANUAL_SCAN_DAILY_LIMIT},
    diagnostic:lastDiagnostic?{...lastDiagnostic,cached:false}:null});
  }catch(e){res.status(500).json({error:'No se pudo consultar el motor deportivo'});}
 });
 app.get('/api/admin/football/candidates',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.query(`SELECT id,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status,prediction_id,created_at FROM football_candidates WHERE status='draft' ORDER BY id DESC LIMIT 30`);
   const candidates=rows.map(row=>{
    let evidence={};
    try{evidence=typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json||{};}catch{}
    const {evidence_json,...publicRow}=row;
    return {...publicRow,goal_projection:evidence.goals||null,match_context:evidence.match_context||null,advanced:evidence.advanced||null};
   });
   res.json({candidates});
  }
  catch(e){res.status(500).json({error:'No se pudieron cargar los análisis'});}
 });
 // Read-only live diagnostic: independent of the 3-hour full-scan cooldown.
 // Never creates proposals, publishes predictions or sends Telegram messages.
 app.post('/api/admin/football/test',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  if(!process.env.FOOTBALL_API_KEY)return res.status(400).json({error:'Falta FOOTBALL_API_KEY en Railway'});
  const now=Date.now(),today=new Date(now).toISOString().slice(0,10);
  if(lastDiagnostic&&now-lastDiagnosticAt<60000)return res.json({...lastDiagnostic,cached:true});
  if(diagnosticDay!==today){diagnosticDay=today;dailyDiagnosticCount=0;}
  if(dailyDiagnosticCount>=4)return res.status(429).json({error:'Límite de 4 diagnósticos por día alcanzado para proteger tu cuota gratuita. La búsqueda automática sigue disponible.'});
  if(scanning)return res.status(409).json({error:'Ya se está ejecutando un análisis; prueba nuevamente al terminar.'});
  let conn,hasLock=false;
  try{
   conn=await db.getConnection();
   const [[row]]=await conn.query("SELECT GET_LOCK('fijas_football_auto_scan',1) AS acquired");
   if(Number(row.acquired)!==1)return res.status(409).json({error:'Otro proceso está analizando. Prueba nuevamente en un momento.'});
   hasLock=true;
   dailyDiagnosticCount++;
   const result=await diagnoseFootball({request});
   lastDiagnostic=result;lastDiagnosticAt=Date.now();
   return res.json({...result,cached:false});
  }catch(e){
   const error=safeError(e);
   console.warn('football read-only diagnostic:',error);
   return res.status(502).json({error:`No se pudo completar la prueba: ${error}`});
  }finally{
   if(hasLock)await conn.query("SELECT RELEASE_LOCK('fijas_football_auto_scan')").catch(()=>{});
   conn?.release();
  }
 });
 app.post('/api/admin/football/scan',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  if(scanning)return res.status(409).json({error:'Ya se está ejecutando un análisis'});
  if(!process.env.FOOTBALL_API_KEY)return res.status(400).json({error:'Falta FOOTBALL_API_KEY'});
  // Full scans can take 1–2 minutes due to API-Football Free (10 calls/min).
  // Do not keep the HTTP response open until Railway times it out.
  scan({manual:true}).then(r=>{if(!r?.ok)lastScanReport=r;}).catch(e=>{lastScanReport={ok:false,error:safeError(e)};console.error('football manual scan:',safeError(e));});
  res.status(202).json({accepted:true,message:'Análisis iniciado en segundo plano. El panel actualizará el estado y mostrará los resultados al terminar.'});
 });
 // Refresh draft injury and lineup evidence before kickoff, separately from full scan.
 // No automatic re-publication or silently changing already published picks.
 app.post('/api/admin/football/candidates/:id/refresh-advanced',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  if(!validId(req.params.id))return res.status(400).json({error:'ID inválido'});
  let conn,acquired=false;
  try{
   conn=await db.getConnection();
   const [[lk]]=await conn.query("SELECT GET_LOCK('fijas_football_auto_scan',1) AS acquired");
   if(Number(lk.acquired)!==1)return res.status(409).json({error:'Ya hay un análisis en curso'});
   acquired=true;
   const [[count]]=await conn.query("SELECT COUNT(*) AS total FROM audit_logs WHERE action='football_advanced_refresh' AND DATE(created_at)=UTC_DATE()");
   if(Number(count.total)>=3)return res.status(429).json({error:'Límite de 3 actualizaciones al día para proteger la API gratuita'});
   const [[row]]=await conn.execute("SELECT * FROM football_candidates WHERE id=? LIMIT 1",[req.params.id]);
   if(!row||row.status!=='draft')return res.status(409).json({error:'Solo se actualizan propuestas pendientes'});
   const kickoff=sqlDateToUtc(row.kickoff),mins=(kickoff.getTime()-Date.now())/60000;
   if(!(mins>=10&&mins<=120))return res.status(400).json({error:'Actualiza entre 10 y 120 minutos antes del inicio. Los onces suelen publicarse cerca del partido.'});
   let evidence={};try{evidence=typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json||{};}catch{}
   const homeId=Number(evidence.team_ids?.home),awayId=Number(evidence.team_ids?.away);
   if(!homeId||!awayId)return res.status(400).json({error:'Esta propuesta antigua no tiene IDs de equipos. Crea una nueva propuesta para actualizarla.'});
   const last=Date.parse(evidence.advanced?.collected_at||'');
   if(Number.isFinite(last)&&Date.now()-last<20*60000)return res.status(429).json({error:'El análisis se actualizó recientemente; espera al menos 20 minutos'});
   const fixture={fixture:{id:Number(row.fixture_id),date:kickoff.toISOString()},teams:{home:{id:homeId,name:row.home_team},away:{id:awayId,name:row.away_team}},league:{}};
   // 1 injury request + 1 lineup request near kickoff; no season refill here.
   const refreshed=await fetchAdvancedSnapshot({fixture,api:request,now:new Date(),fetchSeason:false,fetchLineups:true});
   const previous=evidence.advanced||{};
   // Keep previously collected season/form stats and never erase valid evidence on an API outage.
   refreshed.form=previous.form||refreshed.form;
   refreshed.season=previous.season||refreshed.season;
   refreshed.status.season=previous.status?.season||refreshed.status.season;
   if(refreshed.status.injuries==='unavailable'&&previous.status?.injuries==='available'){
    refreshed.injuries=previous.injuries;refreshed.status.injuries=previous.status.injuries;
   }
   if(!['available','partial'].includes(refreshed.status.lineups)&&['available','partial'].includes(previous.status?.lineups)){
    refreshed.lineups=previous.lineups;refreshed.status.lineups=previous.status.lineups;
   }
   evidence.advanced=refreshed;
   const marker='\n\n[ESTUDIO AVANZADO V2.2]';
   const base=String(row.analysis||'').split(marker)[0].slice(0,5900);
   const updated=(base+marker+'\n'+advancedAnalysisLines(refreshed).join('\n')).slice(0,7900);
   const [result]=await conn.execute("UPDATE football_candidates SET analysis=?,evidence_json=? WHERE id=? AND status='draft'",[updated,JSON.stringify(evidence),row.id]);
   if(!result.affectedRows)return res.status(409).json({error:'La propuesta ya cambió de estado'});
   await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'football_advanced_refresh','football_candidate',?,JSON_OBJECT('injuries',?,'lineups',?))",[req.admin.id,String(row.id),refreshed.status.injuries,refreshed.status.lineups]);
   return res.json({ok:true,message:'Datos del partido actualizados. Revisa los onces y las bajas antes de publicar.',status:refreshed.status});
  }catch(e){console.error('football refresh:',safeError(e));return res.status(502).json({error:'No se pudo actualizar: '+safeError(e)});}
  finally{if(acquired)await conn.query("SELECT RELEASE_LOCK('fijas_football_auto_scan')").catch(()=>{});conn?.release();}
 });
 app.post('/api/admin/football/candidates/:id/publish',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await publish(req.params.id,req.admin));}
  catch(e){res.status(400).json({error:safeError(e)});}
 });
 app.post('/api/admin/football/candidates/:id/discard',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  if(!validId(req.params.id))return res.status(400).json({error:'ID inválido'});
  try{
   const [r]=await db.execute("UPDATE football_candidates SET status='discarded' WHERE id=? AND status='draft'",[req.params.id]);
   if(!r.affectedRows)return res.status(409).json({error:'No se puede descartar esta propuesta'});
   await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id) VALUES (?,'football_candidate_discarded','football_candidate',?)",[req.admin.id,req.params.id]);
   res.json({ok:true});
  }catch(e){res.status(500).json({error:'No se pudo descartar'});}
 });

 let interval=null;
 async function tick(){
  // Telegram dispatch is independent of quota and scan cooldown.
  await publishPending().catch(e=>console.warn('football dispatch:',safeError(e)));
  if(process.env.FOOTBALL_AUTO_SCAN==='true'&&process.env.FOOTBALL_API_KEY){
   const report=await scan().catch(e=>{lastSchedulerMessage=safeError(e);console.warn('football scheduler:',safeError(e));return null;});
   if(report)lastSchedulerMessage=report.ok?`Último escaneo: ${report.drafts_created} nuevas propuestas, ${report.examined} partidos analizados.`:report.message||report.reason||'Sin actualización de escaneo';
   if(report?.ok)await publishPending().catch(e=>console.warn('football dispatch:',safeError(e)));
  }
 }
 function start(){
  if(interval)return;
  if(process.env.FOOTBALL_AUTO_SCAN!=='true'&&process.env.FOOTBALL_AUTO_PUBLISH!=='true')return;
  // Only start after database initialization; the app must have all tables.
  interval=setInterval(tick,DEFAULT_SCAN_INTERVAL_MS);
  interval.unref?.();
  setImmediate(tick);
 }
 return {scan,publish,publishPending,start,stop:()=>{if(interval)clearInterval(interval);interval=null;}};
}
