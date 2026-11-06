// Scans are deliberately selective; the Free tier is limited to 100/day and 10/min.
// Diversify the first five matches across leagues, instead of blindly taking
// three fixtures from the same competition in chronological order.
export const FOOTBALL_SCAN_FIXTURES_LIMIT=5;
export const MANUAL_SCAN_DAILY_LIMIT=2;
export const MANUAL_SCAN_MINUTES=10;
export function pickScanFixtures(fixtures, limit=FOOTBALL_SCAN_FIXTURES_LIMIT){
 const selected=[], leagues=new Set(), ids=new Set();
 const valid=(f)=>Number.isSafeInteger(Number(f?.fixture?.id));
 const add=(f)=>{const id=Number(f.fixture.id);if(ids.has(id))return false;ids.add(id);selected.push(f);return true;};
 for(const f of fixtures||[]){
  if(selected.length>=limit)break;
  if(!valid(f))continue;
  const league=String(f?.league?.id||f?.league?.name||'')||'unknown';
  if(leagues.has(league))continue;
  if(add(f))leagues.add(league);
 }
 for(const f of fixtures||[]){if(selected.length>=limit)break;if(valid(f))add(f);}
 return selected;
}
export function canRunManual({countToday=0,lastStartedAt=null,now=Date.now(),limit=MANUAL_SCAN_DAILY_LIMIT,minutes=MANUAL_SCAN_MINUTES}={}){
 if(countToday>=limit)return {allowed:false,reason:`Se alcanzó el límite de ${limit} análisis manuales de hoy (UTC) para cuidar tu plan Free.`,remaining:0,nextAt:null};
 const last=lastStartedAt?new Date(lastStartedAt).getTime():0;
 const next=last+(minutes*60000);
 if(last&&Number.isFinite(last)&&now<next)return {allowed:false,reason:`Podrás analizar nuevamente a las ${new Date(next).toISOString()}.`,remaining:Math.max(0,limit-countToday),nextAt:new Date(next).toISOString()};
 return {allowed:true,reason:'',remaining:Math.max(0,limit-countToday),nextAt:null};
}
