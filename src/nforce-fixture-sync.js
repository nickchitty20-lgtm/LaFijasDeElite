/**
 * Fixture schedule reconciliation. The public historical file is NOT a live feed.
 * Kickoff is stored in UTC; manual corrections are tracked and never inferred
 * from the passage of time. DB updates preserve the published betting selection.
 */
const validTime = value => {
 if(value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
 if(typeof value!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
 const d=new Date(value);return Number.isFinite(d.getTime())?d:null;
};
export const manualFixtureStatuses=Object.freeze(['scheduled','live','postponed','cancelled']);
export function validateManualFixtureUpdate(body,now=new Date()){
 if(body?.action==='clear')return {action:'clear',kickoff:null,status:null};
 if(!body || !manualFixtureStatuses.includes(body.status))throw Error('Estado de partido inválido');
 const date=validTime(body.kickoff);
 if(body.status==='scheduled' && (!date || date.getTime()<now.getTime()-10*60000 || date.getTime()>now.getTime()+365*86400000))
  throw Error('Introduce un horario futuro en ISO 8601 con zona horaria explícita');
 if(body.status==='live' && (!date|| date.getTime()>now.getTime()+15*60000||date.getTime()<now.getTime()-5*3600000))
  throw Error('Para confirmar EN VIVO, introduce un inicio entre hace 5 horas y dentro de 15 minutos');
 if(date && Math.abs(date.getTime()-now.getTime())>365*86400000)throw Error('Fecha fuera de rango');
 return {action:'set',kickoff:date?date.toISOString().slice(0,19).replace('T',' '):null,status:body.status};
}
const timestamp=value=>{
 if(!value)return NaN;
 if(value instanceof Date)return value.getTime();
 const raw=String(value).trim();return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(raw)?raw:raw.replace(' ','T')+'Z');
};
const goalsPresent=r=>Number.isInteger(Number(r?.home_goals))&&Number.isInteger(Number(r?.away_goals))&&r.home_goals!==null&&r.away_goals!==null;
/** No time-based guess can ever produce 'live' or 'finished'. */
export function fixturePhase(row,at=new Date()){
 const now=at.getTime(),kick=timestamp(row?.effective_kickoff??row?.kickoff),checked=timestamp(row?.override_checked_at);
 const hasScores=goalsPresent(row);
 const manual=row?.override_status;
 if(['cancelled','postponed'].includes(manual))return {status:manual,verified:true,label:manual==='cancelled'?'Cancelado · verificado manualmente':'Pospuesto · verificado manualmente'};
 if(hasScores)return {status:'finished',verified:true,label:'Finalizado · marcador registrado'};
 if(manual==='live' && Number.isFinite(checked) && now>=checked && now-checked<=90*60000 && Number.isFinite(kick))
  return {status:'live',verified:true,label:'En vivo · confirmación manual reciente'};
 if(manual==='scheduled' && Number.isFinite(kick) && kick>now)
  return {status:'scheduled',verified:true,label:'Programado · horario confirmado manualmente'};
 if(Number.isFinite(kick)&&kick>now)return {status:'scheduled',verified:false,label:'Programado · horario sin confirmación independiente'};
 return {status:'unconfirmed',verified:false,label:'Estado sin confirmar · consulta la competición'};
}
/**
 * Call after importing any schedule change and after a verified manual correction.
 * Changes schedule for pending published picks without changing their selection,
 * odds, result or publication time. Settled picks remain immutable.
 */
export async function reconcileLinkedFixtureTimes(conn,provider){
 const source=`COALESCE(m.override_kickoff,m.kickoff)`;
 const [pub]=await conn.execute(`UPDATE football_candidates c
  JOIN nforce_matches m ON m.id=c.fixture_id
  JOIN predictions p ON p.id=c.prediction_id
  SET c.kickoff=${source},p.match_date=${source}
  WHERE c.provider=? AND c.status='published' AND p.outcome='pending' AND ${source} IS NOT NULL
   AND (NOT(c.kickoff <=> ${source}) OR NOT(p.match_date <=> ${source}))`,[provider]);
 const [draft]=await conn.execute(`UPDATE football_candidates c JOIN nforce_matches m ON m.id=c.fixture_id
  SET c.kickoff=${source},c.evidence_json=JSON_SET(c.evidence_json,'$.schedule_changed',true)
  WHERE c.provider=? AND c.status='draft' AND ${source} IS NOT NULL AND NOT(c.kickoff <=> ${source})`,[provider]);
 return {published_updated:Number(pub?.affectedRows||0),drafts_updated:Number(draft?.affectedRows||0)};
}
