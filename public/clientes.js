const $=id=>document.getElementById(id);let signedIn=false;
async function call(url,body,auth=false){
 const r=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);
 if(!r.ok){
  const message=(data&&typeof data.error==='string'&&data.error)||
   (r.status===429?'Demasiadas solicitudes. Espera unos minutos antes de volver a intentarlo.':
    r.status===503?'Servicio temporalmente no disponible. Intenta más tarde.':
    'No se pudo completar la solicitud (HTTP '+r.status+').');
  throw Error(message);
 }
 if(!data||typeof data!=='object')throw Error('El servidor devolvió una respuesta no válida. Actualiza la página e inténtalo nuevamente.');
 return data;
}
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
  if(r.membership?.renewals_scheduled>0){
   const renewal=document.createElement('p');renewal.className='vip-renewal-applied';
   renewal.textContent=`✓ Renovación confirmada: ${r.membership.renewals_scheduled} plan(es) adicional(es) incluido(s) en esta fecha de vencimiento.`;
   summary.append(renewal);
  }
  // A VIP client sees a renewal flow; the server remains the only authority on VIP status.
  const activeVip=Boolean(r.membership);
  const payNav=document.querySelector('[data-client-tab="payments"]');
  const payShortcut=document.querySelector('[data-client-go="payments"]');
  const payHeading=document.querySelector('[data-client-panel="payments"] .client-section-heading h3');
  if(payNav)payNav.textContent=activeVip?'♛ Renovar VIP':'▣ Comprar VIP';
  if(payShortcut)payShortcut.textContent=activeVip?'Renovar mi membresía ↗':'Explorar planes VIP ↗';
  if(payHeading)payHeading.textContent=activeVip?'Renovar mi membresía VIP':'Comprar membresía VIP';
  const renewNote=$('vip-renewal-note');
  if(renewNote){renewNote.hidden=!activeVip;if(activeVip)renewNote.textContent=`✦ Tu VIP está activo hasta el ${new Date(r.membership.ends_at).toLocaleDateString('es-PE')}. Puedes renovarlo; la nueva duración se añadirá después de la fecha de vencimiento vigente.`;}
  const accountTier=$('client-account-tier');
  if(accountTier)accountTier.textContent=activeVip?'♛ CLIENTE VIP ACTIVO':'◇ CUENTA GRATUITA';
  const values=[['Publicados',r.stats.total],['Ganados',r.stats.won],['Perdidos',r.stats.lost],['Pendientes',r.stats.pending]];
  for(const [label,value] of values){const tile=document.createElement('div');tile.className='vip-stat';const strong=document.createElement('strong');strong.textContent=String(value);const small=document.createElement('span');small.textContent=label;tile.append(strong,small);stats.append(tile);}
  if(!r.notices.length){notices.textContent='No tienes notificaciones nuevas.';return;}
  for(const n of r.notices){const item=document.createElement('p');item.className='vip-notice';item.textContent=n.message;notices.append(item);}
 }catch(e){summary.textContent=e.message;}
}
function membershipDate(value){return value?new Date(value).toLocaleDateString('es-PE',{dateStyle:'medium'}):'Sin fecha';}
function createMembershipCard(m,label){
 const card=document.createElement('article');card.className='membership-card';
 const title=document.createElement('strong');title.textContent=m.plan;
 const state=document.createElement('span');state.className='membership-status';state.textContent=label;
 const dates=document.createElement('p');
 dates.textContent=m.status==='pending'?'Pendiente de confirmación del pago':`Inicio: ${membershipDate(m.starts_at)} · Vencimiento: ${membershipDate(m.ends_at)}`;
 card.append(title,state,dates);return card;
}
function appendMembershipGroup(root,title,items,{collapse=false,emptyText='',labelFn=()=>''}={}){
 const section=collapse?document.createElement('details'):document.createElement('section');
 section.className='membership-group';
 const heading=document.createElement(collapse?'summary':'h4');heading.textContent=`${title} (${items.length})`;section.append(heading);
 if(!items.length){const empty=document.createElement('p');empty.className='membership-empty';empty.textContent=emptyText||'Sin registros';section.append(empty);}
 else{const cards=document.createElement('div');cards.className='membership-cards';for(const m of items)cards.append(createMembershipCard(m,labelFn(m)));section.append(cards);}
 root.append(section);
}
async function me(){
 const r=await call('/api/customers/me',null,true);
 const area=$('memberships');area.replaceChildren();$('accountMsg').textContent=`Bienvenido, ${r.user.display_name||'cliente'}`;
 const now=Date.now();
 const active=[],future=[],pending=[],past=[];
 for(const m of r.memberships){
  const start=m.starts_at?new Date(m.starts_at).getTime():0;
  const end=m.ends_at?new Date(m.ends_at).getTime():0;
  if(m.status==='pending'){pending.push(m);continue;}
  if(m.status==='active'&&end>now&&start<=now){active.push(m);continue;}
  if(m.status==='active'&&end>now&&start>now){future.push(m);continue;}
  past.push(m);
 }
 appendMembershipGroup(area,'VIP activo',active,{labelFn:()=>'Vigente',emptyText:'No tienes un período VIP activo.'});
 appendMembershipGroup(area,'Renovaciones confirmadas',future,{labelFn:()=>'Confirmada · Próxima',emptyText:'Aún no tienes renovaciones futuras.'});
 appendMembershipGroup(area,'Solicitudes pendientes',pending,{collapse:true,labelFn:()=>'Pendiente de revisión',emptyText:'No hay solicitudes pendientes.'});
 appendMembershipGroup(area,'Historial anterior',past,{collapse:true,labelFn:m=>m.status==='cancelled'?'Cancelada':m.status==='expired'?'Expirada':'Finalizada',emptyText:'Sin períodos anteriores.'});
}

$('register').addEventListener('submit',async e=>{e.preventDefault();try{await call('/api/customers/register',form('register'));$('regMsg').textContent='Cuenta creada. Ahora inicia sesión.';view('login');$('loginMsg').textContent='Cuenta creada. Inicia sesión.';}catch(err){$('regMsg').textContent=err.message;}});
async function enterCustomerPanel(){
 await me();await loadCustomerPicks();await loadDashboard();await refreshTelegramStatus();
 signedIn=true;
 document.querySelector('.auth-card').hidden=true;$('customer-area').hidden=false;
 document.body.classList.add('client-logged-in');
 if(pendingPayPalReturn){$('payment-method').value='paypal';updatePaymentMethod();clientTab('payments');await completePayPalReturn();}
 else clientTab('overview');
}
$('signin').addEventListener('submit',async e=>{
 e.preventDefault();$('loginMsg').textContent='Comprobando acceso…';
 try{
  const r=await call('/api/login',form('signin'));
  if(r.accountType==='admin'){location.replace('/admin.html');return;}
  await enterCustomerPanel();$('loginMsg').textContent='';
 }catch(err){$('loginMsg').textContent=err.message;}
});
$('forgot').addEventListener('submit',async e=>{e.preventDefault();try{const r=await call('/api/customers/forgot-password',form('forgot'));$('forgotMsg').textContent=r.message;}catch(err){$('forgotMsg').textContent=err.message;}});
$('reset').addEventListener('submit',async e=>{e.preventDefault();try{await call('/api/customers/reset-password',{token:new URLSearchParams(location.search).get('reset_token'),...form('reset')});history.replaceState(null,'','/clientes.html');view('login');$('loginMsg').textContent='Contraseña actualizada. Ya puedes iniciar sesión.';}catch(err){$('resetMsg').textContent=err.message;}});
$('request').addEventListener('submit',async e=>{
 e.preventDefault();
 const msg=$('requestMsg'),btn=$('payment-submit');
 if(!signedIn){msg.textContent='Primero inicia sesión.';return;}
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
$('logout').addEventListener('click',async()=>{try{await call('/api/logout',{});}catch(e){$('loginMsg').textContent='No se pudo cerrar sesión, intenta de nuevo.';return;}signedIn=false;$('customer-area').hidden=true;document.body.classList.remove('client-logged-in');document.querySelector('.auth-card').hidden=false;view('login');});
if(new URLSearchParams(location.search).has('reset_token'))view('reset');load();
// Navegación de cliente: una sección visible a la vez, sin alterar los permisos del servidor.
function clientTab(name){
 const names=['overview','predictions','membership','payments','telegram','notices'];
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
  ?'Volviste de PayPal. Confirmaremos tu pago automáticamente si tu sesión sigue activa.'
  :'Regresaste de PayPal sin completar el pago. No se ha activado VIP.';
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
 $('paypal-check').disabled=!isPaypal||!paypalAvailability?.enabled;
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
 if(!signedIn){msg.textContent='Primero inicia sesión.';return;}
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
// Resume a valid cookie session automatically, including after returning from PayPal.
async function resumeCustomerSession(){
 if(new URLSearchParams(location.search).has('reset_token'))return;
 try{
  const session=await call('/api/session');
  if(session.accountType==='admin'){location.replace('/admin.html');return;}
  if(session.authenticated && session.accountType==='customer')await enterCustomerPanel();
 }catch(err){$('loginMsg').textContent='Tu sesión no pudo restaurarse. Inicia sesión para continuar.';}
}
resumeCustomerSession();

// v1.9.1 · Verified Telegram linking and VIP join-request workflow.
async function refreshTelegramStatus(){
 const status=$('telegramAccountStatus');
 if(!status)return;
 try{
  const r=await call('/api/customers/telegram');
  $('telegramLinkButton').hidden=!r.configured||r.linked;
  $('telegramInviteButton').hidden=!r.configured||!r.linked||!r.has_vip;
  $('telegramInviteButton').disabled=Boolean(r.is_member);
  $('telegramInviteButton').textContent=r.is_member?'✓ Ya perteneces al canal VIP':'Solicitar acceso al canal VIP';
  status.textContent=!r.configured?'El dueño todavía no configuró el bot y el canal VIP.':
   !r.linked?'Primero vincula tu Telegram para verificar tu identidad.':
   `${r.telegram_username?'@'+r.telegram_username:'Cuenta Telegram vinculada'} · ${r.is_member?'Ya perteneces al canal VIP':r.has_vip?'VIP activo: puedes solicitar acceso':'VIP no activo: renueva tu membresía para ingresar'}`;
  const group=$('telegramPublicLink');group.replaceChildren();
  if(r.public_group_url && /^https:\/\/t\.me\//i.test(r.public_group_url)){
   const a=document.createElement('a');a.href=r.public_group_url;a.target='_blank';a.rel='noopener noreferrer';a.className='telegram-action';a.textContent='Abrir comunidad pública ↗';group.append(a);
  }else group.textContent='El dueño compartirá el enlace del grupo público.';
 }catch(error){status.textContent=error.message;}
}
$('telegramLinkButton').addEventListener('click',async()=>{
 const button=$('telegramLinkButton');button.disabled=true;$('telegramClientResult').textContent='Preparando enlace de vinculación…';
 try{
  const r=await call('/api/customers/telegram/link',{},true);
  const out=$('telegramClientResult');out.replaceChildren();
  const link=document.createElement('a');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';link.className='telegram-action';link.textContent='Abrir el bot y pulsar Iniciar ↗';
  out.append(link,document.createTextNode(' · El enlace vence en 10 minutos. Después pulsa «Actualizar estado».'));
 }catch(error){$('telegramClientResult').textContent=error.message;}
 finally{button.disabled=false;}
});
$('telegramInviteButton').addEventListener('click',async()=>{
 const button=$('telegramInviteButton');button.disabled=true;$('telegramClientResult').textContent='Generando solicitud VIP…';
 try{
  const r=await call('/api/customers/telegram/invite',{},true);
  const out=$('telegramClientResult');out.replaceChildren();
  const link=document.createElement('a');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';link.className='telegram-action';link.textContent='Abrir invitación al canal VIP ↗';
  out.append(link,document.createTextNode(' · El bot aprobará tu solicitud si la haces desde tu cuenta vinculada.'));
 }catch(error){$('telegramClientResult').textContent=error.message;}
 finally{button.disabled=false;}
});
$('telegramRefreshButton').addEventListener('click',refreshTelegramStatus);
