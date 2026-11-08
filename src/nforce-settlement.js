/**
 * N-FORCE Football Intelligence: automatic settlement against imported
 * OpenFootball CC0 full-time scores. Never guesses, never grades a match
 * without a stable fixture ID. User/admin-origin predictions are untouched.
 */
import {NFORCE_PROVIDER} from './nforce-data.js';

const twoHours=2*60*60*1000;
const fortyEightHours=48*60*60*1000;
const toMs=value=>{
 if(value instanceof Date)return value.getTime();
 if(value==null)return NaN;
 const s=String(value).trim();
 return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(s)?s:s.replace(' ','T')+'Z');
};
const normalize=x=>String(x??'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const validGoal=x=>x!==null&&x!==undefined&&x!==''&&typeof x!=='boolean'&&Number.isInteger(Number(x))&&Number(x)>=0&&Number(x)<=25;
/** Null means unsupported/ambiguous and MUST remain pending. */
export function evaluateFinalScore({market,selection,homeTeam,awayTeam,homeGoals,awayGoals}){
 if(!validGoal(homeGoals)||!validGoal(awayGoals))return null;
 const h=Number(homeGoals),a=Number(awayGoals),m=normalize(market),s=normalize(selection);
 if(!m||!s)return null;
 let won=null,rule=null;
 if(m==='1x2'||m.includes('resultado final 1x2')||m==='ganador del partido'){
  const result=h>a?'1':h<a?'2':'x';
  let choice=null;
  if(['1','x','2'].includes(s))choice=s;
  else if(['empate','draw'].includes(s))choice='x';
  else if(s===normalize(homeTeam)&&s!==normalize(awayTeam))choice='1';
  else if(s===normalize(awayTeam)&&s!==normalize(homeTeam))choice='2';
  if(!choice)return null;
  won=choice===result;rule='1x2';
 } else if(m==='doble oportunidad'||m==='double chance'){
  if(!['1x','x2','12'].includes(s))return null;
  won=s==='1x'?h>=a:s==='x2'?h<=a:h!==a;
  rule='double-chance';
 } else if(/(?:goles|goals|over|under|total)/.test(m)&&!/(?:individual|equipo|local|visita|visitante|home|away|mitad|tiempo)/.test(m)){
  const pick=s.match(/(?:\bmas de|\bover|\bmenos de|\bunder)\s*(\d{1,2}(?:[.,]\d)?)\b/);
  const line=pick||m.match(/(?:\bmas de|\bover|\bmenos de|\bunder)\s*(\d{1,2}(?:[.,]\d)?)\b/);
  if(!line)return null;
  // If selection explicitly names a line, it must match the market line.
  const marketLine=m.match(/(?:\bmas de|\bover|\bmenos de|\bunder)\s*(\d{1,2}(?:[.,]\d)?)\b/);
  if(pick&&marketLine&&(Number(pick[1].replace(',','.'))!==Number(marketLine[1].replace(',','.')) || /^(?:mas de|over)/.test(pick[0])!==/^(?:mas de|over)/.test(marketLine[0])))return null;
  const t=Number(line[1].replace(',','.'));if(t<0||t>12)return null;
  const over=/^(?:mas de|over)/.test(line[0]), total=h+a;
  if(Number.isInteger(t)&&total===t)return {outcome:'void',rule:'total-goals',score:`${h}-${a}`};
  won=over?total>t:total<t;rule='total-goals';
 } else if(/^(?:ambos marcan|both teams to score|btts)(?:\s|$)/.test(m)){
  let choice=null;
  if(/^(?:si|yes|ambos marcan|btts si|btts yes)$/.test(s))choice=true;
  else if(/^(?:no|ambos no marcan|btts no)$/.test(s))choice=false;
  if(choice===null)return null;
  won=((h>0&&a>0)===choice);rule='both-teams-score';
 } else return null;
 return {outcome:won?'won':'lost',rule,score:`${h}-${a}`};
}

/** A full-time score from the permitted CC0 source is required. Not official. */
export function eligibleResult(row,now=new Date()){
 const ms=now.getTime(),kick=toMs(row.kickoff),published=toMs(row.published_at),expected=toMs(row.match_date),checked=toMs(row.source_checked_at);
 return validGoal(row.home_goals)&&validGoal(row.away_goals)&&Boolean(row.scheduled_time_known)&&
  Number.isFinite(kick)&&Number.isFinite(published)&&Number.isFinite(expected)&&Number.isFinite(checked)&&
  ms>=kick+twoHours && published<=kick && Math.abs(expected-kick)<=5*60000 &&
  ms>=checked && ms-checked<=fortyEightHours &&
  row.outcome==='pending';
}

const summarizeError=e=>String(e?.message||e).slice(0,180);
export function createNforceSettlement({db,now=()=>new Date()}={}){
 let working=false,last=null;
 async function run(){
  if(working)return {busy:true};working=true;
  let conn,locked=false;
  const report={checked_at:now().toISOString(),reviewed:0,settled:0,won:0,lost:0,void:0,unsupported:0,invalid_source:0,skipped_changed:0,errors:0};
  try{
   conn=await db.getConnection();
   const [[lock]]=await conn.query("SELECT GET_LOCK('fijas_nforce_settlement',0) AS acquired");
   if(Number(lock?.acquired)!==1)return {busy:true};locked=true;
   // No selection/odds/analysis leak: this query stays private to the worker.
   const [rows]=await conn.execute(`SELECT p.id,p.outcome,p.published_at,p.match_date,p.market,p.selection,
      c.home_team AS homeTeam,c.away_team AS awayTeam,m.kickoff,m.scheduled_time_known,m.home_goals,m.away_goals,m.source_checked_at
      FROM football_candidates c JOIN predictions p ON p.id=c.prediction_id
      JOIN nforce_matches m ON m.id=c.fixture_id
      WHERE c.provider=? AND c.status='published' AND p.published_at IS NOT NULL AND p.outcome='pending'
        AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
      ORDER BY m.kickoff ASC LIMIT 250`,[NFORCE_PROVIDER]);
   report.reviewed=rows.length;
   for(const row of rows){
    if(!eligibleResult(row,now())){report.invalid_source++;continue;}
    const result=evaluateFinalScore({market:row.market,selection:row.selection,homeTeam:row.homeTeam,awayTeam:row.awayTeam,homeGoals:row.home_goals,awayGoals:row.away_goals});
    if(!result){report.unsupported++;continue;}
    try{
     await conn.beginTransaction();
     const [[current]]=await conn.execute('SELECT outcome,market,selection FROM predictions WHERE id=? FOR UPDATE',[row.id]);
     if(!current||current.outcome!=='pending'||current.market!==row.market||current.selection!==row.selection){
      await conn.rollback();report.skipped_changed++;continue;
     }
     const [updated]=await conn.execute("UPDATE predictions SET outcome=?,settlement_source=?,settlement_score=?,settled_at=UTC_TIMESTAMP() WHERE id=? AND outcome='pending'",[result.outcome,NFORCE_PROVIDER,result.score,row.id]);
     if(Number(updated.affectedRows)!==1){await conn.rollback();report.skipped_changed++;continue;}
     await conn.execute(`INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details)
      VALUES (NULL,'prediction_outcome_auto','prediction',?,JSON_OBJECT('previous','pending','outcome',?,'score',?,'rule',?,'source',?,'source_checked_at',?))`,
      [String(row.id),result.outcome,result.score,result.rule,'OpenFootball CC0 (no oficial)',row.source_checked_at]);
     await conn.commit();report.settled++;report[result.outcome]++;
    }catch(e){await conn.rollback().catch(()=>{});report.errors++;report.last_error=summarizeError(e);}
   }
   last=report;return report;
  }finally{
   if(locked)await conn.query("SELECT RELEASE_LOCK('fijas_nforce_settlement')").catch(()=>{});
   conn?.release();working=false;
  }
 }
 return {run,getStatus:()=>({working,last})};
}
