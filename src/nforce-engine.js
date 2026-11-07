import {allowedDatasets,fetchOpenFootball,NFORCE_PROVIDER} from './nforce-data.js';
import {estimateMatch,modelReadiness,makeCandidate,walkForwardBacktest,fulltime,MODEL_VERSION} from './nforce-model.js';
import {canAutoPublishCandidate} from './football-publication-policy.js';
import {sendPredictionToTelegram} from './telegram-bridge.js';
import {publishedFootballDetails} from './football-report.js';
import {createNforceSettlement} from './nforce-settlement.js';

const DAY=86400000;
const asUtc=x=>x instanceof Date?x:new Date(String(x||'').replace(' ','T')+(String(x||'').match(/Z|[+-]\d\d:\d\d$/)?'':'Z'));
const sqlUtc=x=>asUtc(x).toISOString().slice(0,19).replace('T',' ');
const validId=x=>/^\d{1,18}$/.test(String(x));
const safeError=e=>String(e?.message||e).replace(/(sk_live_|sk_test_|pk_live_|pk_test_)[^\s]+/g,'[redacted]').slice(0,180);
const reportLimited=e=>{try{return typeof e==='string'?JSON.parse(e):e||{};}catch{return {};}};
const owner=req=>req.admin?.role==='owner';
export const IMPORT_INTERVAL_HOURS=2;
export const SCAN_INTERVAL_MINUTES=60;

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
   const id=created.insertId,errors=[];let imported=0,sources=0,scheduled=0,completed=0;
   for(const dataset of allowedDatasets(now())){
    try{
     const records=await fetchDataset(dataset);
     if(!Array.isArray(records)||!records.length)throw Error('Sin registros válidos');
     sources++;
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
     imported+=records.length;scheduled+=records.filter(x=>x.kickoff&&x.home_goals===null).length;
     completed+=records.filter(x=>x.home_goals!==null).length;
    }catch(e){errors.push(`${dataset.path}: ${safeError(e)}`);}
   }
   const status=sources?'completed':'failed';
   await conn.execute('UPDATE nforce_import_runs SET status=?,finished_at=UTC_TIMESTAMP(),sources=?,records=?,scheduled=?,completed_results=?,errors_json=? WHERE id=?',
    [status,sources,imported,scheduled,completed,JSON.stringify(errors).slice(0,3900),id]);
   lastImportReport={ok:sources>0,status,sources,records:imported,scheduled,completed,failed_sources:errors.length,errors:errors.slice(0,5),
    warning:errors.length?'Importación parcial: verifica las fuentes que fallaron.':'Los archivos pueden contener calendarios desactualizados; verifica horarios antes de apostar.'};
   if(!sources)lastError='Fallaron todas las fuentes OpenFootball';
   return lastImportReport;
  });}finally{importing=false;}
 }
 async function loadMatches(){
  // bounded season set; no API requests per match.
  const [rows]=await db.query('SELECT id,source_key,competition,league,season,round_name AS `round`,home_team AS home,away_team AS away,match_date AS date_label,kickoff,scheduled_time_known,home_goals,away_goals,source_path,source_checked_at FROM nforce_matches WHERE match_date>=DATE_SUB(UTC_DATE(),INTERVAL 560 DAY) ORDER BY match_date ASC LIMIT 6500');
  return rows.map(r=>({...r,date:r.date_label instanceof Date?r.date_label.toISOString().slice(0,10):String(r.date_label).slice(0,10),
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
    const future=all.filter(x=>x.scheduled_time_known&&x.kickoff&&x.home_goals===null&&Date.parse(x.kickoff)>time+60*60000&&Date.parse(x.kickoff)<time+72*3600000)
     .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)).slice(0,120);
    let models=0,drafts=0,underMin=0,rejected=0;const examples=[];const missingReasons={};
    for(const m of future){
     const model=estimateMatch(m,usable,Date.parse(m.kickoff));
     if(!model){underMin++;const why=modelReadiness(m,usable,Date.parse(m.kickoff));missingReasons[why.reason]=(missingReasons[why.reason]||0)+1;if(examples.length<4)examples.push(`${m.home} vs ${m.away}: ${why.reason} (liga ${why.sample?.league||0}, local ${why.sample?.home||0}, visita ${why.sample?.away||0})`);continue;}
     models++;
     const candidate=makeCandidate(m,model);
     if(!candidate){rejected++;continue;}
     const [r]=await conn.execute(`INSERT IGNORE INTO football_candidates
      (provider,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,[
      candidate.provider,candidate.fixture_id,candidate.visibility,candidate.home_team,candidate.away_team,candidate.league,
      candidate.kickoff,candidate.market,candidate.selection,candidate.provider_probability,null,candidate.analysis,candidate.evidence_json]);
     if(!Number(r.affectedRows||0)){
      // A v3.0 draft or rescheduled fixture must be refreshed before publishing.
      // Never revive discarded proposals or mutate already-published picks.
      await conn.execute(`UPDATE football_candidates SET visibility=?,home_team=?,away_team=?,league=?,kickoff=?,
       market=?,selection=?,provider_probability=?,odds=NULL,analysis=?,evidence_json=?
       WHERE provider=? AND fixture_id=? AND status='draft'`,[
       candidate.visibility,candidate.home_team,candidate.away_team,candidate.league,candidate.kickoff,
       candidate.market,candidate.selection,candidate.provider_probability,candidate.analysis,candidate.evidence_json,
       candidate.provider,candidate.fixture_id]);
     }
     drafts+=Number(r.affectedRows||0);
    }
    await conn.execute('UPDATE nforce_scans SET status=?,finished_at=UTC_TIMESTAMP(),upcoming=?,modeled=?,drafts=?,insufficient=?,filtered=? WHERE id=?',
     ['completed',future.length,models,drafts,underMin,rejected,id]);
    lastError='';lastScanReport={ok:true,mode:manual?'manual':'scheduled',fixtures_in_window:future.length,examined:future.length,
     modeled:models,drafts_created:drafts,insufficient_history:underMin,insufficient_reasons:missingReasons,below_filters:rejected,rejection_examples:examples,
     fixtures_without_time:all.filter(x=>x.home_goals===null&&!x.scheduled_time_known&&x.date>=now().toISOString().slice(0,10)).length,
     note_on_quality:'El indicador de calidad de muestra NO representa el porcentaje real de aciertos.',
     note:drafts?`${drafts} propuestas guardadas; la publicación depende de las reglas y de Telegram.`:future.length===0?
      'No hay partidos con horario válido en las próximas 72 horas. La fuente puede estar desactualizada o los partidos carecer de hora.':
      'Sin propuestas nuevas: faltan datos suficientes o ningún pronóstico superó los filtros. No se inventaron fijas.'};
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
 async function publish(id,admin,{automatic=false}={}){
  if(!validId(id))throw Error('ID inválido');
  const conn=await db.getConnection();let row,recordId;
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute('SELECT * FROM football_candidates WHERE id=? FOR UPDATE',[id]);row=rows[0];
   if(!row||row.provider!==NFORCE_PROVIDER||row.status!=='draft'){await conn.rollback();return {published:false,reason:'Ya procesado o ajeno al motor local'};}
   if(reportLimited(row.evidence_json)?.model?.model!==MODEL_VERSION)throw Error('La propuesta pertenece a una versión anterior del modelo. Analiza de nuevo antes de publicarla.');
   const kickoff=asUtc(row.kickoff);
   if(!Number.isFinite(kickoff.getTime())||kickoff.getTime()<now().getTime()+20*60000)throw Error('El partido comenzó o empieza demasiado pronto');
   // Source may have rescheduled or completed this fixture after the candidate
   // was created. Never publish stale proposals as if the calendar were live.
   const [[liveSource]]=await conn.execute('SELECT kickoff,home_goals,away_goals,source_checked_at FROM nforce_matches WHERE id=? LIMIT 1',[row.fixture_id]);
   if(!liveSource||liveSource.home_goals!==null||liveSource.away_goals!==null||!liveSource.kickoff||
      Math.abs(asUtc(liveSource.kickoff).getTime()-kickoff.getTime())>60000||
      now().getTime()-asUtc(liveSource.source_checked_at).getTime()>36*3600000){
    throw Error('Calendario o resultado desactualizado; importa datos y genera una nueva propuesta antes de publicar');
   }
   const [existingMatch]=await conn.execute(`SELECT p.id FROM predictions p
      WHERE p.title=? AND p.archived_at IS NULL AND ABS(TIMESTAMPDIFF(MINUTE,p.match_date,?))<=180 LIMIT 1`,
      [`${row.home_team} vs ${row.away_team}`.slice(0,200),row.kickoff]);
   if(existingMatch.length){await conn.rollback();return {published:false,reason:'Encuentro ya publicado previamente'};}

   if(automatic){
    if(!canAutoPublishCandidate(row))throw Error('Evidencias insuficientes para autopublicación');
    const [[validated]]=await conn.query('SELECT evaluated,model_version,created_at FROM nforce_backtests ORDER BY id DESC LIMIT 1');
    if(!validated||validated.model_version!==MODEL_VERSION||Number(validated.evaluated)<40||!validated.created_at||now().getTime()-asUtc(validated.created_at).getTime()>8*DAY){await conn.rollback();return {published:false,reason:'Se necesita backtesting de al menos 40 partidos históricos'};}
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
   const [[backtestRow]]=await db.query('SELECT evaluated,model_version,created_at FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   const backtestReady=backtestRow?.model_version===MODEL_VERSION&&Number(backtestRow?.evaluated)>=40&&
    backtestRow?.created_at&&now().getTime()-asUtc(backtestRow.created_at).getTime()<=8*DAY;
   for(const row of rows){
    if(!canAutoPublishCandidate(row)){blocked++;continue;}
    if(!backtestReady){unvalidated++;continue;}
    const ready=Boolean(process.env.TELEGRAM_BOT_TOKEN&&(row.visibility==='vip'?process.env.TELEGRAM_VIP_CHAT_ID:process.env.TELEGRAM_FREE_CHAT_ID));
    if(!ready){missingChannel++;continue;}
    try{const r=await publish(row.id,null,{automatic:true});if(r.published)published++;else if(r.reason==='Límite diario')limited++;}
    catch(e){failed++;lastError=safeError(e);}
    if(published>=3)break;
   }
   lastPublishReport={at:now().toISOString(),reviewed:rows.length,published,failed,missing_channel:missingChannel,blocked_by_filters:blocked,
    without_validation:unvalidated,daily_limit:limited,reason:published?null:unvalidated?'Falta backtesting vigente de este modelo (mínimo 40 partidos); ejecuta «Validar modelo».':missingChannel?'Faltan token o chats de Telegram.':
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
    (SELECT COUNT(*) FROM nforce_matches WHERE home_goals IS NOT NULL) AS complete_matches`);
   const [[latest]]=await db.query('SELECT status,initiated_by,started_at,finished_at,error_message,upcoming AS examined,drafts AS drafts_created,insufficient AS without_prediction,filtered AS below_filters FROM nforce_scans ORDER BY id DESC LIMIT 1');
   const [[lastImport]]=await db.query('SELECT status,started_at,finished_at,sources,records,scheduled,completed_results,errors_json FROM nforce_import_runs ORDER BY id DESC LIMIT 1');
   const [[lastBacktest]]=await db.query('SELECT created_at,evaluated,accuracy,brier,metrics_json FROM nforce_backtests ORDER BY id DESC LIMIT 1');
   const validation=reportLimited(lastBacktest?.metrics_json);const decided=Number(stats.won||0)+Number(stats.lost||0);
   const retry=importDecision(lastImport,now().getTime());
   res.json({engine:'N-FORCE Football Intelligence',model_version:MODEL_VERSION,configured:true,auto_import:process.env.FOOTBALL_AUTO_IMPORT!=='false',
    auto_scan:process.env.FOOTBALL_AUTO_SCAN==='true',auto_publish:process.env.FOOTBALL_AUTO_PUBLISH==='true'&&process.env.NFORCE_LIVE_RELEASE_ACK==='true',
    free_public_full:true,telegram_free_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_FREE_CHAT_ID),telegram_vip_ready:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_VIP_CHAT_ID),
    drafts:Number(stats.drafts||0),published:Number(stats.published||0),won:Number(stats.won||0),lost:Number(stats.lost||0),accuracy:decided?Number((100*stats.won/decided).toFixed(1)):null,
    latest:latest||null,scanning,importing,publishing,last_error:lastError,last_import_report:lastImportReport,last_scan_report:lastScanReport,
    last_publish_report:lastPublishReport,last_scheduler_message:lastSchedulerMessage,scheduled_retry_at:latest?new Date(asUtc(latest.started_at).getTime()+SCAN_INTERVAL_MINUTES*60000).toISOString():null,
    scheduled_retry_reason:'Control local cada hora',manual_scan:{available:!scanning,remaining:'Ilimitados con pausa de 5 min',daily_limit:'—'},
    total_matches:Number(stats.total_matches||0),complete_matches:Number(stats.complete_matches||0),source_import:lastImport||null,next_import_at:retry.next,
    settlement:settlement.getStatus(),
    backtest:lastBacktest?{evaluated:lastBacktest.evaluated,accuracy:lastBacktest.accuracy,brier:lastBacktest.brier,validated:Number(lastBacktest.evaluated)>=40&&validation.model===MODEL_VERSION&&now().getTime()-asUtc(lastBacktest.created_at).getTime()<=8*DAY,
    model_version:validation.model,segments:validation.segments||null,calibration:validation.calibration||null}:null});
  }catch(e){res.status(500).json({error:'No se pudo consultar N-FORCE: '+safeError(e)});}
 });
 app.get(api('candidates'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{
   const [rows]=await db.query(`SELECT id,fixture_id,visibility,home_team,away_team,league,kickoff,market,selection,provider_probability,odds,analysis,evidence_json,status,prediction_id,created_at FROM football_candidates WHERE provider=? ORDER BY id DESC LIMIT 40`,[NFORCE_PROVIDER]);
   res.json({candidates:rows.map(row=>{const ev=reportLimited(row.evidence_json);const {evidence_json,...r}=row;
    return {...r,goal_projection:ev.goals||null,match_context:ev.match_context||null,own_model:ev.model||null,advanced:null};})});
  }catch(e){res.status(500).json({error:safeError(e)});}
 });
 app.post(api('import'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(importing)return res.status(409).json({error:'Importación en curso'});
  importData({force:true}).catch(e=>{lastError=safeError(e);console.warn('nforce manual import:',lastError);});
  res.status(202).json({accepted:true,message:'Importación de fuentes CC0 iniciada; consulta el estado para ver el resultado.'});
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
   const eligible=future.filter(m=>estimateMatch(m,usable,Date.parse(m.kickoff)));
   res.json({ok:true,api_connected:true,fixture_total:all.length,fixtures_in_window:future.length,examined:eligible.length,
    reason:future.length?`Partidos futuros con análisis estadístico: ${eligible.length} / ${future.length}. Sin resultados suficientes, no hay pronósticos.`:
      'Sin partidos futuros con hora conocida: importa datos y verifica si la fuente mantiene actualizado el calendario.',source:'OpenFootball JSON (CC0) · solo datos guardados en MySQL, sin API-Football'});
  }catch(e){res.status(500).json({error:safeError(e)});}
 });
 app.post(api('scan'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(scanning)return res.status(409).json({error:'Escaneo en curso'});
  scan({manual:true}).catch(e=>{lastScanReport={ok:false,error:safeError(e)};});
  res.status(202).json({accepted:true,message:'Análisis local iniciado. Actualiza el panel para revisar las propuestas.'});
 });
 app.post(api('candidates/:id/refresh-advanced'),authenticate,(req,res)=>{if(!owner(req))return res.status(403).json({error:'Solo creador'});return res.status(409).json({error:'El motor propio usa resultados históricos CC0; esta fuente no ofrece lesiones ni alineaciones. No se inventan.'});});
 app.post(api('candidates/:id/publish'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  try{res.json(await publish(req.params.id,req.admin));}catch(e){res.status(400).json({error:safeError(e)});}
 });
 app.post(api('candidates/:id/discard'),authenticate,async(req,res)=>{
  if(!owner(req))return res.status(403).json({error:'Solo creador'});
  if(!validId(req.params.id))return res.status(400).json({error:'ID inválido'});
  try{const [r]=await db.execute("UPDATE football_candidates SET status='discarded' WHERE provider=? AND id=? AND status='draft'",[NFORCE_PROVIDER,req.params.id]);
   if(!r.affectedRows)return res.status(409).json({error:'No se puede descartar esta propuesta'});
   await db.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id) VALUES (?,'football_candidate_discarded','football_candidate',?)",[req.admin.id,req.params.id]);
   res.json({ok:true});
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
 return {importData,scan,backtest,publish,publishPending,settle:settlement.run,tick,start,stop:()=>{if(interval)clearInterval(interval);interval=null;}};
}
