/**
 * Public, database-derived performance. No made-up statistics and no disclosure
 * of premium predictions, odds, or privileged analyses.
 * Source outcomes can be human-entered or compared with OpenFootball CC0 FT scores.
 * The feed is not an official match-result authority.
 */
const PERIOD_DAYS = Object.freeze({all:null,'30d':30,'90d':90});
const VISIBILITIES = new Set(['all','free','vip']);
const OUTCOMES = new Set(['won','lost','void']);
const safeNum = value => Math.max(0,Number(value)||0);

export function publicPerformanceFilters(query={}) {
 const period=Object.hasOwn(PERIOD_DAYS,query.period)?query.period:'all';
 const visibility=VISIBILITIES.has(query.visibility)?query.visibility:'all';
 return {period,visibility};
}

export function performanceWhere({period='all',visibility='all'}={}) {
 const filters=publicPerformanceFilters({period,visibility});
 const conditions=['p.published_at IS NOT NULL','p.published_at<=UTC_TIMESTAMP()'];
 const params=[];
 // Time windows refer to scheduled match dates (publication date for legacy records).
 if(PERIOD_DAYS[filters.period]!=null){
  conditions.push('COALESCE(p.match_date,p.published_at)>=DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)');
  params.push(PERIOD_DAYS[filters.period]);
 }
 if(filters.visibility!=='all'){
  conditions.push('p.visibility=?');params.push(filters.visibility);
 }
 // Intentionally NO archived_at filter: retired successes and failures still count.
 return {sql:conditions.join(' AND '),params};
}

const zero=()=>({total:0,won:0,lost:0,void:0,pending:0,decided:0,archived:0,source_checked:0,manual_checked:0,accuracy:null});
export function summaryFromGroups(rows=[]){
 const by={free:zero(),vip:zero()};
 for(const row of rows){
  if(!Object.hasOwn(by,row.visibility))continue;
  const group=by[row.visibility];
  for(const key of ['total','won','lost','void','archived','source_checked','manual_checked'])group[key]+=safeNum(row[key]);
 }
 const overall=zero();
 for(const group of Object.values(by)){
  group.decided=group.won+group.lost;
  group.pending=Math.max(0,group.total-group.decided-group.void);
  group.accuracy=group.decided?Math.round(group.won/group.decided*1000)/10:null;
  for(const key of ['total','won','lost','void','archived','source_checked','manual_checked'])overall[key]+=group[key];
 }
 overall.decided=overall.won+overall.lost;
 overall.pending=Math.max(0,overall.total-overall.decided-overall.void);
 overall.accuracy=overall.decided?Math.round(overall.won/overall.decided*1000)/10:null;
 return {overall,by_visibility:by};
}

export function publicRecentResults(rows=[]){
 return rows.filter(r=>OUTCOMES.has(r.outcome)&&['free','vip'].includes(r.visibility)).slice(0,15).map(r=>({
  id:String(r.id),title:String(r.title||'Partido'),league:String(r.league||'Fútbol'),
  visibility:r.visibility,outcome:r.outcome,match_date:r.match_date||null,
  withdrawn:Boolean(r.archived_at),
  result_source:r.settlement_source==='nforce-openfootball'?'openfootball':r.settlement_source==='manual'?'manual':'legacy',
  score:r.settlement_source==='nforce-openfootball'&&/^\d{1,2}-\d{1,2}$/.test(String(r.settlement_score||''))?String(r.settlement_score):null
 }));
}
