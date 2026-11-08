// Prefer widely covered competitions when there are hundreds of matches,
// but never suppress all other leagues. The API's prediction coverage varies.
export const FOOTBALL_SCAN_FIXTURES_LIMIT=10;
export const MANUAL_SCAN_DAILY_LIMIT=2;
export const MANUAL_SCAN_MINUTES=10;
const WELL_COVERED_LEAGUES=new Set([2,3,39,61,71,78,88,94,128,135,140,144,179,253,262,307,848]);
export function pickScanFixtures(fixtures, limit=FOOTBALL_SCAN_FIXTURES_LIMIT){
 const original=(Array.isArray(fixtures)?fixtures:[]).filter(f=>Number.isSafeInteger(Number(f?.fixture?.id)));
 const seen=new Set();
 const distinct=original.filter(f=>{const id=Number(f.fixture.id);if(seen.has(id))return false;seen.add(id);return true;});
 // Stable ordering: priority competitions first, then closer kickoffs.
 distinct.sort((a,b)=>{
  const weight=x=>WELL_COVERED_LEAGUES.has(Number(x?.league?.id))?0:1;
  return weight(a)-weight(b)||Date.parse(a.fixture.date)-Date.parse(b.fixture.date);
 });
 const selected=[],leagues=new Set();
 for(const f of distinct){if(selected.length>=limit)break;
  const league=String(f?.league?.id||f?.league?.name||'desconocida');
  if(leagues.has(league))continue;leagues.add(league);selected.push(f);
 }
 const selectedIds=new Set(selected.map(f=>Number(f.fixture.id)));
 for(const f of distinct){if(selected.length>=limit)break;
  if(selectedIds.has(Number(f.fixture.id)))continue;
  selected.push(f);selectedIds.add(Number(f.fixture.id));
 }
 return selected;
}
export function canRunManual({countToday=0,lastStartedAt=null,now=Date.now(),limit=MANUAL_SCAN_DAILY_LIMIT,minutes=MANUAL_SCAN_MINUTES}={}){
 if(countToday>=limit)return {allowed:false,reason:`Se alcanzó el límite de ${limit} análisis manuales de hoy (UTC) para cuidar tu plan Free.`,remaining:0,nextAt:null};
 const last=lastStartedAt?new Date(lastStartedAt).getTime():0;
 const next=last+(minutes*60000);
 if(last&&Number.isFinite(last)&&now<next)return {allowed:false,reason:`Podrás analizar nuevamente a las ${new Date(next).toISOString()}.`,remaining:Math.max(0,limit-countToday),nextAt:new Date(next).toISOString()};
 return {allowed:true,reason:'',remaining:Math.max(0,limit-countToday),nextAt:null};
}
