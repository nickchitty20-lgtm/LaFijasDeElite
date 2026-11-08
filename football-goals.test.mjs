import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalLine,goalProjection,goalAnalysisLines} from '../src/football-goals.js';
import {createAssessment} from '../src/football-analysis.js';

const baseFixture={fixture:{id:1234,date:'2026-11-07T21:00:00Z'},league:{name:'Liga de Prueba'},teams:{home:{id:10,name:'Local FC'},away:{id:20,name:'Visitante FC'}}};
const basePrediction={predictions:{percent:{home:'74%',draw:'16%',away:'10%'},goals:{home:'-3.5',away:'-1.5'},under_over:'-3.5'},teams:{home:{last_5:{form:'70%'}},away:{last_5:{form:'46%'}}},comparison:{att:{home:'55%',away:'45%'},def:{home:'60%',away:'40%'}}};
const fixture=(date,h,a,sides=false)=>({fixture:{status:{short:'FT'},date},teams:{home:{id:sides?20:10},away:{id:sides?10:20}},goals:{home:h,away:a}});
const h2h=[fixture('2026-10-06T00:00:00Z',2,0),fixture('2026-08-06T00:00:00Z',2,1),fixture('2026-06-06T00:00:00Z',1,2,true),fixture('2025-11-06T00:00:00Z',1,0)];

test('API-Football goal lines are bounds, never exact scores',()=>{
 assert.deepEqual(parseGoalLine('-2.5'),{direction:'under',threshold:2.5,min:0,max:2,label:'Hasta 2 goles',market_label:'Menos de 2.5 goles'});
 assert.deepEqual(parseGoalLine('Over 2.5'),{direction:'over',threshold:2.5,min:3,max:null,label:'Al menos 3 goles',market_label:'Más de 2.5 goles'});
 assert.deepEqual(parseGoalLine('+1.5'),{direction:'over',threshold:1.5,min:2,max:null,label:'Al menos 2 goles',market_label:'Más de 1.5 goles'});
 assert.equal(parseGoalLine('2.5'),null);
 assert.equal(parseGoalLine('4-2'),null);
 assert.equal(parseGoalLine('abc'),null);
 assert.equal(parseGoalLine(1.5),null);
});
test('without 3 completed H2H, no guessed exact score is shown',()=>{
 const result=goalProjection(baseFixture,basePrediction,[]);
 assert.equal(result.home_line.max,3);
 assert.equal(result.away_line.max,1);
 assert.equal(result.total_line.max,3);
 assert.equal(result.illustrative_score,null);
 assert.match(goalAnalysisLines(result).join(' '),/SIN ESTIMACIÓN/);
});
test('at least 3 completed valid H2H supports an illustrative score with margin',()=>{
 const result=goalProjection(baseFixture,basePrediction,h2h);
 assert.equal(result.historical.games,4);
 assert.equal(result.historical.both_scored,2);
 assert.equal(typeof result.illustrative_score,'string');
 const [h,a]=result.illustrative_score.split('-').map(Number);
 assert.ok(h>a,'score scenario aligns with chosen 1X2 outcome');
 assert.ok(h<=3&&a<=1&&h+a<=3,'scenario respects actual source bounds');
 assert.equal(result.illustrative_margin,h-a);
 assert.match(result.score_basis,/No es una predicción de marcador exacto/);
});
test('incompatible goal bounds never generate a fake scenario',()=>{
 const p=structuredClone(basePrediction);
 p.predictions.goals.home='-0.5';
 p.predictions.goals.away='+2.5';
 const result=goalProjection(baseFixture,p,h2h);
 assert.equal(result.illustrative_score,null);
 assert.equal(result.home_line.max,0);
 assert.equal(result.away_line.min,3);
});
test('assessment persists source goal lines in the analysis, without changing 1X2 market',()=>{
 const result=createAssessment(baseFixture,basePrediction,{h2h});
 assert.ok(result);
 assert.equal(result.market,'Resultado final 1X2');
 assert.equal(result.raw_evidence.goals.historical.games,4);
 assert.match(result.analysis,/Proyección de goles del proveedor/);
 assert.match(result.analysis,/Marcador orientativo/);
 assert.match(result.analysis,/NO apuesta recomendada/);
});
test('invalid or missing goal fields are omitted rather than fabricated',()=>{
 const p=structuredClone(basePrediction);delete p.predictions.goals;delete p.predictions.under_over;
 const result=goalProjection(baseFixture,p,[]);
 assert.equal(result.illustrative_score,null);
 assert.equal(result.home_line,null);
 assert.match(goalAnalysisLines(result)[0],/no aporta líneas/);
});
