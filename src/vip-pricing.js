/** One-time target tariffs, soles (PEN). New charges only; existing payments
 * and active membership expiry are never rewritten. A unique migration marker
 * prevents restarting Railway from reapplying prices after admin edits.
 */
export const VIP_PRICE_TARGETS=Object.freeze({7:89.90,30:249.90,90:649.90});
export const VIP_PRICE_MIGRATION='vip-premium-prices-3.5.2';
export async function applyVipPriceIncrease(connection){
 await connection.query(`CREATE TABLE IF NOT EXISTS fijas_pricing_migrations (
  migration_key VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
 ) ENGINE=InnoDB`);
 await connection.beginTransaction();
 try{
  const [mark]=await connection.execute('INSERT IGNORE INTO fijas_pricing_migrations (migration_key) VALUES (?)',[VIP_PRICE_MIGRATION]);
  if(Number(mark.affectedRows)!==1){await connection.commit();return {applied:false,updated:0};}
  const [result]=await connection.execute(`UPDATE plans SET price_pen=CASE duration_days
   WHEN 7 THEN GREATEST(price_pen,?)
   WHEN 30 THEN GREATEST(price_pen,?)
   WHEN 90 THEN GREATEST(price_pen,?)
   ELSE price_pen END
   WHERE tier='vip' AND active=1 AND duration_days IN (7,30,90)`,
   [VIP_PRICE_TARGETS[7],VIP_PRICE_TARGETS[30],VIP_PRICE_TARGETS[90]]);
  await connection.commit();
  return {applied:true,updated:Number(result.affectedRows||0)};
 }catch(error){await connection.rollback();throw error;}
}
