/** Server-only staff entitlement. No VIP sale, renewal, or payment is created. */
export const STAFF_ROLES = Object.freeze(['owner','general_admin','payments_admin','analyst','moderator']);
export const paidVipSql = alias => `EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=${alias}.id AND m.status='active' AND m.archived_at IS NULL AND m.starts_at<=UTC_TIMESTAMP() AND m.ends_at>UTC_TIMESTAMP())`;
export const staffVipSql = alias => `EXISTS(SELECT 1 FROM admins a WHERE a.email=${alias}.email AND a.is_active=1 AND a.role IN ('owner','general_admin','payments_admin','analyst','moderator'))`;
export const effectiveVipSql = alias => `(${paidVipSql(alias)} OR ${staffVipSql(alias)})`;
export const allowedVip = ({accountStatus,paidVip,staffVip,changePending=false}) => accountStatus==='active' && !changePending && (Boolean(paidVip)||Boolean(staffVip));
export async function getVipEntitlement(db,userId) {
 const [[v]]=await db.execute(`SELECT u.account_status,${paidVipSql('u')} AS paid_vip,${staffVipSql('u')} AS staff_vip FROM users u WHERE u.id=? LIMIT 1`,[userId]);
 return {paid:Boolean(v?.paid_vip)&&v.account_status==='active',staff:Boolean(v?.staff_vip)&&v.account_status==='active',hasVip:allowedVip({accountStatus:v?.account_status,paidVip:v?.paid_vip,staffVip:v?.staff_vip})};
}
