/** Pricing shared by public catalogue, manual requests and PayPal orders.
 * Amounts are computed in integer PEN cents; existing receipts are immutable.
 * Date-only windows use UTC calendar dates consistently across Railway workers.
 */
export function cents(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)throw new RangeError('Precio inválido');
 return Math.round((n+Number.EPSILON)*100);
}
export function discountForPlan(row,today=new Date().toISOString().slice(0,10)){
 const base=cents(row.price_pen);
 // SQL DATE values may be returned as Date by mysql2.
 const dateText=v=>v instanceof Date?v.toISOString().slice(0,10):v?String(v).slice(0,10):null;
 const start=dateText(row.discount_starts_at),end=dateText(row.discount_ends_at);
 const active=Number(row.discount_active)===1 && (!start||today>=start)&&(!end||today<=end);
 if(!active||!['percent','fixed'].includes(row.discount_kind))return {price_pen:base/100,original_price_pen:base/100,effective_price_pen:base/100,discount:null};
 const amount=Number(row.discount_amount);
 if(!Number.isFinite(amount)||amount<=0)return {price_pen:base/100,original_price_pen:base/100,effective_price_pen:base/100,discount:null};
 const deduction=row.discount_kind==='percent'?Math.round(base*amount/100):cents(amount);
 if(deduction<=0||deduction>=base)return {price_pen:base/100,original_price_pen:base/100,effective_price_pen:base/100,discount:null};
 return {price_pen:(base-deduction)/100,original_price_pen:base/100,effective_price_pen:(base-deduction)/100,
  discount:{kind:row.discount_kind,amount,reason:row.discount_reason||'',starts_at:start,ends_at:end,saving_pen:deduction/100}};
}
export const PLAN_DISCOUNT_COLUMNS=`d.kind AS discount_kind,d.amount AS discount_amount,
 d.reason AS discount_reason,d.starts_at AS discount_starts_at,
 d.ends_at AS discount_ends_at,d.active AS discount_active`;
export function validateDiscount(price,kind,amount){
 const original=cents(price),n=Number(amount);
 if(original<100)throw new RangeError('El plan debe costar al menos S/ 1 para aplicar un descuento');
 if(!Number.isFinite(n)||n<=0||!['percent','fixed'].includes(kind))throw new RangeError('Descuento inválido');
 if(kind==='percent'&&(n>90||!Number.isInteger(n*100)))throw new RangeError('Porcentaje entre 0,01 y 90');
 if(kind==='fixed'&&(cents(n)<1||cents(n)>=original))throw new RangeError('El descuento debe estar entre S/ 0.01 y menos del precio del plan');
 if(kind==='percent'&&Math.round(original*n/100)<1)throw new RangeError('El descuento porcentual debe reducir el precio al menos S/ 0.01');
 if(kind==='fixed'&&Math.round(n*100)!==n*100 && Math.abs(Math.round(n*100)-n*100)>1e-7)throw new RangeError('Solo dos decimales');
}
