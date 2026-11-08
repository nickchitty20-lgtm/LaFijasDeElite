/**
 * Prediction retraction preserves historical/audit records and attempts to
 * remove Telegram messages whose message IDs the bot recorded.
 * The Telegram Bot API has age and permission limits on deleting messages.
 */
export const canRemovePrediction = role => role === 'owner';
export const validPredictionId = id => /^[1-9]\d{0,17}$/.test(String(id));

export async function recordPredictionTelegramMessage(db, predictionId, kind, chatId, messageId) {
  if(!db || !validPredictionId(predictionId) || !['free','vip'].includes(kind) ||
     !/^-?\d{1,19}$/.test(String(chatId ?? '')) || !Number.isSafeInteger(Number(messageId)) || Number(messageId) <= 0) return false;
  try {
    await db.execute(`INSERT INTO telegram_prediction_messages(prediction_id,kind,chat_id,message_id)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE chat_id=VALUES(chat_id),message_id=VALUES(message_id),removed_at=NULL,removal_error=NULL`,
      [predictionId,kind,String(chatId),messageId]);
    return true;
  } catch(error) {
    console.error('telegram message ledger failed',error.code||error.message);
    return false;
  }
}

export async function removePredictionTelegramMessages({db,predictionId,telegramApi,env}) {
  const result={removed:0,failed:0,untracked:false,warnings:[]};
  if(!env.TELEGRAM_BOT_TOKEN){result.warnings.push('Bot sin token: debes borrar las publicaciones manualmente en Telegram.');return result;}
  const [messages]=await db.execute(`SELECT id,chat_id,message_id FROM telegram_prediction_messages
      WHERE prediction_id=? AND removed_at IS NULL`,[predictionId]);
  const [previews]=await db.execute(`SELECT prediction_id,telegram_message_id,chat_id FROM telegram_vip_public_announcements
      WHERE prediction_id=? AND state='sent' AND telegram_message_id IS NOT NULL AND removed_at IS NULL`,[predictionId]);
  const [community]=await db.execute(`SELECT prediction_id,message_id,chat_id FROM telegram_community_announcements
      WHERE prediction_id=? AND state='sent' AND message_id IS NOT NULL AND removed_at IS NULL`,[predictionId]);
  if(!messages.length)result.untracked=true; // Older versions did not save main post message IDs.
  const items=[
    ...messages.map(m=>({kind:'main',id:m.id,chatId:String(m.chat_id),messageId:Number(m.message_id)})),
    ...previews.map(m=>({kind:'preview',id:m.prediction_id,chatId:String(m.chat_id||env.TELEGRAM_FREE_CHAT_ID||''),messageId:Number(m.telegram_message_id)})),
    ...community.map(m=>({kind:'community',id:m.prediction_id,chatId:String(m.chat_id||''),messageId:Number(m.message_id)}))
  ];
  for(const item of items){
    if(!/^-?\d{1,19}$/.test(item.chatId) || !Number.isSafeInteger(item.messageId) || item.messageId <= 0){
      result.failed++;result.warnings.push('Falta el identificador del mensaje o grupo para retirarlo automáticamente.');continue;
    }
    try {
      await telegramApi('deleteMessage',{chat_id:item.chatId,message_id:item.messageId},env);
      if(item.kind==='main')await db.execute('UPDATE telegram_prediction_messages SET removed_at=UTC_TIMESTAMP(),removal_error=NULL WHERE id=?',[item.id]);
      else if(item.kind==='preview')await db.execute('UPDATE telegram_vip_public_announcements SET removed_at=UTC_TIMESTAMP(),removal_error=NULL WHERE prediction_id=?',[item.id]);
      else await db.execute('UPDATE telegram_community_announcements SET removed_at=UTC_TIMESTAMP(),removal_error=NULL WHERE prediction_id=?',[item.id]);
      result.removed++;
    }catch(error){
      const reason=String(error.message||error).slice(0,190);
      // Already deleted = no remaining message to remove.
      if(/message to delete not found/i.test(reason)){
        if(item.kind==='main')await db.execute('UPDATE telegram_prediction_messages SET removed_at=UTC_TIMESTAMP(),removal_error=NULL WHERE id=?',[item.id]);
        else if(item.kind==='preview')await db.execute('UPDATE telegram_vip_public_announcements SET removed_at=UTC_TIMESTAMP(),removal_error=NULL WHERE prediction_id=?',[item.id]);
        else await db.execute('UPDATE telegram_community_announcements SET removed_at=UTC_TIMESTAMP(),removal_error=NULL WHERE prediction_id=?',[item.id]);
        result.removed++;continue;
      }
      result.failed++;
      result.warnings.push('Telegram no pudo eliminar uno de los mensajes; revisa permisos y antigüedad.');
      try{
        if(item.kind==='main')await db.execute('UPDATE telegram_prediction_messages SET removal_error=? WHERE id=?',[reason,item.id]);
        else if(item.kind==='preview')await db.execute('UPDATE telegram_vip_public_announcements SET removal_error=? WHERE prediction_id=?',[reason,item.id]);
        else await db.execute('UPDATE telegram_community_announcements SET removal_error=? WHERE prediction_id=?',[reason,item.id]);
      }catch(error2){console.error('telegram removal status failed',error2.code||error2.message);}
    }
  }
  if(result.untracked)result.warnings.push('Las publicaciones antiguas sin ID registrado deben borrarse manualmente en Telegram.');
  return result;
}
