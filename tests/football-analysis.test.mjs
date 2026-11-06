import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProviderPercent,upcomingFixtures,predictedResult,createAssessment,extractMatchWinnerOdds} from '../src/football-analysis.js';
import {telegramFreeAutoPost,telegramVipPost,sendPredictionToTelegram} from '../src/telegram-bridge.js';

const fixture=(dt='2026-11-06T18:00:00Z')=>({
 fixture:{id:102, date:dt,status:{short:'NS'}},
 league:{name:'Liga Demo'},teams:{home:{id:11,name:'Local FC'},away:{id:22,name:'Visita FC'}}
});
const prediction=(home,draw,away)=>({
 predictions:{percent:{home:`${home}%`,draw:`${draw}%`,away:`${away}%`}},
 teams:{home:{last_5:{form:'70%'}},away:{last_5:{form:'50%'}}},
 comparison:{att:{home:'58%',away:'42%'},def:{home:'55%',away:'45%'}}
});
const now=new Date('2026-11-06T15:00:00Z');
test('filtra partidos todavía por comenzar en 1–6 horas',()=>{
 assert.equal(upcomingFixtures([fixture(),fixture('2026-11-06T15:02:00Z'),fixture('2026-11-07T08:00:00Z')],now).length,1);
 assert.equal(upcomingFixtures([{...fixture(),fixture:{...fixture().fixture,status:{short:'FT'}}}],now).length,0);
});
test('parsea las estimaciones sin inventar probabilidades',()=>{
 assert.equal(parseProviderPercent('62%'),62);
 assert.equal(parseProviderPercent('141%'),null);
 assert.equal(predictedResult({predictions:{percent:{home:'99%',draw:'1%',away:'0%'}}}),null);
 assert.equal(predictedResult({predictions:{percent:{home:'60%',draw:'20%',away:'20%'}}}).confidence,60);
});
test('VIP requiere confianza estimada, margen y varias evidencias',()=>{
 const out=createAssessment(fixture(),prediction(77,13,10));
 assert.equal(out.visibility,'vip');
 assert.equal(out.odds,null);
 assert.match(out.analysis,/no calibradas ni garantizadas/);
 assert.match(out.analysis,/Alineaciones: (No disponible|Pendiente)/);
 assert.equal(out.fixture_id,102);
 assert.equal(out.market,'Resultado final 1X2');
});
test('GRATIS se clasifica por estimación <=50%, nunca por tasa real de aciertos',()=>{
 const free=createAssessment(fixture(),prediction(45,28,27));
 assert.equal(free.visibility,'free');
 assert.match(free.analysis,/RIESGO ALTO/);
 assert.equal(free.confidence,45);
 assert.equal(free.raw_evidence.evidence_count>=2,true);
 assert.equal(createAssessment(fixture(),prediction(58,25,17)),null);
 assert.equal(createAssessment(fixture(),prediction(40,30,30)),null);
 assert.equal(createAssessment(fixture(),{predictions:{percent:{home:'75%',draw:'15%',away:'10%'}}}),null);
});
test('no se inventan cuotas, ni siquiera si el proveedor no las tiene',()=>{
 assert.equal(extractMatchWinnerOdds([], 'Local FC','Local FC','Visita FC'),null);
 const result=extractMatchWinnerOdds([{bookmakers:[{name:'Casas demo',bets:[{name:'Match Winner',values:[{value:'Home',odd:'1.46'},{value:'Away',odd:'8.0'}]}]}]}], 'Local FC','Local FC','Visita FC');
 assert.deepEqual(result,{odds:1.46,bookmaker:'Casas demo'});
});
test('el canal VIP nunca presenta una cuota faltante como 0.00',()=>{
 assert.match(telegramVipPost({title:'A vs B',league:'Demo',match_date:'2026-11-06 18:00:00',market:'Resultado final',selection:'A',odds:null,analysis:'No hay datos suficientes para hacer certeza'}),/No disponible/);
});
test('la publicación gratuita distingue estimación de una promesa',()=>{
 const text=telegramFreeAutoPost({title:'A vs B',league:'Demo',match_date:'2026-11-06',market:'Resultado final',selection:'A',analysis:'Probabilidad aproximada, sujeta a error'});
 assert.match(text,/Probabilidad aproximada/);
 assert.match(text,/no garantía/);
});
test('sin token el bot no envía ningún mensaje',async()=>{
 const result=await sendPredictionToTelegram({visibility:'free'},{TELEGRAM_BOT_TOKEN:''});
 assert.equal(result.state,'not_configured');
});
