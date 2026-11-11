import {publicAnalysisText} from './public-branding.js';
import {freeTelegramDestination} from './telegram-public.js';
import {allowedDatasets,nationalDatasets,NATIONAL_COMPETITIONS,fetchOpenFootball,LEAGUES,NFORCE_PROVIDER} from './nforce-data.js';
import {diagnoseNforceCalendar} from './nforce-calendar-health.js';
import {estimateMatch,modelReadiness,makeCandidate,walkForwardBacktest,fulltime,MODEL_VERSION,MODEL_SETTINGS,VIP_RISK_POLICY,vipSampleGaps} from './nforce-model.js';
import {canAutoPublishCandidate} from './football-publication-policy.js';
import {evaluateVipEvidence,VIP_POLICY} from './nforce-vip-gate.js';
import {summarizeVipDatabase} from './nforce-vip-diagnostic.js';
import {sendPredictionToTelegram} from './telegram-bridge.js';
import {publishedFootballDetails} from './football-report.js';
import {createNforceSettlement} from './nforce-settlement.js';
import {LIVE_VERIFICATION_LEAGUES,independentScheduleCoverage} from './live-schedule.js';
import {candidateModelVersion,discardedInBuild,discardReason,reasonForDiscard,canReopenOldDiscard,CANDIDATE_REVIEW_BUILD} from './nforce-candidate-revival.js';
import {classifyAutomaticCandidate,shouldBlockLegacyFreeDraft,GOLD_ROLLOUT} from './nforce-gold-transition.js';
import {nforceSourceReadiness} from './nforce-source-readiness.js';
import {explainScan,tallyCompetition} from './nforce-scan-insights.js';
import {importSecondaryFixtures,SECONDARY_COMPETITIONS} from './secondary-fixtures.js';
import {readSecondarySource,saveSecondarySource,readFootballDataSource,saveFootballDataSource} from './nforce-source-settings.js';
import {importFootballDataFixtures,FOOTBALL_DATA_COMPETITIONS} from './football-data-fixtures.js';
import {readWideSource,saveWideSource} from './nforce-source-settings.js';
import {importWideCalendar,WIDE_SUPPORTED_COMPETITIONS} from './api-football-wide.js';
import {auditTomorrowCalendar} from './nforce-fixture-audit.js';
import {predictAiForecast,AI_MODEL_VERSION} from './nforce-ml.js';
import {prepareVipRadar,vipRadarTelegramMessage,vipRadarOfficialTeaser,VIP_RADAR_MIN_LEAD_HOURS,VIP_RADAR_MAX_DAYS} from './nforce-vip-radar.js';
import {telegramApi,inspectFreeTelegramChannel} from './telegram-bridge.js';

const DAY=86400000;
const asUtc=x=>x instanceof Date?x:new Date(String(x||'').replace(' ','T')+(String(x||'').match(/Z|[+-]\d\d:\d\d$/)?'':'Z'));
const sqlUtc=x=>asUtc(x).toISOString().slice(0,19).replace('T',' ');
const validId=x=>/^\d{1,18}$/.test(String(x));
const safeError=e=>String(e?.message||e).replace(/(sk_live_|sk_test_|pk_live_|pk_test_)[^\s]+/g,'[redacted]').slice(0,180);
const reportLimited=e=>{try{return typeof e==='string'?JSON.parse(e):e||{};}catch{return {};}};
const owner=req=>req.admin?.role==='owner';
export const IMPORT_INTERVAL_HOURS=2;
export const SCAN_INTERVAL_MINUTES=60;
// 30 days by default to allow a wider, advance view; actual coverage is provider-dependent. Owners may choose 3..30 days
// to PREPARE draft picks during calendar gaps. All drafts remain subject to normal approval, fresh
// schedule checks and the same statistical safeguards before publication.
const requestedScanDays=Number(process.env.NFORCE_SCAN_DAYS??30);
export const NFORCE_SCAN_LOOKAHEAD_DAYS=Number.isInteger(requestedScanDays)&&requestedScanDays>=3&&requestedScanDays<=30?requestedScanDays:30;
export const NFORCE_SCAN_FIXTURE_LIMIT=400;

export function importDecision(last,now=Date.now(),hours=IMPORT_INTERVAL_HOURS){
 if(!last)return {due:true,next:null};
 const started=asUtc(last.started_at).getTime(),interval=(last.status==='completed'?hours:2)*3600000;
 const next=started+interval;
 return {due:!Number.isFinite(next)||now>=next,next:Number.isFinite(next)?new Date(next).toISOString():null};
}
export function installNforceEngine(app,{db,authenticate,fetchDataset=fetchOpenFootball,fetchSecondary=importSecondaryFixtures,fetchFootballData=importFootballDataFixtures,fetchWide=importWideCalendar,fetchCalendarAudit=auditTomorrowCalendar,sendTelegram=sendPredictionToTelegram,sendRadarTelegram=async(chat,text,env)=>telegramApi('sendMessage',{chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true,protect_content:true},env),sendRadarOfficialTelegram=async(chat,text,env)=>telegramApi('sendMessage',{chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true},env),inspectOfficialChannel=inspectFreeTelegramChannel,enqueueEvent=null,now=()=>new Date()}={}){
 const settlement=createNforceSettlement({db,now});
 let importing=false,scanning=false,publishing=false,combinedRunning=false,radarSending=false,interval=null;
 let lastScanReport=null,lastImportReport=null,lastPublishReport=null,lastSchedulerMessage='',lastError='';
 let lastAutoRadarAttempt=0,lastCoverageAuditAt=0;
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
   const datasets=[...allowedDatasets(now()),...nationalDatasets(now())];
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
   // Optional supplementary fixtures are discovered AFTER historical import,
   // so reconciliation sees current local rows and prevents duplicate games.
   // Failures do not discard or roll back successful historical results.
   let secondary={enabled:false},secondaryEnabled=false;
   try{
    const config=await readSecondarySource(conn);
    secondaryEnabled=config.enabled;
    secondary=await fetchSecondary({conn,now:now(),env:process.env,enabled:secondaryEnabled});
   }catch(error){secondary={enabled:secondaryEnabled,failed:true,error:safeError(error),requests:0,inserted:0,matched:0};}
   let footballData={enabled:false},footballDataEnabled=false;
   try{
    const source=await readFootballDataSource(conn);
    footballDataEnabled=source.enabled;
    footballData=await fetchFootballData({conn,now:now(),enabled:footballDataEnabled,key:process.env.FOOTBALL_DATA_ORG_KEY});
   }catch(error){footballData={enabled:footballDataEnabled,failed:true,error:safeError(error),requests:0,inserted:0,matched:0,errors:[safeError(error)]};}
   let wide={enabled:false},wideEnabled=false;
   try{
    const config=await readWideSource(conn);
    wideEnabled=config.enabled;
    wide=await fetchWide({conn,now:now(),env:process.env,enabled:wideEnabled});
   }catch(error){wide={enabled:wideEnabled,failed:true,error:safeError(error),requests:0,inserted:0,matched:0,errors:[safeError(error)]};}
   const status=sources||secondary.inserted||secondary.matched||footballData.inserted||footballData.matched||wide.inserted||wide.matched?'completed':'failed';
   await conn.execute('UPDATE nforce_import_runs SET status=?,finished_at=UTC_TIMESTAMP(),sources=?,records=?,scheduled=?,completed_results=?,errors_json=? WHERE id=?',
    [status,sources,imported,scheduled,completed,JSON.stringify(errors).slice(0,3900),id]);
   lastImportReport={ok:status==='completed',status,sources,records:imported,scheduled,completed,failed_sources:errors.length,errors:errors.slice(0,5),secondary,football_data:footballData,api_football_wide:wide,
    competitions_configured:LEAGUES.length+NATIONAL_COMPETITIONS.length,competitions_imported:importedCompetitions.size,
    leagues_imported:[...LEAGUES,...NATIONAL_COMPETITIONS].filter(l=>importedCompetitions.has(l.code)).map(l=>l.name),
    national_teams_supported:true,national_competitions_imported:NATIONAL_COMPETITIONS.filter(c=>importedCompetitions.has(c.code)).map(c=>c.name),
    datasets_missing:missing,leagues_with_missing_seasons:[...missingCompetitions],
    warning:errors.length?'Importación parcial: algunas consultas fallaron.':missing?'Algunas competiciones aún no tienen archivos disponibles para todas las temporadas; no se inventan partidos.':'Los calendarios pueden estar desactualizados; verifica horarios antes de publicar.'};
   if(status==='failed')lastError='Fallaron las consultas de resultados deportivos';
   return lastImportReport;
  });}finally{importing=false;}
 }
 async function loadMatches(){
  // bounded season set; no API requests per match.
  const [rows]=await db.query('SELECT m.id,m.source_key,m.competition,m.league,m.season,m.round_name AS `round`,m.home_team AS home,m.away_team AS away,COALESCE(DATE(s.kickoff),m.match_date) AS date_label,COALESCE(s.kickoff,m.kickoff) AS kickoff,(m.scheduled_time_known OR s.kickoff IS NOT NULL) AS scheduled_time_known,m.home_goals,m.away_goals,m.source_path,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE m.match_date>=DATE_SUB(UTC_DATE(),INTERVAL 960 DAY) ORDER BY m.match_date DESC LIMIT 45000');
  return rows.reverse().map(r=>({...r,date:r.date_label instanceof Date?r.date_label.toISOString().slice(0,10):String(r.date_label).slice(0,10),
   kickoff:r.kickoff?asUtc(r.kickoff).toISOString():null,scheduled_time_known:Boolean(r.scheduled_time_known),
   home_goals:r.home_goals==null?null:Number(r.home_goals),away_goals:r.away_goals==null?null:Number(r.away_goals)}));
 }
 async function scan({manual=false,days=NFORCE_SCAN_LOOKAHEAD_DAYS}={}){
  if(!Number.isInteger(days)||days<3||days>30)throw Error('Ventana de búsqueda inválida (3–30 días)');
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
    const calendar_diagnostic=diagnoseNforceCalendar(all,{now:now(),days:days});
    const horizon=time+days*DAY;
    const futureWithTimes=all.filter(x=>x.scheduled_time_known&&x.kickoff&&x.home_goals===null&&(!x.live_status||x.live_status==='NS')&&Date.parse(x.kickoff)>time+60*60000)
     .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    const withinWindow=futureWithTimes.filter(x=>Date.parse(x.kickoff)<horizon);
    const future=withinWindow.slice(0,NFORCE_SCAN_FIXTURE_LIMIT);
    const nextBeyondWindow=futureWithTimes.find(x=>Date.parse(x.kickoff)>=horizon);
    let models=0,drafts=0,underMin=0,rejected=0,alreadyPresent=0,updatedDrafts=0,reopenedOldDiscards=0;
    const existingByStatus={draft:0,discarded:0,published:0,other:0};
    const examples=[];const missingReasons={};const filteredExamples=[];const modelMissingExamples=[];
    const perCompetition={};const nearMisses=[];
    const marketCounts={};const categoryCounts={free:0,gold:0,vip:0};const vipRejections={};
    const vipMissingByRequirement={};const vipMissingExamples=[];let vipGapFixtures=0;
    for(const m of future){
     const model=estimateMatch(m,usable,Date.parse(m.kickoff));
     if(!model){
      underMin++;tallyCompetition(perCompetition,m,'insufficient');
      const why=modelReadiness(m,usable,Date.parse(m.kickoff));
      missingReasons[why.reason]=(missingReasons[why.reason]||0)+1;
      if(examples.length<4)examples.push(`${m.home} vs ${m.away}: ${why.reason} (liga ${why.sample?.league||0}, local ${why.sample?.home||0}, visita ${why.sample?.away||0})`);
      if(modelMissingExamples.length<12)modelMissingExamples.push({match:`${m.home} vs ${m.away}`,league:m.league,
       reason:why.reason,sample:why.sample||null,required:{league:MODEL_SETTINGS.minLeague,home:MODEL_SETTINGS.minTeam,away:MODEL_SETTINGS.minTeam,
        fresh_days:String(m.competition||'').startsWith('int.')?180:MODEL_SETTINGS.freshDays}});
      continue;
     }
     models++;
     // Count missing evidence once per modeled fixture. VIP market rejection
     // counters below are separate and can contain nine entries per fixture.
     const missingVip=vipSampleGaps(model);
     if(missingVip.length){
      vipGapFixtures++;
      for(const item of missingVip)vipMissingByRequirement[item.code]=(vipMissingByRequirement[item.code]||0)+1;
      if(vipMissingExamples.length<10)vipMissingExamples.push({match:`${m.home} vs ${m.away}`,league:m.league,
       kickoff:m.kickoff,missing:missingVip});
     }
     const marketDiagnostics={};const candidate=classifyAutomaticCandidate(makeCandidate(m,model,marketDiagnostics));
     for(const [reason,total] of Object.entries(marketDiagnostics.vip_rejections||{}))vipRejections[reason]=(vipRejections[reason]||0)+total;
     if(!candidate){rejected++;tallyCompetition(perCompetition,m,'filtered');
      if(nearMisses.length<8)nearMisses.push({match:`${m.home} vs ${m.away}`,league:m.league,kickoff:m.kickoff,estimated_1x2:model.confidence,quality:model.quality,reason:'No alcanzó los criterios de selección; no es una propuesta publicable.'});
      if(filteredExamples.length<5)filteredExamples.push(`${m.home} vs ${m.away}: 1X2 ${model.confidence}% · >1.5 ${model.totals.over15}% · BTTS ${model.totals.btts}% · calidad ${model.quality}/100`);continue;}
     categoryCounts[candidate.visibility]++;
     const marketKey=JSON.parse(candidate.evidence_json).pick.key;marketCounts[marketKey]=(marketCounts[marketKey]||0)+1;
     const [r]=await conn.execute(`INSERT IGNORE INTO football_candidates
      (provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,[
      candidate.provider,candidate.fixture_id,candidate.visibility,candidate.home_team,candidate.away_team,candidate.league,
      candidate.kickoff,candidate.market,candidate.selection,candidate.provider_probability,null,candidate.analysis,candidate.evidence_json]);
     const revivedBefore=reopenedOldDiscards;
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
     tallyCompetition(perCompetition,m,Number(r.affectedRows||0)?'new':reopenedOldDiscards>revivedBefore?'reopened':'existing');
     drafts+=Number(r.affectedRows||0);
    }
    await conn.execute('UPDATE nforce_scans SET status=?,finished_at=UTC_TIMESTAMP(),upcoming=?,modeled=?,drafts=?,insufficient=?,filtered=? WHERE id=?',
     ['completed',future.length,models,drafts,underMin,rejected,id]);
    lastError='';lastScanReport={ok:true,mode:manual?'manual':'scheduled',
     lookahead_days:days,fixture_limit:NFORCE_SCAN_FIXTURE_LIMIT,calendar_diagnostic,
     fixtures_with_known_time:futureWithTimes.length,fixtures_in_window:future.length,examined:future.length,
     fixtures_truncated:Math.max(0,withinWindow.length-future.length),
     next_fixture_beyond_window:nextBeyondWindow?{match:`${nextBeyondWindow.home} vs ${nextBeyondWindow.away}`,kickoff:nextBeyondWindow.kickoff}:null,
     modeled:models,drafts_created:drafts,per_competition:Object.values(perCompetition).sort((a,b)=>b.examined-a.examined),
     near_misses:nearMisses,reopened_old_discards:reopenedOldDiscards,reopened_incompatible_discards:reopenedOldDiscards,already_present:alreadyPresent,existing_by_status:existingByStatus,
     updated_existing_drafts:updatedDrafts,eligible:drafts+reopenedOldDiscards+alreadyPresent,
     eligible_by_category:categoryCounts,eligible_by_market:marketCounts,vip_rejections_by_market_reason:vipRejections,
     vip_sample_gaps_by_requirement:vipMissingByRequirement,vip_sample_gap_examples:vipMissingExamples,
     // Counts describe modeled fixtures, not nine markets per fixture.
     vip_sample_gap_fixtures:vipGapFixtures,
     insufficient_history:underMin,insufficient_reasons:missingReasons,model_missing_examples:modelMissingExamples,below_filters:rejected,rejection_examples:examples,filter_examples:filteredExamples,
     fixtures_without_time:all.filter(x=>x.home_goals===null&&!x.scheduled_time_known&&x.date>=now().toISOString().slice(0,10)).length,
     note_on_quality:'El indicador de calidad de muestra NO representa el porcentaje real de aciertos.',
     note:drafts||reopenedOldDiscards?`${drafts} propuestas nuevas y ${reopenedOldDiscards} descartadas en versiones anteriores recuperadas; revísalas antes de aprobar.`:future.length===0?
      `Sin encuentros listos. ${calendar_diagnostic.diagnosis}`:
      alreadyPresent?`${alreadyPresent} propuestas elegibles ya registradas (pendientes: ${existingByStatus.draft}, descartadas: ${existingByStatus.discarded}, publicadas: ${existingByStatus.published}); los descartes de esta versión siguen descartados.`:
      'No hay propuestas nuevas: el historial es insuficiente o los filtros han rechazado los mercados.'};
    lastScanReport.insight=explainScan(lastScanReport);
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

 // VIP bulletin: additional subscriber value without pretending that a research
 // probability has cleared the official candidate / backtest publication gate.
 async function vipRadarPreview(){
  const all=await loadMatches();
  const [[backtest]]=await db.query('SELECT model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
  const valid=backtest?.model_version===MODEL_VERSION&&now().getTime()-asUtc(backtest.created_at).getTime()<8*DAY;
  const models=valid?reportLimited(backtest.metrics_json).ai_models||{}:{};
  const preview=prepareVipRadar(all,{now:now(),days:VIP_RADAR_MAX_DAYS,models,limit:8});
  return {...preview,ai_validation_current:Boolean(valid),generated_at:now().toISOString()};
 }
 async function vipRadarEnabled(){
  const [[row]]=await db.execute('SELECT enabled FROM nforce_source_settings WHERE source_id=? LIMIT 1',['vipradar']);
  return Boolean(Number(row?.enabled));
 }
 async function vipRadarLast(){
  const [[row]]=await db.query('SELECT dispatch_day,status,sent_at,telegram_message_id,public_status,public_sent_at,public_message_id,private_failure_kind,recovery_attempts FROM nforce_vip_radar_dispatches ORDER BY dispatch_day DESC LIMIT 1');
  return row||null;
 }
 // At most one public notice per successfully delivered private bulletin.
 // Never fall back to the community group or the private VIP chat.
 async function announceVipRadarOnOfficial(report,day,vipChat,conn){
  const setStatus=async(state)=>conn.execute('UPDATE nforce_vip_radar_dispatches SET public_status=? WHERE dispatch_day=?',[state,day]);
  if(!freeTelegramDestination(process.env)){await setStatus('skipped');return {state:'skipped',reason:'Canal oficial sin configurar.'};}
  let verified;
  try{verified=await inspectOfficialChannel(process.env,{checkPermissions:true});}
  catch(error){verified={ready:false,reason:'No se pudo verificar el canal oficial.'};}
  if(!verified?.ready){await setStatus('skipped');return {state:'skipped',reason:verified?.reason||'Canal oficial no disponible.'};}
  if(String(verified.chat_id)===String(vipChat)){
   await setStatus('skipped');return {state:'skipped',reason:'El canal oficial coincide con el destino VIP; se omitió el anuncio.'};
  }
  const teaser=vipRadarOfficialTeaser(report,{baseUrl:process.env.PUBLIC_BASE_URL});
  if(!teaser){await setStatus('skipped');return {state:'skipped',reason:'El boletín no contiene partidos para anunciar.'};}
  const [reserved]=await conn.execute(
   "UPDATE nforce_vip_radar_dispatches SET public_status='reserved',public_chat_id=? WHERE dispatch_day=? AND status='sent' AND public_status='pending'",
   [String(verified.chat_id),day]);
  if(Number(reserved.affectedRows)!==1)return {state:'skipped',reason:'El anuncio ya fue procesado.'};
  try{
   const message=await sendRadarOfficialTelegram(verified.chat_id,teaser,process.env);
   await conn.execute("UPDATE nforce_vip_radar_dispatches SET public_status='sent',public_sent_at=UTC_TIMESTAMP(),public_message_id=? WHERE dispatch_day=?",[message?.message_id||null,day]);
   return {state:'sent',message_id:message?.message_id||null};
  }catch(error){
   await setStatus('failed').catch(()=>{});
   console.error('Adelanto Radar VIP oficial no enviado:',safeError(error));
   return {state:'failed',reason:'El boletín VIP se envió, pero falló el anuncio oficial; comprueba los permisos del bot.'};
  }
 }
 async function dispatchVipRadar({manual=false,confirmUnsent=false}={}){
  if(radarSending)return {sent:false,reason:'El radar ya se está enviando.'};
  radarSending=true;
  try{return await withLock('fijas_nforce_vip_radar',async conn=>{
   if(!manual&&!await vipRadarEnabled())return {sent:false,reason:'Radar automático desactivado'};
   if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_VIP_CHAT_ID)
    return {sent:false,reason:'Falta configurar el canal VIP o el bot de Telegram.'};
   const target=String(process.env.TELEGRAM_VIP_CHAT_ID||'').trim(),publicId=String(freeTelegramDestination(process.env)||'').trim();
   if(!/^-?\d{8,18}$/.test(target)||target===publicId||target===String(process.env.TELEGRAM_FREE_CHANNEL_CHAT_ID||''))
    return {sent:false,reason:'El canal VIP debe ser un ID numérico distinto al canal oficial.'};
   if(publicId.startsWith('@')){
    const verified=await inspectOfficialChannel(process.env);
    if(!verified.ready||verified.chat_id===target)return {sent:false,reason:'No se pudo confirmar que el destino VIP sea distinto del oficial.'};
   }
   const report=await vipRadarPreview();
   if(!report.items.length)return {sent:false,reason:'No existen partidos con historial suficiente y horario conocido entre 2 horas y 30 días. Revisa el diagnóstico de próximos 7 días.'};
   // Use the customer's local day, not UTC midnight, for a single daily bulletin.
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
   // SQL unique day: one bulletin per day even across Railway replicas.
   const [claim]=await conn.execute("INSERT IGNORE INTO nforce_vip_radar_dispatches(dispatch_day,status) VALUES (?, 'reserved')",[day]);
   if(Number(claim.affectedRows)!==1){
    const [[previous]]=await conn.execute('SELECT status,sent_at,telegram_message_id,private_failure_kind,recovery_attempts,public_status FROM nforce_vip_radar_dispatches WHERE dispatch_day=? LIMIT 1',[day]);
    if(previous?.status==='sent')return {sent:false,already_sent:true,day,reason:'El boletín VIP de hoy ya fue confirmado por Telegram. No se duplica.',public_status:previous.public_status||'pending'};
    if(!['reserved','failed'].includes(previous?.status))return {sent:false,day,reason:'Ya existe un intento de hoy. Revisa el estado del canal VIP.'};
    const attempts=Number(previous.recovery_attempts||0);
    // A confirmed Telegram API rejection is safe to retry; a network timeout
    // or an old v3.7.4 failure is ambiguous and requires owner confirmation.
    const requiresConfirmation=previous.status==='reserved'||previous.private_failure_kind!=='rejected';
    if(attempts>=1)return {sent:false,day,reason:'Ya se utilizó la recuperación de hoy. Comprueba los mensajes y el error en Railway.'};
    if(requiresConfirmation&&!manual)return {sent:false,day,reason:'Falló el intento anterior. Requiere confirmación manual de que NO llegó a VIP.'};
    if(requiresConfirmation&&!confirmUnsent)return {sent:false,day,needs_confirmation:true,reason:'El intento anterior falló y no sabemos si Telegram lo entregó. Revisa el canal VIP: solo confirma el reintento si NO aparece allí.'};
    const [retry]=await conn.execute("UPDATE nforce_vip_radar_dispatches SET status='reserved',private_failure_kind=NULL,recovery_attempts=recovery_attempts+1 WHERE dispatch_day=? AND status IN ('failed','reserved') AND sent_at IS NULL AND telegram_message_id IS NULL AND recovery_attempts<1",[day]);
    if(Number(retry.affectedRows)!==1)return {sent:false,day,reason:'No se pudo reservar un reintento sin riesgo de duplicación. Comprueba el canal VIP.'};
   }
   let sent;
   try{
    const message=vipRadarTelegramMessage(report,{asOf:now()});
    sent=await sendRadarTelegram(target,message,process.env);
   }catch(error){
    const failureKind=error?.telegramRejected===true?'rejected':'unknown';
    await conn.execute("UPDATE nforce_vip_radar_dispatches SET status='failed',private_failure_kind=? WHERE dispatch_day=? AND status='reserved'",[failureKind,day]).catch(()=>{});
    return {sent:false,day,retryable:failureKind==='rejected',needs_confirmation:failureKind!=='rejected',reason:'Telegram no confirmó el boletín VIP: '+safeError(error)};
   }
   // Telegram returned success. Never mark as failed or re-send if logging fails.
   try{
    await conn.execute("UPDATE nforce_vip_radar_dispatches SET status='sent',sent_at=UTC_TIMESTAMP(),telegram_message_id=?,private_failure_kind=NULL WHERE dispatch_day=?",[sent?.message_id||null,day]);
   }catch(error){
    console.error('Boletín entregado, registro MySQL pendiente:',safeError(error));
    return {sent:true,day,items:Math.min(report.items.length,5),telegram_message_id:sent?.message_id||null,public_announcement:{state:'skipped',reason:'Entrega VIP confirmada. El registro MySQL falló; se omitió el adelanto para no duplicar publicaciones.'},warning:'Se envió a VIP, pero no se pudo guardar el registro en MySQL. No reintentes sin revisar el canal.'};
   }
   let publicAnnouncement;
   try{publicAnnouncement=await announceVipRadarOnOfficial(report,day,target,conn);}
   catch(error){console.error('Anuncio Radar VIP:',safeError(error));publicAnnouncement={state:'failed',reason:'No se pudo registrar el adelanto oficial; el boletín VIP sí se envió.'};}
   return {sent:true,day,items:Math.min(report.items.length,5),telegram_message_id:sent?.message_id||null,official_picks:false,public_announcement:publicAnnouncement};
  });}finally{radarSending=false;}
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
   const [[live]]=await conn.execute('SELECT m.competition,COALESCE(s.kickoff,m.kickoff) AS kickoff,m.home_goals,m.away_goals,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE m.id=? LIMIT 1',[row.fixture_id]);
   const sourceCheck=nforceSourceReadiness(live,fixture.kickoff,{now:now(),
    requireLive:independentScheduleCoverage({competition:fixture.competition,kickoff:fixture.kickoff},{now:now()}).required});
   if(!sourceCheck.ready){
    await conn.rollback();return {refreshed:false,reason:sourceCheck.message,code:sourceCheck.code,action:sourceCheck.action};
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
   const [[liveSource]]=await conn.execute('SELECT m.competition,COALESCE(s.kickoff,m.kickoff) AS kickoff,m.home_goals,m.away_goals,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE m.id=? LIMIT 1',[row.fixture_id]);
   const sourceCheck=nforceSourceReadiness(liveSource,row.kickoff,{now:now(),
    requireLive:independentScheduleCoverage(liveSource,{now:now()}).required});
   if(!sourceCheck.ready)throw Error(sourceCheck.message);
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
    if(!validated||validated.model_version!==MODEL_VERSION||Number(validated.evaluated)<VIP_POLICY.minOverall||!validated.created_at||now().getTime()-asUtc(validated.created_at).getTime()>8*DAY){await conn.rollback();return {published:false,reason:'Se necesita backtesting vigente'};}
    const pick=reportLimited(row.evidence_json)?.pick;
    const evidence=reportLimited(row.evidence_json);
    const context=evidence?.model?.history_group==='selecciones'?'national':'club';
    const report=reportLimited(validated.metrics_json);
    const metric=report?.by_context?.[context]?.by_market?.[pick?.key]||
     (context==='club'?report?.by_market?.[pick?.key]:null);
    if(Number(metric?.evaluated||0)<VIP_POLICY.minMarket){await conn.rollback();return {published:false,reason:`El mercado no dispone de ${VIP_POLICY.minMarket} pruebas retrospectivas del mismo tipo de competición`};}
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
   const backtestReady=backtestRow?.model_version===MODEL_VERSION&&Number(backtestRow?.evaluated)>=VIP_POLICY.minOverall&&
    backtestRow?.created_at&&now().getTime()-asUtc(backtestRow.created_at).getTime()<=8*DAY;
   for(const row of rows){
    if(!canAutoPublishCandidate(row)){blocked++;continue;}
    const candidateEvidence=reportLimited(row.evidence_json),context=candidateEvidence?.model?.history_group==='selecciones'?'national':'club';
    const backtestReport=reportLimited(backtestRow?.metrics_json);
    const metric=backtestReport?.by_context?.[context]?.by_market?.[candidateEvidence?.pick?.key]||
     (context==='club'?backtestReport?.by_market?.[candidateEvidence?.pick?.key]:null);
    if(!backtestReady||Number(metric?.evaluated||0)<VIP_POLICY.minMarket){unvalidated++;continue;}
    if(row.visibility==='vip'&&!evaluateVipEvidence(row,backtestRow,{asOf:now()}).approved){unvalidated++;continue;}
    const ready=Boolean(process.env.TELEGRAM_BOT_TOKEN&&(row.visibility==='vip'?process.env.TELEGRAM_VIP_CHAT_ID:row.visibility==='gold'?true:freeTelegramDestination(process.env)));
    if(!ready){missingChannel++;continue;}
    try{const r=await publish(row.id,null,{automatic:true});if(r.published)published++;else if(r.reason==='Límite diario')limited++;}
    catch(e){failed++;lastError=safeError(e);}
    if(published>=3)break;
   }
   lastPublishReport={at:now().toISOString(),reviewed:rows.length,published,failed,missing_channel:missingChannel,blocked_by_filters:blocked,
    without_validation:unvalidated,daily_limit:limited,reason:published?null:unvalidated?`Falta backtesting vigente con al menos ${VIP_POLICY.minMarket} pruebas del mercado; ejecuta «Validar modelo».`:missingChannel?'Faltan token o chats de Telegram.':
     limited?'Límite diario alcanzado.':rows.length?'Borradores no aptos para publicación automática.':'No hay propuestas locales aptas.'};
   return lastPublishReport;
  });}finally{publishing=false;}
 }
 // Provider contract requires visible attribution when this optional source
 // is switched on. Never expose the API key; the public API reports credit only.
 app.get('/api/public/data-credit',async(_req,res)=>{
  try{
   const config=await readFootballDataSource(db);
   const active=config.enabled&&Boolean(process.env.FOOTBALL_DATA_ORG_KEY);
   res.set('Cache-Control','no-store').json({active,credit:active?'Football data provided by the Football-Data.org API':null});
  }catch(_){res.status(503).json({active:false,credit:null});}
 });
 // Persisted provider controls: only the owner may read or change them.
 app.get(api('sources'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const secondary=await readSecondarySource(db);
   const footballData=await readFootballDataSource(db);
   const wide=await readWideSource(db);
   res.json({api_football_wide:{...wide,name:'Calendario de cobertura ampliada · Fuente IV',configured:Boolean(process.env.FOOTBALL_API_KEY),plan:process.env.FOOTBALL_SCHEDULE_PLAN==='extended'?'extended':'free',competition_count:WIDE_SUPPORTED_COMPETITIONS.length,last_import:lastImportReport?.api_football_wide||null},football_data:{...footballData,name:'football-data.org',configured:Boolean(process.env.FOOTBALL_DATA_ORG_KEY),competition_count:Object.keys(FOOTBALL_DATA_COMPETITIONS).length,last_import:lastImportReport?.football_data||null},
    secondary:{...secondary,name:'TheSportsDB',competition_count:SECONDARY_COMPETITIONS.length,last_import:lastImportReport?.secondary||null},
    historical:{name:'Histórico deportivo',enabled:true,editable:false},
    live_schedule:{configured:process.env.FOOTBALL_SCHEDULE_LIVE==='true'&&Boolean(process.env.FOOTBALL_API_KEY),editable:false}});
  }catch(e){res.status(500).json({error:'No se pudo leer Fuentes deportivas: '+safeError(e)});}
 });
 app.post(api('sources/secondary'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!req.body||Object.keys(req.body).length!==1||typeof req.body.enabled!=='boolean')
   return res.status(400).json({error:'Envía únicamente enabled: true o false'});
  try{
   const result=await saveSecondarySource(db,{enabled:req.body.enabled,actorId:req.admin.id});
   res.json({...result,message:result.changed?`Calendario complementario ${result.enabled?'activado':'desactivado'}. El cambio se aplicará en la próxima importación.`:'La configuración ya estaba guardada.'});
  }catch(e){res.status(500).json({error:'No se pudo guardar el cambio: '+safeError(e)});}
 });
 app.post(api('sources/wide-calendar'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!req.body||Object.keys(req.body).length!==1||typeof req.body.enabled!=='boolean')
   return res.status(400).json({error:'Envía únicamente enabled: true o false'});
  try{
   const result=await saveWideSource(db,{enabled:req.body.enabled,actorId:req.admin.id});
   res.json({...result,configured:Boolean(process.env.FOOTBALL_API_KEY),plan:process.env.FOOTBALL_SCHEDULE_PLAN==='extended'?'extended':'free',
    message:result.changed?'Calendario amplio guardado. '+(process.env.FOOTBALL_API_KEY?'Importa datos para descubrir encuentros.':'Configura FOOTBALL_API_KEY en Railway para que funcione.'):'Sin cambios en el calendario amplio.'});
  }catch(e){res.status(500).json({error:'No se pudo guardar calendario amplio: '+safeError(e)});}
 });
 app.post(api('sources/football-data'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!req.body||Object.keys(req.body).length!==1||typeof req.body.enabled!=='boolean')
   return res.status(400).json({error:'Envía únicamente enabled: true o false'});
  try{
   const result=await saveFootballDataSource(db,{enabled:req.body.enabled,actorId:req.admin.id});
   res.json({...result,configured:Boolean(process.env.FOOTBALL_DATA_ORG_KEY),message:result.changed?'Configuración guardada. '+(process.env.FOOTBALL_DATA_ORG_KEY?'Importa datos para buscar partidos.':'Falta FOOTBALL_DATA_ORG_KEY en Railway; la fuente no podrá consultar partidos.'):'La configuración ya estaba guardada.'});
  }catch(e){res.status(500).json({error:'No se pudo guardar la fuente de calendario: '+safeError(e)});}
 });
 // Compare the real API response for tomorrow with our MySQL fixture catalog.
 // A short throttle and the SAME daily quota ledger as Source IV prevent abuse.
 // This is an owner-only read-only diagnostic; it never publishes anything.
 app.get(api('calendar-audit'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!process.env.FOOTBALL_API_KEY)return res.status(409).json({error:'No hay clave FOOTBALL_API_KEY configurada en Railway. Las páginas externas no son una API conectada.'});
  try{
   const [usage]=await db.query('SELECT COUNT(*) AS total FROM nforce_wide_calendar_requests WHERE requested_at>=UTC_DATE()');
   const dailyLimit=process.env.FOOTBALL_SCHEDULE_PLAN==='extended'?4:6;
   if(Number(usage[0]?.total||0)>=dailyLimit)return res.status(429).json({error:'Cuota diaria de consultas de calendario agotada. Vuelve a comprobar mañana.'});
   if(lastCoverageAuditAt&&now().getTime()-lastCoverageAuditAt<5*60000)
    return res.status(429).json({error:'Se consultó el proveedor hace menos de cinco minutos. Vuelve a comprobar después para evitar consumir consultas.'});
   await db.execute('INSERT INTO nforce_wide_calendar_requests(requested_at) VALUES (UTC_TIMESTAMP())');
   lastCoverageAuditAt=now().getTime();
   const [locals]=await db.query(`SELECT competition,home_team,away_team,match_date FROM nforce_matches
    WHERE match_date BETWEEN UTC_DATE() AND DATE_ADD(UTC_DATE(),INTERVAL 3 DAY) AND home_goals IS NULL LIMIT 2000`);
   const result=await fetchCalendarAudit({env:process.env,now:now(),locals});
   res.set('Cache-Control','no-store').json(result);
  }catch(error){res.status(503).json({error:'No se pudo consultar mañana en la API: '+safeError(error)});}
 });
 // Preview of the calendar actually present in MySQL, not external fixtures
 // advertised by a web page. Owner-only; never treats discovery as verified NS.
 app.get(api('fixtures'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.query(`SELECT m.id,m.competition,m.league,m.home_team,m.away_team,
    m.match_date,COALESCE(s.kickoff,m.kickoff) AS kickoff,m.scheduled_time_known,m.source_path,
    m.source_checked_at,s.status AS verified_status,s.checked_at AS verified_at
    FROM nforce_matches m LEFT JOIN nforce_fixture_schedules s
      ON s.nforce_match_id=m.id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 4 HOUR)
    WHERE m.home_goals IS NULL AND m.away_goals IS NULL
      AND m.match_date BETWEEN UTC_DATE() AND DATE_ADD(UTC_DATE(),INTERVAL 30 DAY)
    ORDER BY COALESCE(m.kickoff,CONCAT(m.match_date,' 23:59:59')) ASC LIMIT 80`);
   res.json({total_returned:rows.length,limit:80,fixtures:rows.map(r=>({
    id:String(r.id),competition:r.competition,league:r.league,
    home_team:r.home_team,away_team:r.away_team,
    match_date:r.match_date, kick_off:r.kickoff, scheduled_time_known:Boolean(r.scheduled_time_known),
    source:String(r.source_path||'').startsWith('verified/')?'verificador':r.source_path==='secondary/thesportsdb'?'complementaria':r.source_path==='secondary/football-data-org'?'football-data':r.source_path==='secondary/api-football-wide'?'wide-calendar':'histórico',
    source_checked_at:r.source_checked_at,
    // This status is informational, never inferred from an unverified discovery feed.
    verified_status:r.verified_status||null,verified_at:r.verified_at||null
   }))});
  }catch(e){res.status(500).json({error:'No se pudo consultar el calendario importado: '+safeError(e)});}
 });
 // Owner-only ML comparison, separate from candidates and publication. Only
 // trained historical models with a chronological holdout are labelled as AI.
 app.get(api('ai-forecasts'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [[saved]]=await db.query('SELECT model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   const metrics=reportLimited(saved?.metrics_json);
   const current=saved?.model_version===MODEL_VERSION&&
    now().getTime()-asUtc(saved.created_at).getTime()<=8*DAY;
   const models=current?(metrics.ai_models||{}):{};
   const all=await loadMatches(),t=now().getTime(),historical=all.filter(fulltime);
   const future=all.filter(m=>m.scheduled_time_known&&m.kickoff&&m.home_goals==null&&m.away_goals==null&&
      (!m.live_status||m.live_status==='NS')&&Date.parse(m.kickoff)>t+VIP_RADAR_MIN_LEAD_HOURS*3600000&&Date.parse(m.kickoff)<=t+VIP_RADAR_MAX_DAYS*DAY)
    .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)).slice(0,160);
   const predictions=[];let missingHistory=0;
   for(const fixture of future){
    const forecast=estimateMatch(fixture,historical,Date.parse(fixture.kickoff));
    if(!forecast){missingHistory++;continue;}
    const context=forecast.history_group==='selecciones'?'national':'club';
    const learned=predictAiForecast(forecast,models[context]);
    predictions.push({match:`${fixture.home} vs ${fixture.away}`,competition:fixture.league||fixture.competition,
     kickoff:fixture.kickoff,context,quality:forecast.quality,illustrative_score:forecast.score,
     poisson:forecast.probabilities,ai:learned,verified_live:Boolean(fixture.schedule_verified_at&&fixture.live_status==='NS')});
    if(predictions.length>=30)break;
   }
   const nearReport=prepareVipRadar(all,{now:now(),models,limit:8});
   const safeModel=part=>part?{status:part.status,available:part.available,required:part.required,
    training:part.training,holdout:part.holdout,holdout_baseline_brier:part.holdout_baseline_brier,
    holdout_ai_brier:part.holdout_ai_brier,holdout_hybrid_brier:part.holdout_hybrid_brier,
    holdout_delta:part.holdout_delta}:null;
   res.json({version:AI_MODEL_VERSION,poisson_version:MODEL_VERSION,validated_backtest:current,
    models:{club:safeModel(models.club),national:safeModel(models.national)},
    future_examined:future.length,missing_history:missingHistory,forecasts:predictions,from_hours:VIP_RADAR_MIN_LEAD_HOURS,lookahead_days:VIP_RADAR_MAX_DAYS,
    near_term:nearReport.near_term,watchlist:nearReport.watchlist,
    publication_authorized:false,
    message:!current||!metrics.ai_models?'Ejecuta Validar modelo (backtest) para entrenar la IA con resultados reales.':
     'Predicciones exploratorias 1X2. Ni la IA ni el híbrido autorizan publicar sin los filtros habituales.'});
  }catch(e){res.status(500).json({error:'No se pudo comparar la IA: '+safeError(e)});}
 });

 app.get(api('vip-radar'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.set('Cache-Control','no-store').json({...await vipRadarPreview(),enabled:await vipRadarEnabled(),last:await vipRadarLast()});}
  catch(error){res.status(500).json({error:'Radar VIP: '+safeError(error)});}
 });
 app.post(api('vip-radar/settings'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'enabled debe ser booleano'});
  try{
   await db.execute(`INSERT INTO nforce_source_settings (source_id,enabled,updated_by,updated_at)
    VALUES ('vipradar',?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,[req.body.enabled?1:0,req.admin.id]);
   await db.execute("INSERT INTO audit_logs (actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'nforce_vip_radar_settings','nforce_source_settings','vipradar',?)",[req.admin.id,JSON.stringify({enabled:req.body.enabled})]);
   res.json({enabled:req.body.enabled});
  }catch(error){res.status(500).json({error:'No se pudo guardar la preferencia: '+safeError(error)});}
 });
 app.post(api('vip-radar/send'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await dispatchVipRadar({manual:true,confirmUnsent:req.body?.confirm_unsent===true}));}
  catch(error){res.status(500).json({error:'No fue posible enviar el radar: '+safeError(error)});}
 });
 // Read-only VIP diagnostics. Strictly for the owner; never approves or invents a pick.
 app.get(api('vip-diagnostic'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [[totals]]=await db.query(`SELECT
    SUM(visibility='vip' AND status='draft') AS vip_drafts,
    SUM(visibility='vip' AND status='published') AS vip_published,
    SUM(visibility='gold' AND status='draft') AS gold_drafts,
    SUM(status='draft') AS total_drafts
    FROM football_candidates WHERE provider=?`,[NFORCE_PROVIDER]);
   const [rows]=await db.query(`SELECT id,home_team,away_team,market,visibility,status,
    provider,provider_probability,selection,evidence_json,kickoff
    FROM football_candidates WHERE provider=? AND visibility='vip' AND status='draft'
    ORDER BY id DESC LIMIT 250`,[NFORCE_PROVIDER]);
   const [[validation]]=await db.query('SELECT created_at,evaluated,model_version,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   res.set('Cache-Control','no-store').json(summarizeVipDatabase({rows,total:totals||{},validation,
    scan:lastScanReport,asOf:now(),telegramReady:Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID)}));
  }catch(e){res.status(500).json({error:'No se pudo consultar el diagnóstico VIP: '+safeError(e)});}
 });
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
    (SELECT COUNT(DISTINCT competition) FROM nforce_matches WHERE competition LIKE 'int.%') AS loaded_national_competitions,
    (SELECT COUNT(*) FROM nforce_matches WHERE competition LIKE 'int.%') AS national_matches,
    (SELECT COUNT(*) FROM nforce_matches WHERE source_path='secondary/thesportsdb') AS secondary_fixtures,
    (SELECT COUNT(*) FROM nforce_matches WHERE source_path='secondary/football-data-org') AS football_data_fixtures,
    (SELECT COUNT(*) FROM nforce_matches WHERE source_path='secondary/api-football-wide') AS wide_fixtures,
    (SELECT COUNT(*) FROM nforce_matches WHERE source_path='verified/domestic-fixtures') AS verified_club_fixtures,
    (SELECT COUNT(*) FROM nforce_matches WHERE home_goals IS NOT NULL) AS complete_matches`);
   const [[latest]]=await db.query('SELECT status,initiated_by,started_at,finished_at,error_message,upcoming AS examined,drafts AS drafts_created,insufficient AS without_prediction,filtered AS below_filters FROM nforce_scans ORDER BY id DESC LIMIT 1');
   const [[lastImport]]=await db.query('SELECT status,started_at,finished_at,sources,records,scheduled,completed_results,errors_json FROM nforce_import_runs ORDER BY id DESC LIMIT 1');
   const [[lastBacktest]]=await db.query('SELECT created_at,evaluated,accuracy,brier,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   const validation=reportLimited(lastBacktest?.metrics_json);const decided=Number(stats.won||0)+Number(stats.lost||0);
   const retry=importDecision(lastImport,now().getTime());
   const calendar_diagnostic=diagnoseNforceCalendar(await loadMatches(),{now:now(),days:NFORCE_SCAN_LOOKAHEAD_DAYS});
   const secondaryConfig=await readSecondarySource(db);
   const footballDataConfig=await readFootballDataSource(db);
   const wideConfig=await readWideSource(db);
   res.json({calendar_diagnostic,engine:'N-FORCE',model_version:MODEL_VERSION,configured:true,auto_import:process.env.FOOTBALL_AUTO_IMPORT!=='false',
    scan_lookahead_days:NFORCE_SCAN_LOOKAHEAD_DAYS,scan_fixture_limit:NFORCE_SCAN_FIXTURE_LIMIT,
    auto_scan:process.env.FOOTBALL_AUTO_SCAN==='true',auto_publish:process.env.FOOTBALL_AUTO_PUBLISH==='true'&&process.env.NFORCE_LIVE_RELEASE_ACK==='true',
    automatic_free_promoted_to_gold:true,gold_distribution_rollout:GOLD_ROLLOUT,free_public_full:true,telegram_free_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&freeTelegramDestination(process.env)),telegram_vip_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID),
    drafts:Number(stats.drafts||0),published:Number(stats.published||0),won:Number(stats.won||0),lost:Number(stats.lost||0),accuracy:decided?Number((100*stats.won/decided).toFixed(1)):null,
    latest:latest||null,scanning,importing,publishing,last_error:lastError,last_import_report:lastImportReport,last_scan_report:lastScanReport,
    vip_policy:VIP_POLICY,vip_risk_policy:VIP_RISK_POLICY,vip_radar:{enabled:await vipRadarEnabled(),last:await vipRadarLast(),sending:radarSending},last_publish_report:lastPublishReport,last_scheduler_message:lastSchedulerMessage,scheduled_retry_at:latest?new Date(asUtc(latest.started_at).getTime()+SCAN_INTERVAL_MINUTES*60000).toISOString():null,
    scheduled_retry_reason:'Control local cada hora',manual_scan:{available:!scanning,remaining:'Ilimitados con pausa de 5 min',daily_limit:'—'},
    configured_competitions:LEAGUES.length+NATIONAL_COMPETITIONS.length,national_competitions_configured:NATIONAL_COMPETITIONS.length,live_schedule_supported_competitions:LIVE_VERIFICATION_LEAGUES.length,loaded_competitions:Number(stats.loaded_competitions||0),loaded_national_competitions:Number(stats.loaded_national_competitions||0),national_matches:Number(stats.national_matches||0),
    total_matches:Number(stats.total_matches||0),complete_matches:Number(stats.complete_matches||0),source_import:lastImport||null,next_import_at:retry.next,
    football_data_enabled:footballDataConfig.enabled,football_data_configured:Boolean(process.env.FOOTBALL_DATA_ORG_KEY),football_data_fixtures:Number(stats.football_data_fixtures||0),
    wide_enabled:wideConfig.enabled,wide_configured:Boolean(process.env.FOOTBALL_API_KEY),wide_fixtures:Number(stats.wide_fixtures||0),
    secondary_enabled:secondaryConfig.enabled,secondary_competitions:SECONDARY_COMPETITIONS.length,secondary_fixtures:Number(stats.secondary_fixtures||0),verified_club_fixtures:Number(stats.verified_club_fixtures||0),
    settlement:settlement.getStatus(),
    backtest:lastBacktest?{evaluated:lastBacktest.evaluated,accuracy:lastBacktest.accuracy,brier:lastBacktest.brier,validated:Number(lastBacktest.evaluated)>=VIP_POLICY.minOverall&&validation.model===MODEL_VERSION&&now().getTime()-asUtc(lastBacktest.created_at).getTime()<=8*DAY,
    model_version:validation.model,segments:validation.segments||null,by_market:validation.by_market||null,by_context:validation.by_context||null,calibration:validation.calibration||null,comparison_previous:validation.comparison_previous||null}:null});
  }catch(e){res.status(500).json({error:'No se pudo consultar N-FORCE: '+safeError(e)});}
 });
 app.get(api('candidates'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.query(`SELECT c.id,c.fixture_id,c.visibility,c.home_team,c.away_team,c.league,COALESCE(s.kickoff,m.kickoff,c.kickoff) AS kickoff,c.kickoff AS candidate_kickoff,c.market,c.selection,c.provider_probability,c.odds,c.analysis,c.evidence_json,c.status,c.prediction_id,c.created_at,m.competition,m.home_goals,m.away_goals,m.source_checked_at,s.status AS live_status,s.checked_at AS schedule_verified_at FROM football_candidates c LEFT JOIN nforce_matches m ON m.id=c.fixture_id LEFT JOIN nforce_fixture_schedules s ON s.nforce_match_id=c.fixture_id AND s.checked_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 12 HOUR) WHERE c.provider=? AND c.status='draft' ORDER BY c.id DESC LIMIT 40`,[NFORCE_PROVIDER]);
   const [[validation]]=await db.query('SELECT evaluated,model_version,created_at,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   res.json({candidates:rows.map(row=>{const ev=reportLimited(row.evidence_json);const {evidence_json,...r}=row;
    const source_readiness=nforceSourceReadiness(row,row.candidate_kickoff,{now:now(),
     requireLive:independentScheduleCoverage(row,{now:now()}).required});
    const schedule_changed=source_readiness.code==='schedule_changed';
    return {...r,analysis:publicAnalysisText(row.analysis),goal_projection:ev.goals||null,match_context:ev.match_context||null,own_model:ev.model||null,advanced:null,source_readiness,
      needs_refresh:row.status==='draft'&&(ev.model?.model!==MODEL_VERSION||schedule_changed||shouldBlockLegacyFreeDraft(row)),
      schedule_changed,
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
 // One-click owner workflow. Do not start the scan until the importer has
 // finished, avoiding misleading zero-candidate scans on an empty calendar.
 app.post(api('import-scan'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(combinedRunning||importing||scanning)return res.status(409).json({error:'Hay una importación o búsqueda en curso'});
  combinedRunning=true;
  (async()=>{
   try{
    const imported=await importData({force:true});
    if(imported?.busy)throw Error('Importación ocupada por otra instancia');
    const result=await scan({manual:true,days:NFORCE_SCAN_LOOKAHEAD_DAYS});
    if(result?.busy||result?.cooldown)lastSchedulerMessage='No se ejecutó el análisis automático posterior: '+(result.message||'pausa de seguridad');
    else lastSchedulerMessage='Importación y análisis del propietario finalizados';
   }catch(e){lastError=safeError(e);console.warn('nforce combined import/scan:',lastError);}
   finally{combinedRunning=false;}
  })();
  res.status(202).json({accepted:true,message:'Búsqueda de partidos iniciada. El análisis comenzará cuando termine la importación; consulta «Análisis automático» para ver los resultados.'});
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
  const days=Number(req.body?.days??NFORCE_SCAN_LOOKAHEAD_DAYS);
  if(!Number.isInteger(days)||days<3||days>30)return res.status(400).json({error:'Selecciona 7, 14, 21 o 30 días'});
  scan({manual:true,days}).catch(e=>{lastScanReport={ok:false,error:safeError(e)};});
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
      (Number(b.evaluated||0)<VIP_POLICY.minOverall&&now().getTime()-asUtc(b.created_at).getTime()>12*3600000)){
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
  // Once per UTC day after 14:00 (09:00 in Peru); opt-in persisted in MySQL.
  // Never creates an official VIP pick; no message if there are no eligible matches.
  if(now().getUTCHours()>=14&&now().getUTCHours()<23&&now().getTime()-lastAutoRadarAttempt>=2*3600000){
   lastAutoRadarAttempt=now().getTime();
   await dispatchVipRadar().catch(e=>{lastError='Radar VIP: '+safeError(e);});
  }
 }
 function start(){if(interval)return;
  interval=setInterval(tick,15*60000);interval.unref?.();setImmediate(()=>tick().catch(e=>console.error('nforce scheduler:',safeError(e))));
 }
 return {importData,scan,backtest,publish,refreshCandidate,publishPending,settle:settlement.run,tick,start,stop:()=>{if(interval)clearInterval(interval);interval=null;}};
}
