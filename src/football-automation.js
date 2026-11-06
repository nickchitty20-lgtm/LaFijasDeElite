import {footballApi,utcDate,upcomingFixtures,createAssessment,extractMatchWinnerOdds,kickOffString,DEFAULT_MAX_HOURS,headToHeadParams} from './football-analysis.js';
import {diagnoseFootball} from './football-diagnostic.js';
import {pickScanFixtures,canRunManual,MANUAL_SCAN_DAILY_LIMIT} from './football-scan-policy.js';
import {predictedResult} from './football-analysis.js';
import {sendPredictionToTelegram} from './telegram-bridge.js';
import {enqueuePredictionEvent} from './notification-center.js';
import {publishedFootballDetails} from './football-report.js';
import {canAutoPublishCandidate} from './football-publication-policy.js';

const SCAN_COOLDOWN_MINUTES=180;
const DEFAULT_SCAN_INTERVAL_MS=4*60*60*1000;
const validId=id=>/^\d{1,18}$/.test(String(id));
const sqlDateToUtc=value=>value instanceof Date?value:new Date(String(value).replace(' ','T')+'Z');
const safeError=e=>String(e?.message||e).replace(/(sk_live_|sk_test_|pk_live_|pk_test_)[^\s]+/g,'[redacted]').slice(0,160);

export function installFootballAutomation(app,{db,authenticate}){
 let scanning=false;
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
   // Manual checks are independent of the 3-hour automatic cooldown.
   // They have a transparent, small daily limit persisted in MySQL.
   if(manual){
    const [[used]]=await lock.query("SELECT COUNT(*) AS total,MAX(started_at) AS latest FROM football_scans WHERE initiated_by='manual' AND DATE(started_at)=UTC_DATE()");
    const allowance=canRunManual({countToday:Number(used.total),lastStartedAt:used.latest?new Date(used.latest).toISOString():null});
    if(!allowance.allowed)return {cooldown:true,next_scan_at:allowance.nextAt,remaining_manual_scans:allowance.remaining,message:allowance.reason};
   }else{
    const [[prior]]=await lock.query("SELECT started_at FROM football_scans WHERE status='completed' ORDER BY id DESC LIMIT 1");
    const priorTime=prior?.started_at?new Date(prior.started_at).getTime():0;
    if(priorTime && Date.now()-priorTime<SCAN_COOLDOWN_MINUTES*60000){
     const nextAt=new Date(priorTime+SCAN_COOLDOWN_MINUTES*60000).toISOString();
     return {cooldown:true,next_scan_at:nextAt,message:`Búsqueda programada en espera hasta ${nextAt}. El análisis manual usa un límite separado.`};
    }
   }
   // Status does not consume the daily quota. Stop before an expensive scan
   // when there are insufficient remaining calls on the provider account.
   const account=await footballApi('status');
   const used=Number(account?.requests?.current), limit=Number(account?.requests?.limit_day);
   if(Number.isFinite(used)&&Number.isFinite(limit)&&limit>0&&limit-used<10){
    return {cooldown:true,message:`API-Football: quedan ${Math.max(0,limit-used)} de ${limit} consultas hoy. No se analiza para no agotar la cuota.`,provider_quota_remaining:Math.max(0,limit-used)};
   }
   const [created]=await lock.execute('INSERT INTO football_scans (status,initiated_by,started_at) VALUES (?,?,UTC_TIMESTAMP())',['running',manual?'manual':'scheduled']);
   const runId=created.insertId;
   const now=new Date();
   let examined=0,drafts=0,published=0,missingPredictions=0,discardedByFilters=0,providerErrors=0;
   let windowMatches=0;
   const rejectionExamples=[];
   const warnings=[];
   try{
    const end=new Date(now.getTime()+DEFAULT_MAX_HOURS*3600000);
    const dates=[utcDate(now)];
    if(utcDate(end)!==dates[0])dates.push(utcDate(end));
    const games=[];
    for(const date of dates){games.push(...await footballApi('fixtures',{date}));}
    const upcoming=upcomingFixtures(games,now);
    windowMatches=upcoming.length;
    // 2 fixture dates + 5 predictions + 1 H2H + 1 odds = at most 9
    // quota-consuming requests per scan. Prefer distinct leagues.
    const fixtures=pickScanFixtures(upcoming);
    const candidateCount={free:0,vip:0};
    let h2hQueries=0,oddsQueries=0;
    for(const fixture of fixtures){
     examined++;
     let predictionArr;
     try{predictionArr=await footballApi('predictions',{fixture:fixture.fixture.id});}
     catch(error){
      providerErrors++;
      const warning=`Predicciones de ${fixture.teams.home.name} vs ${fixture.teams.away.name}: ${safeError(error)}`;
      warnings.push(warning);console.warn('football predictions unavailable:',warning);
      continue; // A rejected fixture must not abort all remaining fixtures.
     }
     const pred=predictionArr[0];
     if(!pred){
      missingPredictions++;
      if(rejectionExamples.length<5)rejectionExamples.push({match:`${fixture.teams.home.name} vs ${fixture.teams.away.name}`,reason:'Sin predicción disponible del proveedor'});
      continue;
     }
     // Preliminary assessment uses provider's own h2h when available.
     let assessment=createAssessment(fixture,pred);
     // The provider's embedded H2H may lack completed scores. Spend at most one
     // optional H2H call per scan also for an eligible candidate, so goals can
     // be explained from actual results. Do not let this call block publication.
     const usableH2h=(Array.isArray(pred?.h2h)?pred.h2h:[]).filter(x=>x?.fixture?.status?.short==='FT'&&Number.isInteger(x?.goals?.home)&&Number.isInteger(x?.goals?.away)).length;
     if((!assessment || (assessment && usableH2h<3)) && h2hQueries<1 && (predictedResult(pred)?.confidence??0)>=40){
      h2hQueries++;
      const head=Number(fixture.teams.home.id),away=Number(fixture.teams.away.id);
      try{
       // `last` is forbidden by API-Football Free. Limit results locally.
       const h2h=await footballApi('fixtures/headtohead',headToHeadParams(head,away));
       assessment=createAssessment(fixture,pred,{h2h})||assessment;
      }catch(error){
       const warning=`Antecedentes no disponibles para ${fixture.teams.home.name} vs ${fixture.teams.away.name}: ${safeError(error)}`;
       warnings.push(warning);console.warn('football h2h optional:',warning);
       // H2H is supplementary; do not fail the scan because it is unavailable.
      }
     }
     if(!assessment){
      discardedByFilters++;
      if(rejectionExamples.length<5){
       const best=predictedResult(pred);
       const reason=!best?'Probabilidades 1X2 incompletas o inconsistentes':
        `Mayor estimación ${best.confidence}% y margen ${best.margin} puntos: insuficiente confianza o evidencia para los filtros.`;
       rejectionExamples.push({match:`${fixture.teams.home.name} vs ${fixture.teams.away.name}`,reason});
      }
      continue;
     }
     // Keep a balanced shortlist. VIP candidates must not crowd out free ones.
     if(candidateCount[assessment.visibility]>=2)continue;
     candidateCount[assessment.visibility]++;
     // The free preview is educational and may have no quoted bookmaker odds.
     // Reserve the scarce optional odds request for an eligible VIP candidate.
     if(oddsQueries<1&&assessment.visibility==='vip'){
      oddsQueries++;
      try{
       const oddsArr=await footballApi('odds',{fixture:fixture.fixture.id,page:1});
       const exact=extractMatchWinnerOdds(oddsArr,assessment.selection,assessment.home,assessment.away);
       if(exact){assessment.odds=exact.odds;assessment.raw_evidence.bookmaker=exact.bookmaker;}
      }catch(e){console.warn('football odds optional:',safeError(e));}
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
    // erroneously applying the three-hour success cooldown.
    if(examined>0 && providerErrors===examined)throw Error(warnings[0]||'No se pudieron consultar predicciones');
    await lock.execute("UPDATE football_scans SET status='completed',finished_at=UTC_TIMESTAMP(),examined=?,drafts_created=?,window_matches=?,without_prediction=?,below_filters=?,provider_errors=? WHERE id=?",[examined,drafts,windowMatches,missingPredictions,discardedByFilters,providerErrors,runId]);
    lastError='';lastSuccess=Date.now();
    // Automatic publication is opt-in. Free picks don't need bookmaker odds;
    // VIP picks do. The final validation rechecks probability/evidence and quotas.
    if(!manual&&process.env.FOOTBALL_AUTO_PUBLISH==='true'){
     const [rows]=await db.query("SELECT id FROM football_candidates WHERE status='draft' AND (visibility='free' OR (visibility='vip' AND odds IS NOT NULL)) AND kickoff>DATE_ADD(UTC_TIMESTAMP(),INTERVAL 20 MINUTE) ORDER BY provider_probability DESC LIMIT 8");
     for(const row of rows){
      try{const result=await publish(row.id,null,{automatic:true});if(result?.published)published++;}
      catch(e){console.warn('football automated publication skipped:',safeError(e));}
     }
    }
    return {ok:true,fixtures_in_window:windowMatches,examined,drafts_created:drafts,automatically_published:published,
     without_prediction:missingPredictions,below_filters:discardedByFilters,
     provider_errors:providerErrors,rejection_examples:rejectionExamples,warnings:warnings.slice(0,3),mode:manual?'manual':'scheduled',
     note:drafts?'Propuestas guardadas en MySQL. Revísalas antes de publicar.':
       'El escaneo se completó sin propuestas aptas; revisa los motivos de descarte. No se inventan pronósticos.'};
   }catch(e){
    lastError=safeError(e);
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
    if(!canAutoPublishCandidate(row))throw Error('No cumple requisitos para publicación automática: evidencias, probabilidad o cuota VIP');
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
  try{telegram=(await sendPredictionToTelegram(payload,process.env,{db})).state;}
  catch(e){telegram='failed';console.error('auto prediction Telegram:',safeError(e));}
  await db.execute('UPDATE predictions SET telegram_status=? WHERE id=?',[telegram,predictionId]);
  try{await enqueuePredictionEvent(db,predictionId,row.visibility);}catch(e){console.warn('auto notification enqueue:',safeError(e));}
  return {published:true,prediction_id:predictionId,telegram};
 }

 app.get('/api/admin/football/status',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [[stats]]=await db.query(`SELECT
    (SELECT COUNT(*) FROM football_candidates WHERE status='draft') AS drafts,
    (SELECT COUNT(*) FROM football_candidates WHERE status='published') AS published,
    (SELECT SUM(outcome='won') FROM predictions p JOIN football_candidates f ON f.prediction_id=p.id WHERE f.status='published') AS won,
    (SELECT SUM(outcome='lost') FROM predictions p JOIN football_candidates f ON f.prediction_id=p.id WHERE f.status='published') AS lost`);
   const [[latest]]=await db.query('SELECT status,initiated_by,started_at,finished_at,error_message,examined,drafts_created,window_matches,without_prediction,below_filters,provider_errors FROM football_scans ORDER BY id DESC LIMIT 1');
   const [[manualUsage]]=await db.query("SELECT COUNT(*) AS total,MAX(started_at) AS latest FROM football_scans WHERE initiated_by='manual' AND DATE(started_at)=UTC_DATE()");
   const allowance=canRunManual({countToday:Number(manualUsage.total),lastStartedAt:manualUsage.latest?new Date(manualUsage.latest).toISOString():null});
   const decided=Number(stats.won||0)+Number(stats.lost||0);
   res.json({configured:!!process.env.FOOTBALL_API_KEY,auto_scan:process.env.FOOTBALL_AUTO_SCAN==='true',
    auto_publish:process.env.FOOTBALL_AUTO_PUBLISH==='true',
    free_public_full:process.env.FOOTBALL_PUBLIC_FREE_PICKS==='true',
    drafts:Number(stats.drafts||0),published:Number(stats.published||0),
    won:Number(stats.won||0),lost:Number(stats.lost||0),accuracy:decided?Number((stats.won*100/decided).toFixed(1)):null,
    latest:latest||null,scanning,last_error:lastError,last_success:lastSuccess,
    manual_scan:{available:allowance.allowed,remaining:allowance.remaining,next_at:allowance.nextAt,reason:allowance.reason,daily_limit:MANUAL_SCAN_DAILY_LIMIT},
    diagnostic:lastDiagnostic?{...lastDiagnostic,cached:false}:null});
  }catch(e){res.status(500).json({error:'No se pudo consultar el motor deportivo'});}
 });
 app.get('/api/admin/football/candidates',authenticate,async(req,res)=>{
  if(!isOwner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.query('SELECT id,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status,prediction_id,created_at FROM football_candidates ORDER BY id DESC LIMIT 30');
   const candidates=rows.map(row=>{
    let evidence={};
    try{evidence=typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json||{};}catch{}
    const {evidence_json,...publicRow}=row;
    return {...publicRow,goal_projection:evidence.goals||null,match_context:evidence.match_context||null};
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
   const result=await diagnoseFootball();
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
  try{res.json(await scan({manual:true}));}
  catch(e){console.error('football scan:',safeError(e));res.status(502).json({error:safeError(e)});}
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
 function start(){
  if(interval||process.env.FOOTBALL_AUTO_SCAN!=='true'||!process.env.FOOTBALL_API_KEY)return;
  // Only start after database initialization; the app must have all tables.
  interval=setInterval(()=>scan().catch(e=>console.warn('football scheduler:',safeError(e))),DEFAULT_SCAN_INTERVAL_MS);
  interval.unref?.();
  setImmediate(()=>scan().catch(e=>console.warn('football startup scan:',safeError(e))));
 }
 return {scan,publish,start,stop:()=>interval&&clearInterval(interval)};
}
