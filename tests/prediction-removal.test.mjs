import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRemovePrediction,validPredictionId,recordPredictionTelegramMessage,removePredictionTelegramMessages} from '../src/prediction-removal.js';

const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const dbInit=readFileSync(new URL('../src/init-db.js',import.meta.url),'utf8');
const notifications=readFileSync(new URL('../src/notification-center.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');

test('solo el dueño puede retirar pronósticos',()=>{
 assert.equal(canRemovePrediction('owner'),true);
 for(const role of ['general_admin','payments_admin','moderator','analyst','']) assert.equal(canRemovePrediction(role),false);
 assert.equal(validPredictionId('12'),true);
 for(const id of ['0','-1','1;DROP TABLE predictions','1.2','abc','9'.repeat(35)]) assert.equal(validPredictionId(id),false);
 assert.match(server,/app\.delete\('\/api\/admin\/predictions\/:id'/);
 assert.match(server,/archivePredictionSchema/);
 assert.match(server,/prediction_archived/);
});

test('retirada es lógica, mantiene trazabilidad y oculta propuestas a clientes',()=>{
 assert.match(dbInit,/archived_at:'DATETIME NULL'/);
 assert.match(dbInit,/telegram_prediction_messages/);
 assert.match(server,/UPDATE predictions SET archived_at=UTC_TIMESTAMP\(\)/);
 assert.match(server,/p\.archived_at IS NULL ORDER BY p\.id DESC/);
 assert.match(server,/WHERE published_at IS NOT NULL AND archived_at IS NULL/);
 assert.doesNotMatch(server,/DELETE FROM predictions/);
 assert.match(notifications,/p\.archived_at IS NOT NULL/);
 assert.match(notifications,/SELECT id FROM predictions WHERE id=\? AND archived_at IS NULL/);
});

test('botones de dueño e historial de pronósticos retirados están disponibles',()=>{
 assert.match(html,/predictionArchivedToggle/);
 assert.match(admin,/Eliminar pronóstico/);
 assert.match(admin,/\?archived=1/);
 assert.match(admin,/method:'DELETE'/);
 assert.match(admin,/currentAdminRole==='owner'/);
});

test('registra IDs de Telegram para nuevos pronósticos y no archiva si faltan datos',async()=>{
 const calls=[];
 const db={execute:async(sql,values)=>{calls.push({sql,values});return [{affectedRows:1}];}};
 assert.equal(await recordPredictionTelegramMessage(db,55,'vip','-100112233',12345),true);
 assert.equal(calls.length,1);
 assert.equal(await recordPredictionTelegramMessage(db,0,'vip','-100112233',12345),false);
 assert.equal(await recordPredictionTelegramMessage(db,55,'vip','-100112233',0),false);
});

test('elimina mensaje principal y adelanto público por sus IDs registrados',async()=>{
 const requests=[],updated=[];
 const db={execute:async(sql,params)=>{
  updated.push(sql);
  if(sql.includes('FROM telegram_prediction_messages'))return [[{id:1,chat_id:-10012,message_id:700}]];
  if(sql.includes('FROM telegram_vip_public_announcements'))return [[{prediction_id:22,telegram_message_id:701}]];
  return [{affectedRows:1}];
 }};
 const result=await removePredictionTelegramMessages({db,predictionId:22,telegramApi:async(method,payload)=>{requests.push({method,payload});return true;},env:{TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_FREE_CHAT_ID:'-10034'}});
 assert.equal(result.removed,2);
 assert.equal(result.failed,0);
 assert.equal(result.untracked,false);
 assert.deepEqual(requests.map(x=>x.payload.chat_id),['-10012','-10034']);
 assert.ok(updated.some(x=>x.includes('SET removed_at=UTC_TIMESTAMP()')));
});

test('si Telegram falla, se mantiene la retirada web y se informa de error de Telegram',async()=>{
 const db={execute:async(sql)=>{
  if(sql.includes('FROM telegram_prediction_messages'))return [[{id:1,chat_id:-10012,message_id:700}]];
  if(sql.includes('FROM telegram_vip_public_announcements'))return [[]];
  return [{affectedRows:1}];
 }};
 const result=await removePredictionTelegramMessages({db,predictionId:22,telegramApi:async()=>{throw Error('message is too old');},env:{TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_FREE_CHAT_ID:'-10034'}});
 assert.equal(result.removed,0);
 assert.equal(result.failed,1);
 assert.equal(result.warnings.length,1);
});

test('los mensajes publicados antes de la actualización requieren borrado manual',async()=>{
 const db={execute:async(sql)=>{
  if(sql.includes('FROM telegram_prediction_messages'))return [[]];
  if(sql.includes('FROM telegram_vip_public_announcements'))return [[]];
  return [{affectedRows:1}];
 }};
 const result=await removePredictionTelegramMessages({db,predictionId:22,telegramApi:async()=>true,env:{TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_FREE_CHAT_ID:'-10034'}});
 assert.equal(result.untracked,true);
 assert.match(result.warnings.join(' '),/manual/);
});
