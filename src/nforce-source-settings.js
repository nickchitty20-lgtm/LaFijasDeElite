/** Source switches are production settings shared by all Railway instances.
 * The initial DB value is seeded once from the legacy env setting by init-db.
 * Existing MySQL values always win after that, including across deployments.
 */
export const SECONDARY_SOURCE_ID='thesportsdb';
export function sourceEnabled(value){return value===true||value===1||value==='1';}
export function sourceEnabledFromRows(rows){
 const row=(rows||[]).find(r=>r.source_id===SECONDARY_SOURCE_ID);
 if(!row)throw new Error('No se ha inicializado la configuración de fuentes deportivas');
 return sourceEnabled(row.enabled);
}
export async function readSecondarySource(db){
 const [rows]=await db.query('SELECT source_id,enabled,updated_at,updated_by FROM nforce_source_settings WHERE source_id=? LIMIT 1',[SECONDARY_SOURCE_ID]);
 const enabled=sourceEnabledFromRows(rows);
 return {id:SECONDARY_SOURCE_ID,enabled,updated_at:rows[0].updated_at||null,updated_by:rows[0].updated_by||null};
}
export async function saveSecondarySource(db,{enabled,actorId}){
 if(typeof enabled!=='boolean')throw new TypeError('enabled debe ser booleano');
 if(!Number.isSafeInteger(Number(actorId))||Number(actorId)<1)throw new TypeError('Administrador inválido');
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT enabled FROM nforce_source_settings WHERE source_id=? FOR UPDATE',[SECONDARY_SOURCE_ID]);
  if(!rows.length)throw new Error('Falta la configuración de fuentes; reinicia la migración de base de datos');
  const previous=sourceEnabled(rows[0].enabled);
  if(previous!==enabled){
   await conn.execute('UPDATE nforce_source_settings SET enabled=?,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE source_id=?',[enabled?1:0,actorId,SECONDARY_SOURCE_ID]);
   await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'sports_source_updated','sports_source',?,?)",[actorId,SECONDARY_SOURCE_ID,JSON.stringify({previous,enabled})]);
  }
  await conn.commit();
  return {id:SECONDARY_SOURCE_ID,enabled,changed:previous!==enabled};
 }catch(e){await conn.rollback().catch(()=>{});throw e;}
 finally{conn.release();}
}

// v3.6.4: another independent calendar source. Credentials stay exclusively
// in Railway; only the enable flag and audit actor are persisted in MySQL.
export const FOOTBALL_DATA_SOURCE_ID='footballdata';
export async function readFootballDataSource(db){
 const [rows]=await db.query('SELECT source_id,enabled,updated_at,updated_by FROM nforce_source_settings WHERE source_id=? LIMIT 1',[FOOTBALL_DATA_SOURCE_ID]);
 if(!rows.length)throw new Error('No se ha inicializado la configuración de football-data.org');
 return {id:FOOTBALL_DATA_SOURCE_ID,enabled:sourceEnabled(rows[0].enabled),updated_at:rows[0].updated_at||null,updated_by:rows[0].updated_by||null};
}
export async function saveFootballDataSource(db,{enabled,actorId}){
 if(typeof enabled!=='boolean')throw new TypeError('enabled debe ser booleano');
 if(!Number.isSafeInteger(Number(actorId))||Number(actorId)<1)throw new TypeError('Administrador inválido');
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT enabled FROM nforce_source_settings WHERE source_id=? FOR UPDATE',[FOOTBALL_DATA_SOURCE_ID]);
  if(!rows.length)throw new Error('Falta la configuración de la nueva fuente; reinicia la migración de base de datos');
  const previous=sourceEnabled(rows[0].enabled);
  if(previous!==enabled){
   await conn.execute('UPDATE nforce_source_settings SET enabled=?,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE source_id=?',[enabled?1:0,actorId,FOOTBALL_DATA_SOURCE_ID]);
   await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'sports_source_updated','sports_source',?,?)",[actorId,FOOTBALL_DATA_SOURCE_ID,JSON.stringify({previous,enabled})]);
  }
  await conn.commit();
  return {id:FOOTBALL_DATA_SOURCE_ID,enabled,changed:previous!==enabled};
 }catch(e){await conn.rollback().catch(()=>{});throw e;}
 finally{conn.release();}
}

// Fourth source: owner-controlled API-Football wide-fixture discovery.
// Uses the existing FOOTBALL_API_KEY. Never store tokens in MySQL.
export const API_SPORTS_WIDE_SOURCE_ID='apisportswide';
export async function readWideSource(db){
 const [rows]=await db.query('SELECT source_id,enabled,updated_at,updated_by FROM nforce_source_settings WHERE source_id=? LIMIT 1',[API_SPORTS_WIDE_SOURCE_ID]);
 if(!rows.length)throw new Error('No se ha inicializado el calendario de cobertura ampliada');
 return {id:API_SPORTS_WIDE_SOURCE_ID,enabled:sourceEnabled(rows[0].enabled),updated_at:rows[0].updated_at||null,updated_by:rows[0].updated_by||null};
}
export async function saveWideSource(db,{enabled,actorId}){
 if(typeof enabled!=='boolean')throw new TypeError('enabled debe ser booleano');
 if(!Number.isSafeInteger(Number(actorId))||Number(actorId)<1)throw new TypeError('Administrador inválido');
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT enabled FROM nforce_source_settings WHERE source_id=? FOR UPDATE',[API_SPORTS_WIDE_SOURCE_ID]);
  if(!rows.length)throw new Error('No está inicializada la fuente de cobertura ampliada');
  const previous=sourceEnabled(rows[0].enabled);
  if(previous!==enabled){
   await conn.execute('UPDATE nforce_source_settings SET enabled=?,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE source_id=?',[enabled?1:0,actorId,API_SPORTS_WIDE_SOURCE_ID]);
   await conn.execute("INSERT INTO audit_logs(actor_admin_id,action,entity_type,entity_id,details) VALUES (?,'sports_source_updated','sports_source',?,?)",[actorId,API_SPORTS_WIDE_SOURCE_ID,JSON.stringify({previous,enabled})]);
  }
  await conn.commit();return {id:API_SPORTS_WIDE_SOURCE_ID,enabled,changed:previous!==enabled};
 }catch(e){await conn.rollback().catch(()=>{});throw e;}
 finally{conn.release();}
}
