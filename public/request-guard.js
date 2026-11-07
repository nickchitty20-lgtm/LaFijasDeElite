"use strict";
// Client-side checks are usability guards; the backend independently authorizes every request.
window.FijasSecurity=Object.freeze({
 async apiFetch(path,options={}){
  const url=new URL(path,window.location.origin);
  if(url.origin!==window.location.origin||!url.pathname.startsWith('/api/')){
   throw new Error('Ruta de API no permitida');
  }
  const method=String(options.method||'GET').toUpperCase();
  const headers=new Headers(options.headers||{});
  if(!['GET','HEAD','OPTIONS'].includes(method)){
   headers.set('Content-Type','application/json');
   // Fresh, per-session token avoids stale tokens after sign-in or account changes.
   const response=await fetch('/api/security/csrf',{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{Accept:'application/json'}
   });
   if(!response.ok)throw new Error('No se pudo verificar la seguridad de la sesión');
   const data=await response.json();
   if(data.csrfToken)headers.set('X-CSRF-Token',data.csrfToken);
  }
  return fetch(url.pathname+url.search,{
   ...options,method,headers,credentials:'same-origin',redirect:'error'
  });
 }
});
