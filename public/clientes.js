const $=id=>document.getElementById(id);let token='';
async function call(url,body,auth=false){const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'Error');return d;}
const form=id=>Object.fromEntries(new FormData($(id)));
function view(name){document.querySelectorAll('.auth-view').forEach(el=>el.hidden=el.id!==`auth-${name}`);document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));}
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>view(el.dataset.view)));
async function load(){try{const {plans}=await call('/api/plans');$('plans').replaceChildren();for(const p of plans){const o=document.createElement('option');o.value=p.id;o.textContent=`${p.name} · ${p.duration_days} días · S/ ${p.price_pen}`;$('plans').append(o);}const selected=new URLSearchParams(location.search).get('plan');if(selected && [...$('plans').options].some(o=>o.value===selected))$('plans').value=selected;}catch(e){$('requestMsg').textContent=e.message;}}
async function loadCustomerPicks(){const box=$('customer-picks');try{const r=await call('/api/customers/predictions',null,true);box.replaceChildren();for(const p of r.predictions){const article=document.createElement('article');article.className='customer-pick'+(p.locked?' is-locked':'');const h=document.createElement('h4');h.textContent=(p.locked?'🔒 ':'⚽ ')+p.title;article.append(h);const meta=document.createElement('p');meta.textContent=`${p.league||'Fútbol'} · ${p.visibility==='vip'?'VIP':'Gratis'}`;article.append(meta);const desc=document.createElement('p');desc.textContent=p.locked?'🔒 Selección y análisis totalmente ocultos. Necesitas una membresía VIP activa.':`${p.market||''}: ${p.selection||''} ${p.odds?'· Cuota '+p.odds:''} — ${p.analysis||''}`;article.append(desc);if(!p.locked){const status=document.createElement('span');status.className='outcome outcome-'+(p.outcome||'pending');status.textContent=({won:'Ganado',lost:'Perdido',pending:'Pendiente',void:'Anulado'})[p.outcome]||'Pendiente';article.append(status);}else{const go=document.createElement('a');go.className='vip-unlock';go.href='#request';go.textContent='Desbloquear VIP';article.append(go);}box.append(article);}if(!r.predictions.length)box.textContent='Todavía no hay pronósticos.';}catch(e){box.textContent=e.message;}}
async function loadDashboard(){
 const summary=$('vip-summary'),stats=$('vip-stats'),notices=$('vip-notices');
 try{
  const r=await call('/api/customers/dashboard',null,true);
  summary.replaceChildren();stats.replaceChildren();notices.replaceChildren();
  const heading=document.createElement('div');heading.className='vip-status';heading.textContent=r.membership?`✦ VIP ACTIVO · ${r.membership.plan} · ${r.membership.days_left} día(s) restantes`:'◇ CUENTA GRATUITA · VIP BLOQUEADO';summary.append(heading);
  const sub=document.createElement('p');sub.textContent=r.membership?`Vigente hasta ${new Date(r.membership.ends_at).toLocaleDateString('es-PE',{dateStyle:'long'})}`:'Puedes consultar los pronósticos gratuitos. Activa un plan para desbloquear VIP.';summary.append(sub);
  const values=[['Publicados',r.stats.total],['Ganados',r.stats.won],['Perdidos',r.stats.lost],['Pendientes',r.stats.pending]];
  for(const [label,value] of values){const tile=document.createElement('div');tile.className='vip-stat';const strong=document.createElement('strong');strong.textContent=String(value);const small=document.createElement('span');small.textContent=label;tile.append(strong,small);stats.append(tile);}
  if(!r.notices.length){notices.textContent='No tienes notificaciones nuevas.';return;}
  for(const n of r.notices){const item=document.createElement('p');item.className='vip-notice';item.textContent=n.message;notices.append(item);}
 }catch(e){summary.textContent=e.message;}
}
async function me(){const r=await call('/api/customers/me',null,true);$('memberships').replaceChildren();$('accountMsg').textContent=`Bienvenido, ${r.user.display_name}`;for(const m of r.memberships){const p=document.createElement('p');p.textContent=`${m.plan}: ${m.status} · Vence: ${m.ends_at||'pendiente'}`;$('memberships').append(p);}if(!r.memberships.length)$('memberships').textContent='Aún no tienes membresías registradas.';}
$('register').addEventListener('submit',async e=>{e.preventDefault();try{await call('/api/customers/register',form('register'));$('regMsg').textContent='Cuenta creada. Ahora inicia sesión.';view('login');$('loginMsg').textContent='Cuenta creada. Inicia sesión.';}catch(err){$('regMsg').textContent=err.message;}});
$('signin').addEventListener('submit',async e=>{e.preventDefault();try{const r=await call('/api/login',form('signin'));if(r.accountType==='admin'){sessionStorage.setItem('fijas_admin_handoff',r.token);location.replace('/admin.html');return;}token=r.token;await me();await loadCustomerPicks();await loadDashboard();document.querySelector('.auth-card').hidden=true;$('customer-area').hidden=false;document.body.classList.add('client-logged-in');if(pendingPayPalReturn){$('payment-method').value='paypal';updatePaymentMethod();clientTab('payments');await completePayPalReturn();}else clientTab('overview');}catch(err){$('loginMsg').textContent=err.message;}});
$('forgot').addEventListener('submit',async e=>{e.preventDefault();try{const r=await call('/api/customers/forgot-password',form('forgot'));$('forgotMsg').textContent=r.message;}catch(err){$('forgotMsg').textContent=err.message;}});
$('reset').addEventListener('submit',async e=>{e.preventDefault();try{await call('/api/customers/reset-password',{token:new URLSearchParams(location.search).get('reset_token'),...form('reset')});history.replaceState(null,'','/clientes.html');view('login');$('loginMsg').textContent='Contraseña actualizada. Ya puedes iniciar sesión.';}catch(err){$('resetMsg').textContent=err.message;}});
$('request').addEventListener('submit',async e=>{
 e.preventDefault();
 const msg=$('requestMsg'),btn=$('payment-submit');
 if(!token){msg.textContent='Primero inicia sesión.';return;}
 const method=$('payment-method').value;
 btn.disabled=true;msg.textContent=method==='paypal'?'Preparando checkout seguro de PayPal…':'Enviando solicitud de pago…';
 try{
  const planId=Number($('plans').value);
  if(!planId)throw Error('Selecciona un plan válido.');
  if(method==='paypal'){
   if(!paypalAvailability?.enabled)throw Error('PayPal no está habilitado todavía. El dueño debe revisar la configuración de Railway.');
   const r=await call('/api/customers/payments/paypal',{plan_id:planId},true);
   // The order is created for this customer and priced by the backend, never by the browser.
   if(!/^https:\/\//.test(r.checkout_url))throw Error('Respuesta de checkout inválida.');
   window.location.assign(r.checkout_url);
   return;
  }
  if(!['yape','plin','direct'].includes(method))throw Error('Método de pago no admitido.');
  const r=await call('/api/customers/payment-requests',{plan_id:planId,method,reference:$('payment-reference').value.trim()},true);
  msg.textContent=`Solicitud #${r.payment_id} pendiente de revisión. Guarda tu comprobante.`;
  await me();await loadCustomerPicks();await loadDashboard();
 }catch(err){msg.textContent=err.message;}
 finally{btn.disabled=false;}
});
$('logout').addEventListener('click',()=>{token='';$('customer-area').hidden=true;document.body.classList.remove('client-logged-in');document.querySelector('.auth-card').hidden=false;view('login');});
if(new URLSearchParams(location.search).has('reset_token'))view('reset');load();
// Navegación de cliente: una sección visible a la vez, sin alterar los permisos del servidor.
function clientTab(name){
 const names=['overview','predictions','membership','payments','notices'];
 if(!names.includes(name))return;
 document.querySelectorAll('[data-client-panel]').forEach(el=>{el.hidden=el.dataset.clientPanel!==name;});
 document.querySelectorAll('[data-client-tab]').forEach(btn=>{const active=btn.dataset.clientTab===name;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
 const panel=document.querySelector('[data-client-panel="'+name+'"]');
 if(panel)panel.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
document.querySelectorAll('[data-client-tab]').forEach(btn=>btn.addEventListener('click',()=>clientTab(btn.dataset.clientTab)));
document.querySelectorAll('[data-client-go]').forEach(btn=>btn.addEventListener('click',()=>clientTab(btn.dataset.clientGo)));

// One payment selector for PayPal and manual methods. Never send PayPal to the manual-review endpoint.
let paypalAvailability=null;
const paypalReturnQuery=new URLSearchParams(location.search);
const pendingPayPalReturn=paypalReturnQuery.has('paypal_return')?{
 status:paypalReturnQuery.get('paypal_return'),orderId:paypalReturnQuery.get('token')||''
}:null;
if(pendingPayPalReturn){
 view('login');
 $('loginMsg').textContent=pendingPayPalReturn.status==='success'
  ?'Inicia sesión de nuevo con tu cuenta para confirmar el pago PayPal. No necesitas volver a pagar.'
  :'Regresaste de PayPal sin confirmar un pago. Puedes iniciar sesión para intentarlo nuevamente.';
 history.replaceState(null,'',location.pathname);
}
function updatePaymentMethod(){
 const isPaypal=$('payment-method').value==='paypal';
 $('manual-payment-fields').hidden=isPaypal;
 $('paypal-payment-fields').hidden=!isPaypal;
 $('paypal-reconcile').hidden=!isPaypal;
 $('payment-reference').required=!isPaypal;
 $('payment-reference').disabled=isPaypal;
 $('payment-submit').textContent=isPaypal?'Continuar con PayPal ↗':'Enviar pago para revisión';
 $('payment-submit').disabled=isPaypal&&!paypalAvailability?.enabled;
 $('requestMsg').textContent='';
}
$('payment-method').addEventListener('change',updatePaymentMethod);
updatePaymentMethod();
async function initPayPal(){
 const info=$('paypal-status'),label=$('paypal-mode-label');
 try{
  const s=await call('/api/payments/automatic/status');
  paypalAvailability=s;
  label.textContent=s.mode==='sandbox'?'MODO DE PRUEBA · SANDBOX':'MODO LIVE';
  info.textContent=s.enabled
   ?`Disponible para ${s.mode==='sandbox'?'pagos ficticios Sandbox':'pagos reales'} · tasa referencial S/${s.pen_per_usd} por US$1. Confirma el equivalente en USD antes de aceptar.`
   :'PayPal pendiente de habilitación por el dueño. Debe revisar el diagnóstico y las variables de Railway.';
 }catch(err){paypalAvailability={enabled:false};label.textContent='NO DISPONIBLE';info.textContent='No se pudo consultar la disponibilidad de PayPal. Reintenta más tarde.';}
 updatePaymentMethod();
}
$('paypal-check').addEventListener('click',async()=>{
 const msg=$('paypal-message');
 if(!token){msg.textContent='Primero inicia sesión.';return;}
 msg.textContent='Comprobando el estado del último pago…';
 try{
  const r=await call('/api/customers/payments/paypal/check',{},true);
  msg.textContent=r.message;
  await me();await loadDashboard();await loadCustomerPicks();
 }catch(e){msg.textContent=e.message;}
});
async function completePayPalReturn(){
 if(!pendingPayPalReturn)return;
 const msg=$('paypal-message');
 if(pendingPayPalReturn.status!=='success'){
  msg.textContent='Pago PayPal cancelado o no confirmado. No se activó ninguna membresía.';
  return;
 }
 if(!/^[A-Z0-9-]{8,64}$/i.test(pendingPayPalReturn.orderId)){
  msg.textContent='No se recibió una orden válida. Pulsa «Verificar mi último pago PayPal» si completaste el pago.';
  return;
 }
 msg.textContent='Consultando PayPal y validando el cobro en el servidor…';
 try{
  const r=await call('/api/customers/payments/paypal/capture',{order_id:pendingPayPalReturn.orderId},true);
  msg.textContent=r.message;
  await me();await loadDashboard();await loadCustomerPicks();
 }catch(e){msg.textContent=e.message+' Si pagaste, usa «Verificar mi último pago PayPal»; no realices otro pago todavía.';}
}
initPayPal();
