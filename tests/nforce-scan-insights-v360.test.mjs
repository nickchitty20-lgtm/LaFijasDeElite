import test from 'node:test';
import assert from 'node:assert/strict';
import {explainScan,tallyCompetition} from '../src/nforce-scan-insights.js';

test('sin horarios seguros no se convierte fecha en una propuesta',()=>{
 const result=explainScan({fixtures_in_window:0,calendar_diagnostic:{date_only_in_window:9,future_known_time:0}});
 assert.equal(result.code,'missing_kickoff');assert.match(result.suggestions[0],/no se generarán/);
});
test('distingue partidos fuera del rango, historial escaso y filtros',()=>{
 assert.equal(explainScan({fixtures_in_window:0,calendar_diagnostic:{future_known_time:8}}).code,'outside_window');
 assert.equal(explainScan({fixtures_in_window:4,modeled:0,insufficient_history:4}).code,'insufficient_history');
 assert.equal(explainScan({fixtures_in_window:4,modeled:4,below_filters:4}).code,'strict_filters');
});
test('no confunde propuestas existentes con nuevas',()=>{
 const x=explainScan({fixtures_in_window:5,modeled:5,already_present:5,drafts_created:0});
 assert.equal(x.code,'already_registered');
 assert.match(x.suggestions[0],/no duplica/);
});
test('diagnóstico reconoce propuestas nuevas o recuperadas',()=>{
 assert.equal(explainScan({fixtures_in_window:3,drafts_created:2}).code,'new_drafts');
 assert.equal(explainScan({fixtures_in_window:3,reopened_old_discards:1}).code,'new_drafts');
});
test('conteo por liga diferencia modelados, filtrados, nuevos y repetidos',()=>{
 const data={};const m={competition:'int.friendly',league:'Amistosos'};
 for(const outcome of ['insufficient','filtered','new','existing','reopened'])tallyCompetition(data,m,outcome);
 assert.deepEqual(data['int.friendly'],{competition:'int.friendly',league:'Amistosos',examined:5,modeled:4,insufficient:1,filtered:1,eligible:3,created:1,existing:1});
});
