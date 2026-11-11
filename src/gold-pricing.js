export const GOLD_PRICE_TARGETS=Object.freeze({7:24.90,30:59.90,90:149.90});
export const GOLD_PRICE_MIGRATION='gold-tier-prices-3.5.3';
export async function ensureGoldPlans(connection){
 await connection.query(`CREATE TABLE IF NOT EXISTS fijas_pricing_migrations (
  migration_key VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
 ) ENGINE=InnoDB`);
 await connection.beginTransaction();
 try{
  const [mark]=await connection.execute('INSERT IGNORE INTO fijas_pricing_migrations (migration_key) VALUES (?)',[GOLD_PRICE_MIGRATION]);
  const starter=[[7,'ÉLITE GOLD · 7 días',GOLD_PRICE_TARGETS[7]],[30,'ÉLITE GOLD · 30 días',GOLD_PRICE_TARGETS[30]],[90,'ÉLITE GOLD · 90 días',GOLD_PRICE_TARGETS[90]]];
  for(const [duration,name,price] of starter){
   const [rows]=await connection.execute("SELECT id FROM plans WHERE tier='gold' AND duration_days=? LIMIT 1",[duration]);
   if(!rows.length)await connection.execute('INSERT INTO plans (name,duration_days,price_pen,tier,active) VALUES (?,?,?,?,1)',[name,duration,price,'gold']);
  }
  if(Number(mark.affectedRows)===1){
   await connection.execute(`UPDATE plans SET price_pen=CASE duration_days
    WHEN 7 THEN GREATEST(price_pen,?)
    WHEN 30 THEN GREATEST(price_pen,?)
    WHEN 90 THEN GREATEST(price_pen,?)
    ELSE price_pen END
    WHERE tier='gold' AND active=1 AND duration_days IN (7,30,90)`,[GOLD_PRICE_TARGETS[7],GOLD_PRICE_TARGETS[30],GOLD_PRICE_TARGETS[90]]);
  }
  await connection.commit();
 }catch(error){await connection.rollback();throw error;}
}
