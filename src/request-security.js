import crypto from 'node:crypto';

// Security policy is enforced on the server, not by hiding routes in the browser.
export const SESSION_COOKIE_NAME='fijas_session';
export const MUTATING_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
const CSRF_LABEL='fijas-de-elite:csrf:v1:';

export function readCookie(header,name=SESSION_COOKIE_NAME){
 if(typeof header!=='string'||header.length>8192)return null;
 const item=header.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='));
 if(!item)return null;
 try{return decodeURIComponent(item.slice(name.length+1));}catch{return null;}
}
export function csrfForCookie(sessionCookie,secret){
 if(!sessionCookie||!secret)return null;
 return crypto.createHmac('sha256',secret).update(CSRF_LABEL).update(sessionCookie).digest('hex');
}
export function verifyCsrfHeader(sessionCookie,secret,received){
 if(typeof received!=='string'||!/^[a-f0-9]{64}$/.test(received))return false;
 const expected=csrfForCookie(sessionCookie,secret);
 return Boolean(expected)&&crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(received,'hex'));
}
export function evaluateApiRequest({method,requestOrigin,headers={},sessionCookie,secret,path}){
 const normalizedMethod=String(method||'').toUpperCase();
 if(!MUTATING_METHODS.has(normalizedMethod))return {ok:true};
 // JSON-only mutations prevent form-based CSRF and accidental parsing inconsistencies.
 if(!/^application\/json(?:\s*;|\s*$)/i.test(String(headers['content-type']||'')))
  return {ok:false,status:415,error:'Envía los datos como application/json',code:'JSON_REQUIRED'};
 const site=String(headers['sec-fetch-site']||'').toLowerCase();
 if(site==='cross-site'||site==='same-site')
  return {ok:false,status:403,error:'Solicitud desde otro sitio rechazada',code:'CROSS_SITE_REQUEST'};
 const origin=headers.origin;
 if(origin){
  if(origin!==requestOrigin)return {ok:false,status:403,error:'Origen de solicitud no autorizado',code:'INVALID_ORIGIN'};
 }else if(sessionCookie){
  let refererOrigin=null;
  try{if(headers.referer)refererOrigin=new URL(headers.referer).origin;}catch{}
  // Some privacy-conscious clients remove Origin/Referer. Accept Sec-Fetch-Site=same-origin.
  if(refererOrigin!==requestOrigin&&site!=='same-origin')
   return {ok:false,status:403,error:'No se pudo verificar el origen de la solicitud',code:'ORIGIN_REQUIRED'};
 }
 // A custom header tied to the HttpOnly session blocks forged cookie-auth requests.
 // For public login/register with no session, strict Origin / JSON are still enforced.
 if(sessionCookie&&!verifyCsrfHeader(sessionCookie,secret,headers['x-csrf-token']))
  return {ok:false,status:403,error:'Verificación de seguridad vencida. Actualiza la página e inténtalo nuevamente.',code:'CSRF_INVALID'};
 return {ok:true};
}
