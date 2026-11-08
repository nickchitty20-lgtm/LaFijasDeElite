import test from 'node:test';
import assert from 'node:assert/strict';
import {fitOpponentRatings,opponentAdjustedGoals} from '../src/nforce-strength.js';
import {fixtureTimestamp,estimateMatch,walkForwardBacktest,selectMarket,MODEL_VERSION} from '../src/nforce-model.js';

const MATCH_DAY=86400000;
function syntheticHistory(){
 const start=Date.parse('2026-01-01T16:00:00Z');
 const teams=['STRONG','MIDDLE','WEAK','DEFENSIVE'];
 const rates={STRONG:2.2,MIDDLE:1.2,WEAK:0.65,DEFENSIVE:1.15};
 const defence={STRONG:0.7,MIDDLE:1.15,WEAK:1.65,DEFENSIVE:0.65};
 const rows=[];
 for(let day=0;day<140;day++){
  const home=teams[day%teams.length],away=teams[(day+1+Math.floor(day/4)%3)%teams.length];
  // Alternating all distinct pairings, expected rates translated into deterministic
  // scores, strictly synthetic to test the direction of an adjustment.
  const gh=Math.round(rates[home]*defence[away]*(.85+(day%5)*.09));
  const ga=Math.round(rates[away]*defence[home]*(.82+(day%7)*.06));
  rows.push({competition:'demo',home,away,home_goals:gh,away_goals:ga,
   kickoff:new Date(start+day*MATCH_DAY).toISOString()});
 }
 return rows;
}
test('El motor 1.4 ajusta la fuerza del rival y mantiene las tasas finitas',()=>{
 const rows=syntheticHistory(),cutoff=Date.parse('2026-06-12T16:00:00Z');
 const rating=fitOpponentRatings(rows,cutoff,1.35,1.1);
 assert.ok(rating);
 assert.ok(rating.rating('STRONG').attack>rating.rating('WEAK').attack);
 const adjusted=opponentAdjustedGoals(rating,'STRONG','WEAK',1.35,1.1,[1.35,1.1]);
 assert.ok(adjusted.home>adjusted.away,JSON.stringify(adjusted));
 assert.ok(adjusted.home>0&&adjusted.home<=3.6);
 assert.ok(adjusted.mix<=.6);
});
test('El ajuste no usa partidos del futuro aunque lleguen precargados',()=>{
 const rows=syntheticHistory(),cutoff=Date.parse('2026-06-12T16:00:00Z');
 const future={competition:'demo',home:'STRONG',away:'WEAK',home_goals:23,away_goals:0,
  kickoff:new Date(cutoff+MATCH_DAY).toISOString()};
 const base=fitOpponentRatings(rows,cutoff,1.35,1.1),other=fitOpponentRatings([...rows,future],cutoff,1.35,1.1);
 assert.deepEqual(base.rating('STRONG'),other.rating('STRONG'));
 const target={competition:'demo',home:'STRONG',away:'WEAK',kickoff:new Date(cutoff).toISOString()};
 assert.deepEqual(estimateMatch(target,rows,cutoff),estimateMatch(target,[...rows,future],cutoff));
});
test('Un resultado sin hora no puede filtrarse en predicciones del mismo día',()=>{
 const unknown={date:'2026-11-08',home:'A',away:'B',home_goals:9,away_goals:0};
 assert.ok(fixtureTimestamp(unknown)>Date.parse('2026-11-08T17:00:00Z'));
});
test('Mercados GRATIS pueden mostrar más de 50% sin mover el umbral VIP',()=>{
 const model={confidence:57,margin:12,quality:70,selected:'home',
  probabilities:{home:57,draw:25,away:18},totals:{over15:69,over25:51,under25:49,btts:50},
  sample:{home:14,away:14,league:100},leagueBaseline:{home:45,draw:28,away:27,over15:66,over25:50,under25:50,btts:48,noBtts:52,oneX:73,xTwo:55,oneTwo:72}};
 const pick=selectMarket({home:'Local',away:'Visitante'},model);
 assert.equal(pick.visibility,'free');assert.equal(pick.probability,57);
 assert.equal(selectMarket({home:'Local',away:'Visitante'}, {...model,confidence:39}),null);
});
test('El informe walk-forward compara Brier frente al modelo previo, sin prometer mejora',()=>{
 const rows=syntheticHistory();
 const report=walkForwardBacktest(rows,{maxGames:120,now:new Date('2026-09-01T00:00:00Z')});
 assert.equal(report.model,MODEL_VERSION);
 assert.ok(report.evaluated>0);
 assert.ok(report.comparison_previous.paired_evaluated>0);
 assert.ok(Number.isFinite(report.comparison_previous.previous_brier));
 assert.ok(Number.isFinite(report.comparison_previous.current_brier));
});
