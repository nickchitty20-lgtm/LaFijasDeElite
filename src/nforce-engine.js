import {publicAnalysisText} from './public-branding.js';
import {freeTelegramDestination} from './telegram-public.js';
import {allowedDatasets,fetchOpenFootball,LEAGUES,NFORCE_PROVIDER} from './nforce-data.js';
import {diagnoseNforceCalendar} from './nforce-calendar-health.js';
import {estimateMatch,modelReadiness,makeCandidate,walkForwardBacktest,fulltime,MODEL_VERSION,VIP_RISK_POLICY} from './nforce-model.js';
import {canAutoPublishCandidate} from './football-publication-policy.js';
import {evaluateVipEvidence,VIP_POLICY} from './nforce-vip-gate.js';
import {sendPredictionToTelegram} from './telegram-bridge.js';
import {publishedFootballDetails} from './football-report.js';
import {createNforceSettlement} from './nforce-settlement.js';
import {LIVE_VERIFICATION_LEAGUES} from './live-schedule.js';
import {candidateModelVersion,discardedInBuild,discardReason,reasonForDiscard,canReopenOldDiscard,CANDIDATE_REVIEW_BUILD} from './nforce-candidate-revival.js';
import {classifyAutomaticCandidate,shouldBlockLegacyFreeDraft,GOLD_ROLLOUT} from './nforce-gold-transition.js';

const DAY=86400000;
const asUtc=x=>x instanceof Date?x:new Date(String(x||'').replace(' ','T')+(String(x||'').match(/Z|[+-]\d\d:\d\d$/)?'':'Z'));
const sqlUtc=x=>asUtc(x).toISOString().slice(0,19).replace('T',' ');
const validId=x=>/^\d{1,18}$/.test(String(x));
const safeError=e=>String(e?.message||e).replace(/(sk_live_|sk_test_|pk_live_|pk_test_)[^\s]+/g,'[redacted]').slice(0,180);
const reportLimited=e=>{try{return typeof e==='string'?JSON.parse(e):e||{};}catch{return {};}};
const owner=req=>req.admin?.role==='owner';
export const IMPORT_INTERVAL_HOURS=2;
export const SCAN_INTERVAL_MINUTES=60;
// 14 days by default to bridge international breaks. Owners may choose 3..21 days
// to PREPARE draft picks during calendar gaps. All drafts remain subject to normal approval, fresh
// schedule checks and the same statistical safeguards before publication.
const requestedScanDays=Number(process.env.NFORCE_SCAN_DAYS??14);
export const NFORCE_SCAN_LOOKAHEAD_DAYS=Number.isInteger(requestedScanDays)&&requestedScanDays>=3&&requestedScanDays<=21?requestedScanDays:14;
export const NFORCE_SCAN_FIXTURE_LIMIT=240;

export function importDecision(last,now=Date.now(),hours=IMPORT_INTERVAL_HOURS){
 if(!last)return {due:true,next:null};
 const started=asUtc(last.started_at).getTime(),interval=(last.status==='completed'?hours:2)*3600000;
 const next=started+interval;
 return {due:!Number.isFinite(next)||now>=next,next:Number.isFinite(next)?new Date(next).toISOString():null};
}
export function installNforceEngine(app,{db,authenticate,fetchDataset=fetchOpenFootball,sendTelegram=sendPredictionToTelegram,enqueueEvent=null,now=()=>new Date()}={}){
 const settlement=createNforceSettlement({db,now});
 let importing=false,scanning=false,publishing=false,interval=null;
 let lastScanReport=null,lastImportReport=null,lastPublishReport=null,lastSchedulerMessage='',lastError='';
 const api=path=>`/api/admin/football/${path}`;
 async function withLock(name,callback){
  const conn=await db.getConnection();let acquired=false;
  try{
   const [[state]]=await conn.query('SELECT GET_LOCK(?,1) AS acquired',[name]);
   if(Number(state?.acquired)!==1)return {busy:true,message:'Otro proceso está trabajando'};
   acquired=true;return await callback(conn);
  }finally{
   if(acquired)await conn.query('SELECT RELEASE_LOCK(?)',[name]).catch(()=>{});
   conn.release();
  }
 }
 async function importData({force=false}={}){
  if(importing)return {busy:true};importing=true;
  try{return await withLock('fijas_nforce_import',async conn=>{
   const [[last]]=await conn.query('SELECT status,started_at FROM nforce_import_runs ORDER BY id DESC LIMIT 1');
   const decision=importDecision(last,now().getTime());
   if(!force&&!decision.due)return {cooldown:true,next_at:decision.next,message:'Fuente revisada recientemente'};
   // Manual refresh allowed only every 30 minutes and cannot bypass SSRF allowlist.
   if(force&&last&&now().getTime()-asUtc(last.started_at).getTime()<30*60000)return {cooldown:true,message:'Actualización máxima una vez cada 30 minutos'};
   const [created]=await conn.execute("INSERT INTO nforce_import_runs (status,started_at) VALUES ('running',UTC_TIMESTAMP())");
   const id=created.insertId,errors=[];let imported=0,sources=0,scheduled=0,completed=0,missing=0;
   const importedCompetitions=new Set(),missingCompetitions=new Set();
   const datasets=allowedDatasets(now());
   // Download in small parallel batches so missing optional league files don't
   // cause long serial waits; serialize SQL writes on this connection.
   for(let batchStart=0;batchStart<datasets.length;batchStart+=5){
    const batch=datasets.slice(batchStart,batchStart+5);
    const results=await Promise.all(batch.map(async dataset=>{
     try{return {dataset,records:await fetchDataset(dataset)}}
     catch(error){return {dataset,error}}
    }));
    for(const {dataset,records,error} of results){
     if(error){
      if(/HTTP 404\b/.test(safeError(error))){missing++;missingCompetitions.add(dataset.code);}
      else errors.push(`${dataset.path}: ${safeError(error)}`);
      continue;
     }
     if(!Array.isArray(records)||!records.length){missing++;missingCompetitions.add(dataset.code);continue;}
     try{
      // Idempotent upsert: never overwrite a recorded FT score with missing data.
      const cols=['id','source_key','competition','league','season','round_name','home_team','away_team','match_date','kickoff','scheduled_time_known','home_goals','away_goals','source_path'];
      for(let index=0;index<records.length;index+=80){
       const part=records.slice(index,index+80);
       const vals=part.flatMap(m=>[m.id,m.source_key,m.competition,m.league,m.season,m.round,m.home,m.away,m.date,m.kickoff?sqlUtc(m.kickoff):null,Number(m.scheduled_time_known),m.home_goals,m.away_goals,m.source_path]);
       const qs=part.map(()=>`(${cols.map(()=>'?').join(',')})`).join(',');
       await conn.execute(`INSERT INTO nforce_matches (${cols.join(',')}) VALUES ${qs} ON DUPLICATE KEY UPDATE
        round_name=VALUES(round_name),league=VALUES(league),match_date=VALUES(match_date),kickoff=VALUES(kickoff),
        scheduled_time_known=VALUES(scheduled_time_known),home_goals=COALESCE(VALUES(home_goals),home_goals),
        away_goals=COALESCE(VALUES(away_goals),away_goals),source_checked_at=UTC_TIMESTAMP()`,vals);
      }
      sources++;importedCompetitions.add(dataset.code);
      imported+=records.length;scheduled+=records.filter(x=>x.kickoff&&x.home_goals===null).length;
      completed+=records.filter(x=>x.home_goals!==null).length;
     }catch(e){errors.push(`${dataset.path}: ${safeError(e)}`);}
    }
   }
   const status=sources?'completed':'failed';
   await conn.execute('UPDATE nforce_import_runs SET status=?,finished_at=UTC_TIMESTAMP(),sources=?,records=?,scheduled=?,completed_results=?,errors_json=? WHERE id=?',
    [status,sources,imported,scheduled,completed,JSON.stringify(errors).slice(0,3900),id]);
   lastImportReport={ok:sources>0,status,sources,records:imported,scheduled,completed,failed_sources:errors.length,errors:errors.slice(0,5),
    competitions_configured:LEAGUES.length,competitions_imported:importedCompetitions.size,
    leagues_imported:LEAGUES.filter(l=>importedCompetitions.has(l.code)).map(l=>l.name),
    datasets_missing:missing,leagues_with_missing_seasons:[...missingCompetitions],
    warning:errors.length?'Importación parcial: algunas consultas fallaron.':missing?'Algunas competiciones aún no tienen archivos disponibles para todas las temporadas; no se inventan partidos.':'Los calendarios pueden estar desactualizados; verifica horarios antes de publicar.'};
   if(!sources)lastError='Fallaron las consultas de resultados deportivos';
   return lastImportReport;
  });}finally{importing=false;}
 }
 async function loadMatches(){
  // bounded season set; no API requests per match.
  const [rows]=await db.query('SELECT m.id,m.source_key,m.competition,m.league,m.season,m.round_name AS `round`,m.home_team AS home,m.away_team AS away,COALESCE(DATE(s.kickoff),m.match_date) AS date_label,COALESCE(s.kickoff,m.kickoff) AS kickoff,(m.scheduled_time_known OR s.kickoff IS NOT NULL) AS scheduled_time_known,m.home_goals,m.away_goals,m.source_path,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE m.match_date>=DATE_SUB(UTC_DATE(),INTERVAL 560 DAY) ORDER BY m.match_date DESC LIMIT 20000');
  return rows.reverse().map(r=>({...r,date:r.date_label instanceof Date?r.date_label.toISOString().slice(0,10):String(r.date_label).slice(0,10),
   kickoff:r.kickoff?asUtc(r.kickoff).toISOString():null,scheduled_time_known:Boolean(r.scheduled_time_known),
   home_goals:r.home_goals==null?null:Number(r.home_goals),away_goals:r.away_goals==null?null:Number(r.away_goals)}));
 }
 async function scan({manual=false}={}){
  if(scanning)return {busy:true};scanning=true;
  try{return await withLock('fijas_nforce_scan',async conn=>{
   const [[last]]=await conn.query("SELECT status,started_at FROM nforce_scans ORDER BY id DESC LIMIT 1");
   const at=last?asUtc(last.started_at).getTime():0;
   if(at&&now().getTime()-at<(manual?5:SCAN_INTERVAL_MINUTES)*60000){
    return {cooldown:true,next_scan_at:new Date(at+(manual?5:SCAN_INTERVAL_MINUTES)*60000).toISOString(),message:'Escaneo local reciente'};
   }
   const [created]=await conn.execute("INSERT INTO nforce_scans (status,initiated_by,started_at) VALUES ('running',?,UTC_TIMESTAMP())",[manual?'manual':'scheduled']);
   const id=created.insertId;
   try{
    const all=await loadMatches(),time=now().getTime();
    const usable=all.filter(x=>fulltime(x));
    const calendar_diagnostic=diagnoseNforceCalendar(all,{now:now(),days:NFORCE_SCAN_LOOKAHEAD_DAYS});
    const horizon=time+NFORCE_SCAN_LOOKAHEAD_DAYS*DAY;
    const futureWithTimes=all.filter(x=>x.scheduled_time_known&&x.kickoff&&x.home_goals===null&&(!x.live_status||x.live_status==='NS')&&Date.parse(x.kickoff)>time+60*60000)
     .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    const withinWindow=futureWithTimes.filter(x=>Date.parse(x.kickoff)<horizon);
    const future=withinWindow.slice(0,NFORCE_SCAN_FIXTURE_LIMIT);
    const nextBeyondWindow=futureWithTimes.find(x=>Date.parse(x.kickoff)>=horizon);
    let models=0,drafts=0,underMin=0,rejected=0,alreadyPresent=0,updatedDrafts=0,reopenedOldDiscards=0;
    const existingByStatus={draft:0,discarded:0,published:0,other:0};
    const examples=[];const missingReasons={};const filteredExamples=[];
    const marketCounts={};const categoryCounts={free:0,gold:0,vip:0};const vipRejections={};
    for(const m of future){
     const model=estimateMatch(m,usable,Date.parse(m.kickoff));
     if(!model){underMin++;const why=modelReadiness(m,usable,Date.parse(m.kickoff));missingReasons[why.reason]=(missingReasons[why.reason]||0)+1;if(examples.length<4)examples.push(`${m.home} vs ${m.away}: ${why.reason} (liga ${why.sample?.league||0}, local ${why.sample?.home||0}, visita ${why.sample?.away||0})`);continue;}
     models++;
     const marketDiagnostics={};const candidate=classifyAutomaticCandidate(makeCandidate(m,model,marketDiagnostics));
     for(const [reason,total] of Object.entries(marketDiagnostics.vip_rejections||{}))vipRejections[reason]=(vipRejections[reason]||0)+total;
     if(!candidate){rejected++;if(filteredExamples.length<5)filteredExamples.push(`${m.home} vs ${m.away}: 1X2 ${model.confidence}% · >1.5 ${model.totals.over15}% · BTTS ${model.totals.btts}% · calidad ${model.quality}/100`);continue;}
     categoryCounts[candidate.visibility]++;
     const marketKey=JSON.parse(candidate.evidence_json).pick.key;marketCounts[marketKey]=(marketCounts[marketKey]||0)+1;
     const [r]=await conn.execute(`INSERT IGNORE INTO football_candidates
      (provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,[
      candidate.provider,candidate.fixture_id,candidate.visibility,candidate.home_team,candidate.away_team,candidate.league,
      candidate.kickoff,candidate.market,candidate.selection,candidate.provider_probability,null,candidate.analysis,candidate.evidence_json]);
     if(!Number(r.affectedRows||0)){
      // Fixture IDs are unique across all candidate statuses. A previous
      // The selected fixture must be modeled again before a stale, version-
      // incompatible discard is eligible for reopening. Explicit manual
      // discards and anything already published are never overwritten.
      const [[registered]]=await conn.execute(`SELECT id,status,prediction_id,published_at,visibility,provider,evidence_json
       FROM football_candidates WHERE provider=? AND fixture_id=? LIMIT 1`,
       [candidate.provider,candidate.fixture_id]);
      const oldVersion=candidateModelVersion(registered?.evidence_json);
      const oldBuild=discardedInBuild(registered?.evidence_json);
      const oldReason=discardReason(registered?.evidence_json);
      if(canReopenOldDiscard(registered,MODEL_VERSION,CANDIDATE_REVIEW_BUILD)){
       // Recheck status and old version in SQL: a concurrent owner action or
       // publication must never be overridden by the background scan.
       // Audit the transition in the same transaction for traceability.
       await conn.beginTransaction();
       try{
        const [revived]=await conn.execute(`UPDATE football_candidates SET status='draft',visibility=?,home_team=?,away_team=?,league=?,kickoff=?,
         market=?,selection=?,provider_probability=?,odds=NULL,analysis=?,evidence_json=?
         WHERE provider=? AND fixture_id=? AND status='discarded'
          AND prediction_id IS NULL AND published_at IS NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.model.model'))=?
          AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.discarded_in_build')),'')=?
          AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.discard_reason')),'')=?
          AND visibility=?`,[
         candidate.visibility,candidate.home_team,candidate.away_team,candidate.league,candidate.kickoff,
         candidate.market,candidate.selection,candidate.provider_probability,candidate.analysis,candidate.evidence_json,
         candidate.provider,candidate.fixture_id,oldVersion,oldBuild||'',oldReason||'',registered.visibility]);
        if(Number(revived.affectedRows||0)===1){
         await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
          VALUES (NULL,'nforce_candidate_reopened_new_model','football_candidate',?,?)`,[
          String(registered.id),JSON.stringify({previous_model:oldVersion,new_model:MODEL_VERSION,previous_build:oldBuild||'legacy_unstamped',previous_reason:oldReason||'legacy_unmarked',new_build:CANDIDATE_REVIEW_BUILD,fixture_id:String(candidate.fixture_id)})]);
         reopenedOldDiscards++;
        }else{
         alreadyPresent++;existingByStatus.discarded++;
        }
        await conn.commit();
       }catch(e){await conn.rollback();throw e;}
      }else{
       alreadyPresent++;
       const storedStatus=String(registered?.status||'other');
       existingByStatus[storedStatus in existingByStatus?storedStatus:'other']++;
       // Refresh drafts using the new model, but never overwrite published
       // selections or deliberate manual discards.
       if(storedStatus==='draft'){
        const [updated]=await conn.execute(`UPDATE football_candidates SET visibility=?,home_team=?,away_team=?,league=?,kickoff=?,
         market=?,selection=?,provider_probability=?,odds=NULL,analysis=?,evidence_json=?
         WHERE provider=? AND fixture_id=? AND status='draft'`,[
         candidate.visibility,candidate.home_team,candidate.away_team,candidate.league,candidate.kickoff,
         candidate.market,candidate.selection,candidate.provider_probability,candidate.analysis,candidate.evidence_json,
         candidate.provider,candidate.fixture_id]);
        updatedDrafts+=Number(updated.affectedRows||0);
       }
      }
     }
     drafts+=Number(r.affectedRows||0);
    }
    await conn.execute('UPDATE nforce_scans SET status=?,finished_at=UTC_TIMESTAMP(),upcoming=?,modeled=?,drafts=?,insufficient=?,filtered=? WHERE id=?',
     ['completed',future.length,models,drafts,underMin,rejected,id]);
    lastError='';lastScanReport={ok:true,mode:manual?'manual':'scheduled',
     lookahead_days:NFORCE_SCAN_LOOKAHEAD_DAYS,fixture_limit:NFORCE_SCAN_FIXTURE_LIMIT,calendar_diagnostic,
     fixtures_with_known_time:futureWithTimes.length,fixtures_in_window:future.length,examined:future.length,
     fixtures_truncated:Math.max(0,withinWindow.length-future.length),
     next_fixture_beyond_window:nextBeyondWindow?{match:`${nextBeyondWindow.home} vs ${nextBeyondWindow.away}`,kickoff:nextBeyondWindow.kickoff}:null,
     modeled:models,drafts_created:drafts,reopened_old_discards:reopenedOldDiscards,reopened_incompatible_discards:reopenedOldDiscards,already_present:alreadyPresent,existing_by_status:existingByStatus,
     updated_existing_drafts:updatedDrafts,eligible:drafts+reopenedOldDiscards+alreadyPresent,
     eligible_by_category:categoryCounts,eligible_by_market:marketCounts,vip_rejections_by_market_reason:vipRejections,
     insufficient_history:underMin,insufficient_reasons:missingReasons,below_filters:rejected,rejection_examples:examples,filter_examples:filteredExamples,
     fixtures_without_time:all.filter(x=>x.home_goals===null&&!x.scheduled_time_known&&x.date>=now().toISOString().slice(0,10)).length,
     note_on_quality:'El indicador de calidad de muestra NO representa el porcentaje real de aciertos.',
     note:drafts||reopenedOldDiscards?`${drafts} propuestas nuevas y ${reopenedOldDiscards} descartadas en versiones anteriores recuperadas; revísalas antes de aprobar.`:future.length===0?
      `Sin encuentros listos. ${calendar_diagnostic.diagnosis}`:
      alreadyPresent?`${alreadyPresent} propuestas elegibles ya registradas (pendientes: ${existingByStatus.draft}, descartadas: ${existingByStatus.discarded}, publicadas: ${existingByStatus.published}); los descartes de esta versión siguen descartados.`:
      'No hay propuestas nuevas: el historial es insuficiente o los filtros han rechazado los mercados.'};
    return lastScanReport;
   }catch(e){lastError=safeError(e);await conn.execute('UPDATE nforce_scans SET status=?,finished_at=UTC_TIMESTAMP(),error_message=? WHERE id=?',['failed',lastError,id]);throw e;}
  });}finally{scanning=false;}
 }
 async function backtest(){
  return withLock('fijas_nforce_backtest',async()=>{
   const all=await loadMatches();const r=walkForwardBacktest(all,{maxGames:500,now:now()});
   await db.execute('INSERT INTO nforce_backtests (model_version,evaluated,accuracy,brier,logloss,metrics_json) VALUES (?,?,?,?,?,?)',
    [r.model,r.evaluated,r.accuracy,r.brier,r.logloss,JSON.stringify(r)]);
   return r;
  });
 }
 /** Refresh one pending proposal against the current model, without publishing it.
  * The owner must review the updated market/selection and explicitly approve later. */
 async function refreshCandidate(id,admin){
  if(!validId(id))throw Error('ID inválido');
  const all=await loadMatches();
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute('SELECT * FROM football_candidates WHERE id=? FOR UPDATE',[id]);
   const row=rows[0];
   if(!row||row.provider!==NFORCE_PROVIDER||row.status!=='draft'){
    await conn.rollback();return {refreshed:false,reason:'La propuesta ya se publicó, descartó o no pertenece a N-FORCE.'};
   }
   const fixture=all.find(m=>String(m.id)===String(row.fixture_id));
   if(!fixture||!fixture.kickoff||!fixture.scheduled_time_known||fixture.home_goals!==null||fixture.away_goals!==null){
    await conn.rollback();return {refreshed:false,reason:'El encuentro no tiene calendario futuro comprobable. Importa datos primero.'};
   }
   const kickoff=asUtc(fixture.kickoff).getTime();
   if(!Number.isFinite(kickoff)||kickoff<now().getTime()+20*60000){
    await conn.rollback();return {refreshed:false,reason:'El partido comenzó o faltan menos de 20 minutos. No se puede aprobar.'};
   }
   const [[live]]=await conn.execute('SELECT COALESCE(s.kickoff,m.kickoff) AS kickoff,m.home_goals,m.away_goals,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE m.id=? LIMIT 1',[row.fixture_id]);
   if(!live||live.home_goals!==null||live.away_goals!==null||!live.kickoff||
      (live.live_status&&live.live_status!=='NS')||
      (process.env.FOOTBALL_SCHEDULE_LIVE==='true'&&process.env.FOOTBALL_API_KEY&&(!live.schedule_verified_at||now().getTime()-asUtc(live.schedule_verified_at).getTime()>4*3600000))||
      Math.abs(asUtc(live.kickoff).getTime()-kickoff)>60000||
      !live.source_checked_at||now().getTime()-asUtc(live.source_checked_at).getTime()>36*3600000){
    await conn.rollback();return {refreshed:false,reason:'Los datos del calendario están desactualizados. Importa datos y vuelve a intentarlo.'};
   }
   const model=estimateMatch(fixture,all.filter(fulltime),kickoff);
   const refreshed=classifyAutomaticCandidate(makeCandidate(fixture,model));
   if(!refreshed){
    await conn.rollback();return {refreshed:false,reason:'Con el modelo actual, el encuentro no supera los filtros de selección. No se publicará.'};
   }
   await conn.execute(`UPDATE football_candidates SET visibility=?,home_team=?,away_team=?,league=?,kickoff=?,
    market=?,selection=?,provider_probability=?,odds=NULL,analysis=?,evidence_json=?
    WHERE id=? AND provider=? AND status='draft'`,[
    refreshed.visibility,refreshed.home_team,refreshed.away_team,refreshed.league,refreshed.kickoff,
    refreshed.market,refreshed.selection,refreshed.provider_probability,refreshed.analysis,refreshed.evidence_json,
    id,NFORCE_PROVIDER]);
   await conn.execute("INSERT INTO audit_logs (actor_admin_id,action,entity_type,entity_id) VALUES (?,'football_candidate_refreshed','football_candidate',?)",[admin.id,id]);
   await conn.commit();
   return {refreshed:true,visibility:refreshed.visibility,market:refreshed.market,selection:refreshed.selection,
    message:'Propuesta actualizada con el modelo vigente. Revisa la nueva selección antes de aprobarla.'};
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 }
 async function publish(id,admin,{automatic=false}={}){
  if(!validId(id))throw Error('ID inválido');
  const conn=await db.getConnection();let row,recordId;
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute('SELECT * FROM football_candidates WHERE id=? FOR UPDATE',[id]);row=rows[0];
   if(!row||row.provider!==NFORCE_PROVIDER||row.status!=='draft'){await conn.rollback();return {published:false,reason:'Ya procesado o ajeno al motor local'};}
   if(reportLimited(row.evidence_json)?.model?.model!==MODEL_VERSION)throw Error('La propuesta pertenece a una versión anterior del modelo. Analiza de nuevo antes de publicarla.');
   if(shouldBlockLegacyFreeDraft(row)){await conn.rollback();return {published:false,reason:'Esta propuesta antigua aún es GRATIS. Ejecuta «Analizar ahora» o «Actualizar propuesta» para convertirla a GOLD antes de publicarla.'};}
   const kickoff=asUtc(row.kickoff);
   if(!Number.isFinite(kickoff.getTime())||kickoff.getTime()<now().getTime()+20*60000)throw Error('El partido comenzó o empieza demasiado pronto');
   // Source may have rescheduled or completed this fixture after the candidate
   // was created. Never publish stale proposals as if the calendar were live.
   const [[liveSource]]=await conn.execute('SELECT COALESCE(s.kickoff,m.kickoff) AS kickoff,m.home_goals,m.away_goals,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE m.id=? LIMIT 1',[row.fixture_id]);
   if(!liveSource||liveSource.home_goals!==null||liveSource.away_goals!==null||!liveSource.kickoff||
      (liveSource.live_status&&liveSource.live_status!=='NS')||
      (process.env.FOOTBALL_SCHEDULE_LIVE==='true'&&process.env.FOOTBALL_API_KEY&&(!liveSource.schedule_verified_at||now().getTime()-asUtc(liveSource.schedule_verified_at).getTime()>4*3600000))||
      Math.abs(asUtc(liveSource.kickoff).getTime()-kickoff.getTime())>60000||
      now().getTime()-asUtc(liveSource.source_checked_at).getTime()>36*3600000){
    throw Error('Calendario o resultado desactualizado; importa datos y genera una nueva propuesta antes de publicar');
   }
   const [existingMatch]=await conn.execute(`SELECT p.id FROM predictions p
      WHERE p.title=? AND p.archived_at IS NULL AND ABS(TIMESTAMPDIFF(MINUTE,p.match_date,?))<=180 LIMIT 1`,
      [`${row.home_team} vs ${row.away_team}`.slice(0,200),row.kickoff]);
   if(existingMatch.length){await conn.rollback();return {published:false,reason:'Encuentro ya publicado previamente'};}

   // Premium cannot bypass an unvalidated market through manual approval.
   // Fail closed: last recorded model's independent chronological backtest.
   let vipGate=null;
   if(row.visibility==='vip'&&!canAutoPublishCandidate(row)){await conn.rollback();return {published:false,reason:'La selección VIP ya no cumple el modelo y filtros actuales; vuelve a analizar el encuentro.'};}
   if(row.visibility==='vip'){
    const [[validation]]=await conn.query('SELECT evaluated,model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
    vipGate=evaluateVipEvidence(row,validation,{asOf:now()});
    if(!vipGate.approved){await conn.rollback();return {published:false,reason:vipGate.reason,vip_evidence:vipGate};}
   }
   if(automatic){
    if(!canAutoPublishCandidate(row))throw Error('Evidencias insuficientes para autopublicación');
    const [[validated]]=await conn.query('SELECT evaluated,model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
    if(!validated||validated.model_version!==MODEL_VERSION||Number(validated.evaluated)<40||!validated.created_at||now().getTime()-asUtc(validated.created_at).getTime()>8*DAY){await conn.rollback();return {published:false,reason:'Se necesita backtesting vigente'};}
    const pick=reportLimited(row.evidence_json)?.pick;
    if(Number(reportLimited(validated.metrics_json)?.by_market?.[pick?.key]?.evaluated||0)<40){await conn.rollback();return {published:false,reason:'El mercado no dispone de 40 selecciones retrospectivas evaluadas'};}
    const [[count]]=await conn.execute("SELECT COUNT(*) AS total FROM football_candidates WHERE provider=? AND visibility=? AND status='published' AND DATE(published_at)=UTC_DATE()",[NFORCE_PROVIDER,row.visibility]);
    if(Number(count.total)>=(row.visibility==='vip'?2:1)){await conn.rollback();return {published:false,reason:'Límite diario'};}
   }
   const [[ownerRow]]=await conn.query("SELECT id FROM admins WHERE role='owner' AND is_active=1 ORDER BY id LIMIT 1");
   if(!ownerRow)throw Error('Falta cuenta del dueño');
   const [created]=await conn.execute(`INSERT INTO predictions
    (title,analysis,visibility,outcome,published_at,author_id,league,match_date,market,selection,odds,telegram_status)
    VALUES (?,?,?,'pending',UTC_TIMESTAMP(),?,?,?,?,?,?,'pending')`,[
    `${row.home_team} vs ${row.away_team}`.slice(0,200),row.analysis,row.visibility,ownerRow.id,row.league,row.kickoff,row.market,row.selection,null]);
   recordId=created.insertId;
   await conn.execute("UPDATE football_candidates SET status='published',prediction_id=?,published_at=UTC_TIMESTAMP() WHERE id=?",[recordId,id]);
   await conn.execute("INSERT INTO audit_logs (actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'football_prediction_published','prediction',?,JSON_OBJECT('candidate_id',?,'engine','nforce','automatic',?))",[automatic?null:admin?.id,String(recordId),id,Number(automatic)]);
   await conn.commit();
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  const payload={id:recordId,title:`${row.home_team} vs ${row.away_team}`,analysis:row.analysis,visibility:row.visibility,league:row.league,
   match_date:sqlUtc(row.kickoff),market:row.market,selection:row.selection,odds:null,
   estimated_probability:Number(row.provider_probability),auto_generated:true,football_details:publishedFootballDetails(row.evidence_json)};
  let telegram='not_configured';
  try{telegram=(await sendTelegram(payload,process.env,{db})).state;}catch(e){telegram='failed';lastError='Telegram: '+safeError(e);}
  await db.execute('UPDATE predictions SET telegram_status=? WHERE id=?',[telegram,recordId]);
  if(enqueueEvent)try{await enqueueEvent(db,recordId,row.visibility);}catch(e){console.warn('nforce outbox:',safeError(e));}
  return {published:true,prediction_id:recordId,telegram};
 }
 async function publishPending(){
  if(publishing||process.env.FOOTBALL_AUTO_PUBLISH!=='true'||process.env.NFORCE_LIVE_RELEASE_ACK!=='true')return {skipped:true,reason:'Autopublicación local desactivada: exige FOOTBALL_AUTO_PUBLISH=true y NFORCE_LIVE_RELEASE_ACK=true'};
  publishing=true;
  try{return await withLock('fijas_nforce_publish',async()=>{
   const [rows]=await db.query("SELECT * FROM football_candidates WHERE provider=? AND status='draft' AND kickoff>DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) AND kickoff<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 73 HOUR) ORDER BY kickoff LIMIT 40",[NFORCE_PROVIDER]);
   let published=0,failed=0,missingChannel=0,blocked=0,unvalidated=0,limited=0;
   const [[backtestRow]]=await db.query('SELECT evaluated,model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   const backtestReady=backtestRow?.model_version===MODEL_VERSION&&Number(backtestRow?.evaluated)>=40&&
    backtestRow?.created_at&&now().getTime()-asUtc(backtestRow.created_at).getTime()<=8*DAY;
   for(const row of rows){
    if(!canAutoPublishCandidate(row)){blocked++;continue;}
    if(!backtestReady||Number(reportLimited(backtestRow.metrics_json)?.by_market?.[reportLimited(row.evidence_json)?.pick?.key]?.evaluated||0)<40){unvalidated++;continue;}
    if(row.visibility==='vip'&&!evaluateVipEvidence(row,backtestRow,{asOf:now()}).approved){unvalidated++;continue;}
    const ready=Boolean(process.env.TELEGRAM_BOT_TOKEN&&(row.visibility==='vip'?process.env.TELEGRAM_VIP_CHAT_ID:row.visibility==='gold'?true:freeTelegramDestination(process.env)));
    if(!ready){missingChannel++;continue;}
    try{const r=await publish(row.id,null,{automatic:true});if(r.published)published++;else if(r.reason==='Límite diario')limited++;}
    catch(e){failed++;lastError=safeError(e);}
    if(published>=3)break;
   }
   lastPublishReport={at:now().toISOString(),reviewed:rows.length,published,failed,missing_channel:missingChannel,blocked_by_filters:blocked,
    without_validation:unvalidated,daily_limit:limited,reason:published?null:unvalidated?'Falta backtesting vigente con al menos 40 selecciones del mercado; ejecuta «Validar modelo».':missingChannel?'Faltan token o chats de Telegram.':
     limited?'Límite diario alcanzado.':rows.length?'Borradores no aptos para publicación automática.':'No hay propuestas locales aptas.'};
   return lastPublishReport;
  });}finally{publishing=false;}
 }
 // Keep old API paths so existing dashboard, VIP protection and payment flows remain intact.
 app.get(api('status'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [[stats]]=await db.query(`SELECT (SELECT COUNT(*) FROM football_candidates WHERE provider='nforce-openfootball' AND status='draft') AS drafts,
    (SELECT COUNT(*) FROM football_candidates WHERE provider='nforce-openfootball' AND status='published') AS published,
    (SELECT COUNT(*) FROM football_candidates c JOIN predictions p ON p.id=c.prediction_id WHERE c.provider='nforce-openfootball' AND p.outcome='won') AS won,
    (SELECT COUNT(*) FROM football_candidates c JOIN predictions p ON p.id=c.prediction_id WHERE c.provider='nforce-openfootball' AND p.outcome='lost') AS lost,
    (SELECT COUNT(*) FROM nforce_matches) AS total_matches,
    (SELECT COUNT(DISTINCT competition) FROM nforce_matches) AS loaded_competitions,
    (SELECT COUNT(*) FROM nforce_matches WHERE home_goals IS NOT NULL) AS complete_matches`);
   const [[latest]]=await db.query('SELECT status,initiated_by,started_at,finished_at,error_message,upcoming AS examined,drafts AS drafts_created,insufficient AS without_prediction,filtered AS below_filters FROM nforce_scans ORDER BY id DESC LIMIT 1');
   const [[lastImport]]=await db.query('SELECT status,started_at,finished_at,sources,records,scheduled,completed_results,errors_json FROM nforce_import_runs ORDER BY id DESC LIMIT 1');
   const [[lastBacktest]]=await db.query('SELECT created_at,evaluated,accuracy,brier,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   const validation=reportLimited(lastBacktest?.metrics_json);const decided=Number(stats.won||0)+Number(stats.lost||0);
   const retry=importDecision(lastImport,now().getTime());
   const calendar_diagnostic=diagnoseNforceCalendar(await loadMatches(),{now:now(),days:NFORCE_SCAN_LOOKAHEAD_DAYS});
   res.json({calendar_diagnostic,engine:'N-FORCE',model_version:MODEL_VERSION,configured:true,auto_import:process.env.FOOTBALL_AUTO_IMPORT!=='false',
    scan_lookahead_days:NFORCE_SCAN_LOOKAHEAD_DAYS,scan_fixture_limit:NFORCE_SCAN_FIXTURE_LIMIT,
    auto_scan:process.env.FOOTBALL_AUTO_SCAN==='true',auto_publish:process.env.FOOTBALL_AUTO_PUBLISH==='true'&&process.env.NFORCE_LIVE_RELEASE_ACK==='true',
    automatic_free_promoted_to_gold:true,gold_distribution_rollout:GOLD_ROLLOUT,free_public_full:true,telegram_free_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&freeTelegramDestination(process.env)),telegram_vip_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID),
    drafts:Number(stats.drafts||0),published:Number(stats.published||0),won:Number(stats.won||0),lost:Number(stats.lost||0),accuracy:decided?Number((100*stats.won/decided).toFixed(1)):null,
    latest:latest||null,scanning,importing,publishing,last_error:lastError,last_import_report:lastImportReport,last_scan_report:lastScanReport,
    vip_policy:VIP_POLICY,vip_risk_policy:VIP_RISK_POLICY,last_publish_report:lastPublishReport,last_scheduler_message:lastSchedulerMessage,scheduled_retry_at:latest?new Date(asUtc(latest.started_at).getTime()+SCAN_INTERVAL_MINUTES*60000).toISOString():null,
    scheduled_retry_reason:'Control local cada hora',manual_scan:{available:!scanning,remaining:'Ilimitados con pausa de 5 min',daily_limit:'—'},
    configured_competitions:LEAGUES.length,live_schedule_supported_competitions:LIVE_VERIFICATION_LEAGUES.length,loaded_competitions:Number(stats.loaded_competitions||0),
    total_matches:Number(stats.total_matches||0),complete_matches:Number(stats.complete_matches||0),source_import:lastImport||null,next_import_at:retry.next,
    settlement:settlement.getStatus(),
    backtest:lastBacktest?{evaluated:lastBacktest.evaluated,accuracy:lastBacktest.accuracy,brier:lastBacktest.brier,validated:Number(lastBacktest.evaluated)>=40&&validation.model===MODEL_VERSION&&now().getTime()-asUtc(lastBacktest.created_at).getTime()<=8*DAY,
    model_version:validation.model,segments:validation.segments||null,by_market:validation.by_market||null,calibration:validation.calibration||null,comparison_previous:validation.comparison_previous||null}:null});
  }catch(e){res.status(500).json({error:'No se pudo consultar N-FORCE: '+safeError(e)});}
 });
 app.get(api('candidates'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.query(`SELECT c.id,c.fixture_id,c.visibility,c.home_team,c.away_team,c.league,COALESCE(s.kickoff,c.kickoff) AS kickoff,c.kickoff AS candidate_kickoff,c.market,c.selection,c.provider_probability,c.odds,c.analysis,c.evidence_json,c.status,c.prediction_id,c.created_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM football_candidates c LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=c.fixture_id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE c.provider=? AND c.status='draft' ORDER BY c.id DESC LIMIT 40`,[NFORCE_PROVIDER]);
   const [[validation]]=await db.query('SELECT evaluated,model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   res.json({candidates:rows.map(row=>{const ev=reportLimited(row.evidence_json);const {evidence_json,...r}=row;
    return {...r,analysis:publicAnalysisText(row.analysis),goal_projection:ev.goals||null,match_context:ev.match_context||null,own_model:ev.model||null,advanced:null,
      needs_refresh:row.status==='draft'&&(ev.model?.model!==MODEL_VERSION||Boolean(row.schedule_verified_at&&Math.abs(asUtc(row.candidate_kickoff).getTime()-asUtc(row.kickoff).getTime())>60000)),
      schedule_changed:Boolean(row.schedule_verified_at&&Math.abs(asUtc(row.candidate_kickoff).getTime()-asUtc(row.kickoff).getTime())>60000),
      vip_validation:row.visibility==='vip'&&row.status==='draft'?evaluateVipEvidence(row,validation,{asOf:now()}):null};})});
  }catch(e){res.status(500).json({error:safeError(e)});}
 });
 // Owner-requested recovery of historical discards. Old versions sometimes stamped
 // an incompatible proposal as `manual`, so a scan could never distinguish it.
 // Expose those records for explicit REVIEW; never mass-revive manual decisions.
 app.get(api('discarded'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.execute(`SELECT c.id,c.fixture_id,c.home_team,c.away_team,c.league,c.kickoff,
    c.visibility,c.evidence_json,c.created_at,c.status,c.prediction_id,c.published_at,
    COALESCE(s.kickoff,m.kickoff,c.kickoff) AS actual_kickoff,
    m.home_goals,m.away_goals,m.scheduled_time_known,s.status AS live_status
    FROM football_candidates c
    LEFT JOIN nforce_matches m ON m.id=c.fixture_id
    LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=c.fixture_id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR)
    WHERE c.provider=? AND c.status='discarded'
    ORDER BY c.id DESC LIMIT 150`,[NFORCE_PROVIDER]);
   const currentTime=now().getTime(),horizon=currentTime+NFORCE_SCAN_LOOKAHEAD_DAYS*DAY;
   const entries=rows.map(r=>{
    const at=r.actual_kickoff?asUtc(r.actual_kickoff).getTime():0;
    const reason=discardReason(r.evidence_json)||'sin_etiqueta';
    const hasModel=Boolean(candidateModelVersion(r.evidence_json));
    let eligibility='revision_permitida';
    if(r.prediction_id!=null||r.published_at!=null)eligibility='ya_publicada';
    else if(!r.scheduled_time_known||!at||!Number.isFinite(at))eligibility='horario_no_confirmado';
    else if(r.home_goals!=null||r.away_goals!=null||r.live_status&&r.live_status!=='NS'||at<=currentTime+60*60000)eligibility='partido_iniciado_o_cercano';
    else if(at>=horizon)eligibility='fuera_de_ventana';
    return {id:r.id,match:`${r.home_team} vs ${r.away_team}`,league:r.league,kickoff:r.actual_kickoff,
     visibility:r.visibility,discard_reason:reason,stored_model:hasModel?candidateModelVersion(r.evidence_json):'no identificado',eligibility};
   });
   res.set('Cache-Control','private, no-store').json({candidates:entries,scan_lookahead_days:NFORCE_SCAN_LOOKAHEAD_DAYS,
    note:'La recuperación requiere confirmar cada propuesta y recalcularla; no publica, ni altera resultados anteriores.'});
  }catch(e){res.status(500).json({error:'No fue posible consultar las propuestas descartadas: '+safeError(e)});}
 });
 app.post(api('discarded/:id/reconsider'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!validId(req.params.id))return res.status(400).json({error:'ID inválido'});
  if(req.body?.confirm!==true)return res.status(400).json({error:'Debes confirmar expresamente la reevaluación de esta propuesta.'});
  try{
   const result=await withLock('fijas_nforce_scan',async conn=>{
    const all=await loadMatches(),historical=all.filter(fulltime);
    await conn.beginTransaction();
    try{
     const [[stored]]=await conn.execute(`SELECT * FROM football_candidates WHERE id=? AND provider=? FOR UPDATE`,[req.params.id,NFORCE_PROVIDER]);
     if(!stored||stored.status!=='discarded'||stored.prediction_id!=null||stored.published_at!=null){
      await conn.rollback();return {reopened:false,reason:'La propuesta ya no es un descarte recuperable o está asociada a una publicación.'};
     }
     const fixture=all.find(m=>String(m.id)===String(stored.fixture_id));
     if(!fixture||!fixture.scheduled_time_known||!fixture.kickoff||fixture.home_goals!=null||fixture.away_goals!=null||fixture.live_status&&fixture.live_status!=='NS'){
      await conn.rollback();return {reopened:false,reason:'Partido sin horario válido, cancelado o con resultado. Importa datos si está pendiente.'};
     }
     const at=asUtc(fixture.kickoff).getTime(),t0=now().getTime();
     if(!Number.isFinite(at)||at<=t0+60*60000||at>=t0+NFORCE_SCAN_LOOKAHEAD_DAYS*DAY){
      await conn.rollback();return {reopened:false,reason:`Partido fuera de la ventana de análisis de ${NFORCE_SCAN_LOOKAHEAD_DAYS} días o demasiado próximo.`};
     }
     const model=estimateMatch(fixture,historical,at);
     const rebuilt=model?classifyAutomaticCandidate(makeCandidate(fixture,model)):null;
     if(!rebuilt){await conn.rollback();return {reopened:false,reason:'El modelo vigente no encuentra una selección con calidad suficiente para este partido.'};}
     // Do not create a second recommendation for an already published match.
     const [published]=await conn.execute(`SELECT id FROM predictions WHERE title=? AND archived_at IS NULL
      AND ABS(TIMESTAMPDIFF(MINUTE,match_date,?))<=180 LIMIT 1`,[
      `${fixture.home} vs ${fixture.away}`.slice(0,200),rebuilt.kickoff]);
     if(published.length){await conn.rollback();return {reopened:false,reason:'Este partido ya tiene un pronóstico publicado.'};}
     const [updated]=await conn.execute(`UPDATE football_candidates SET status='draft',visibility=?,home_team=?,away_team=?,league=?,kickoff=?,
      market=?,selection=?,provider_probability=?,odds=NULL,analysis=?,evidence_json=?
      WHERE id=? AND provider=? AND status='discarded' AND prediction_id IS NULL AND published_at IS NULL`,[
      rebuilt.visibility,rebuilt.home_team,rebuilt.away_team,rebuilt.league,rebuilt.kickoff,
      rebuilt.market,rebuilt.selection,rebuilt.provider_probability,rebuilt.analysis,rebuilt.evidence_json,
      stored.id,NFORCE_PROVIDER]);
     if(Number(updated.affectedRows)!==1){await conn.rollback();return {reopened:false,reason:'El estado cambió antes de completar la recuperación.'};}
     await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
      VALUES (?,'nforce_discard_owner_reanalyzed','football_candidate',?,?)`,[
      req.admin.id,String(stored.id),JSON.stringify({old_reason:discardReason(stored.evidence_json)||'legacy_unmarked',old_model:candidateModelVersion(stored.evidence_json)||'unknown',new_model:MODEL_VERSION,
       old_visibility:stored.visibility,new_visibility:rebuilt.visibility,confirmed_by_owner:true})]);
     await conn.commit();return {reopened:true,id:stored.id,visibility:rebuilt.visibility,market:rebuilt.market,
      message:'Propuesta recalculada y devuelta a Pendientes para revisión. No se ha publicado.'};
    }catch(e){await conn.rollback();throw e;}
   });
   res.json(result);
  }catch(e){res.status(500).json({error:'No fue posible reanalizar la propuesta: '+safeError(e)});}
 });
 app.post(api('import'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(importing)return res.status(409).json({error:'Importación en curso'});
  importData({force:true}).catch(e=>{lastError=safeError(e);console.warn('nforce manual import:',lastError);});
  res.status(202).json({accepted:true,message:'Importación de datos deportivos iniciada; consulta el estado para ver el resultado.'});
 });
 app.post(api('settle'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await settlement.run());}catch(e){res.status(503).json({error:'No se pudieron cotejar resultados: '+safeError(e)});}
 });
 app.post(api('backtest'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await backtest());}catch(e){res.status(500).json({error:'No se pudo validar modelo: '+safeError(e)});}
 });
 app.post(api('test'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{const all=await loadMatches();const usable=all.filter(m=>fulltime(m));const future=all.filter(m=>m.kickoff&&m.scheduled_time_known&&m.home_goals==null&&Date.parse(m.kickoff)>now().getTime());
   const inWindow=future.filter(m=>Date.parse(m.kickoff)>now().getTime()+3600000&&Date.parse(m.kickoff)<now().getTime()+NFORCE_SCAN_LOOKAHEAD_DAYS*DAY);
   const eligible=inWindow.filter(m=>estimateMatch(m,usable,Date.parse(m.kickoff)));
   res.json({ok:true,api_connected:true,fixture_total:all.length,scan_lookahead_days:NFORCE_SCAN_LOOKAHEAD_DAYS,
    fixtures_in_window:inWindow.length,examined:eligible.length,
    future_with_known_time:future.length,
    future_without_known_time:all.filter(m=>m.home_goals===null&&!m.scheduled_time_known&&m.date>=now().toISOString().slice(0,10)).length,
    reason:inWindow.length?`Partidos con hora dentro de los próximos ${NFORCE_SCAN_LOOKAHEAD_DAYS} días: ${eligible.length} de ${inWindow.length} con modelo estadístico suficiente. Estos no son necesariamente propuestas nuevas.`:
      `No hay partidos futuros con hora confirmada en los próximos ${NFORCE_SCAN_LOOKAHEAD_DAYS} días; importa datos y comprueba el calendario.`,
    source:'Resultados históricos almacenados en MySQL; motor estadístico propio'});
  }catch(e){res.status(500).json({error:safeError(e)});}
 });
 app.post(api('scan'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(scanning)return res.status(409).json({error:'Escaneo en curso'});
  scan({manual:true}).catch(e=>{lastScanReport={ok:false,error:safeError(e)};});
  res.status(202).json({accepted:true,message:'Análisis local iniciado. Actualiza el panel para revisar las propuestas.'});
 });
 app.post(api('candidates/:id/refresh'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await refreshCandidate(req.params.id,req.admin));}
  catch(e){res.status(400).json({error:safeError(e)});}
 });
 app.post(api('candidates/:id/refresh-advanced'),authenticate,(req,res)=>{if(!owner(req))return res.status(403).json({error:'Solo creador'});return res.status(409).json({error:'El motor actual usa resultados históricos; no hay lesiones ni alineaciones verificadas disponibles. No se inventan.'});});
 app.post(api('candidates/:id/publish'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await publish(req.params.id,req.admin));}catch(e){res.status(400).json({error:safeError(e)});}
 });
 app.post(api('candidates/:id/discard'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!validId(req.params.id))return res.status(400).json({error:'ID inválido'});
  try{
   const [[candidate]]=await db.execute("SELECT provider,visibility,status,prediction_id,published_at,evidence_json FROM football_candidates WHERE provider=? AND id=? AND status='draft' LIMIT 1",[NFORCE_PROVIDER,req.params.id]);
   if(!candidate)return res.status(409).json({error:'No se puede descartar esta propuesta'});
   const reason=reasonForDiscard(candidate,MODEL_VERSION);
   const [r]=await db.execute("UPDATE football_candidates SET status='discarded',evidence_json=JSON_SET(evidence_json,'$.discarded_in_build',?,'$.discard_reason',?) WHERE provider=? AND id=? AND status='draft'",[CANDIDATE_REVIEW_BUILD,reason,NFORCE_PROVIDER,req.params.id]);
   if(!r.affectedRows)return res.status(409).json({error:'La propuesta ya cambió de estado'});
   await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'football_candidate_discarded','football_candidate',?,?)",[req.admin.id,req.params.id,JSON.stringify({reason,build:CANDIDATE_REVIEW_BUILD})]);
   res.json({ok:true,reason,may_reappear_on_rescan:reason==='version_incompatible'});
  }catch(e){res.status(500).json({error:safeError(e)});}
 });
 async function tick(){
  // Refresh source every ~2h; OpenFootball is a delayed community feed, NOT live scores.
  if(process.env.FOOTBALL_AUTO_IMPORT!=='false')await importData().catch(e=>{lastError=safeError(e);console.warn('nforce import:',lastError);});
  // Refresh independent walk-forward metrics weekly, also at first start.
  // When history is absent/insufficient, publication stays blocked.
  if(process.env.FOOTBALL_AUTO_SCAN==='true'||process.env.FOOTBALL_AUTO_PUBLISH==='true'){
   const [[b]]=await db.query('SELECT created_at,model_version,evaluated FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   if(!b||b.model_version!==MODEL_VERSION||now().getTime()-asUtc(b.created_at).getTime()>7*DAY||
      (Number(b.evaluated||0)<40&&now().getTime()-asUtc(b.created_at).getTime()>12*3600000)){
    await backtest().catch(e=>{lastError='Backtesting: '+safeError(e);});
   }
  }
  // Refresh outcomes from imported FT scores even when automatic publishing is off.
  // Only N-FORCE fixture-linked predictions can be matched safely.
  await settlement.run().catch(e=>{lastError='Resultados: '+safeError(e);});
  if(process.env.FOOTBALL_AUTO_SCAN==='true'){
   const r=await scan().catch(e=>{lastError=safeError(e);return {ok:false,error:lastError};});
   if(r&&!r.cooldown)lastSchedulerMessage=r.ok?`Escaneo local: ${r.drafts_created} propuestas / ${r.examined} partidos.`:safeError(r.error||r.message);
  }
  if(process.env.FOOTBALL_AUTO_PUBLISH==='true')await publishPending().catch(e=>{lastError=safeError(e);});
 }
 function start(){if(interval)return;
  interval=setInterval(tick,15*60000);interval.unref?.();setImmediate(()=>tick().catch(e=>console.error('nforce scheduler:',safeError(e))));
 }
 return {importData,scan,backtest,publish,refreshCandidate,publishPending,settle:settlement.run,tick,start,stop:()=>{if(interval)clearInterval(interval);interval=null;}};
}
