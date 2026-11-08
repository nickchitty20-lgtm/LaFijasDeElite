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
async function loadCustomerPicks(){
 const box=$('customer-picks');
 try{
  const r=await call('/api/customers/predictions',null,true);box.replaceChildren();
  for(const p of r.predictions){
   const article=document.createElement('article');article.className='customer-pick fe-research-card'+(p.locked?' is-locked':'');
   const h=document.createElement('h4');h.textContent=(p.locked?'🔒 ':'⚽ ')+p.title;article.append(h);
   const meta=document.createElement('p');meta.textContent=`${p.league||'Fútbol'} · ${p.visibility==='vip'?'VIP':'Gratis'}`;article.append(meta);
   const schedule=window.FijasMatchSchedule?.render(p.match_date,p.locked?null:p.football_details?.match_context);if(schedule)article.append(schedule);
   if(p.locked){const desc=document.createElement('p');desc.textContent='🔒 Selección, mercados y análisis ocultos. Necesitas una membresía VIP activa.';article.append(desc);
    const go=document.createElement('a');go.className='vip-unlock';go.href='#request';go.textContent='Desbloquear VIP';article.append(go);
   }else{
    if(window.FijasPickReport){article.append(window.FijasPickReport.pickInfo(p));const goalBox=window.FijasPickReport.goals(p);if(goalBox)article.append(goalBox);const advancedBox=window.FijasPickReport.advanced?.(p);if(advancedBox)article.append(advancedBox);const detail=window.FijasPickReport.analysis(p);if(detail)article.append(detail);}
    else{const desc=document.createElement('p');desc.textContent=`${p.market||''}: ${p.selection||''} · ${p.analysis||''}`;article.append(desc);}
    const status=document.createElement('span');status.className='outcome outcome-'+(p.outcome||'pending');status.textContent=({won:'Ganado',lost:'Perdido',pending:'Pendiente',void:'Anulado'})[p.outcome]||'Pendiente';article.append(status);
   }
   box.append(article);
  }
  if(!r.predictions.length)box.textContent='Todavía no hay pronósticos publicados. Los análisis en borrador no aparecen aquí hasta aprobarlos.';
 }catch(e){box.textContent=e.message;}
}
async function loadDashboard(){
 const summary=$('vip-summary'),stats=$('vip-stats'),notices=$('vip-notices');
 try{
  const r=await call('/api/customers/dashboard',null,true);
  summary.replaceChildren();stats.replaceChildren();notices.replaceChildren();
  const heading=document.createElement('div');heading.className='vip-status';heading.textContent=r.membership?(r.membership.staff_vip?'♛ VIP GRATUITO POR CARGO · SIN VENCIMIENTO':`✦ VIP ACTIVO · ${r.membership.plan} · ${r.membership.days_left} día(s) restantes`):'◇ CUENTA GRATUITA · VIP BLOQUEADO';summary.append(heading);
  const sub=document.createElement('p');sub.textContent=r.membership?(r.membership.staff_vip?'Tu acceso se mantiene mientras conserves tu cargo y la cuenta esté habilitada. No es una compra.':`Vigente hasta ${new Date(r.membership.ends_at).toLocaleDateString('es-PE',{dateStyle:'long'})}`):'Puedes consultar los pronósticos gratuitos. Activa un plan para desbloquear VIP.';summary.append(sub);
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
  if(payNav)payNav.textContent=r.membership?.staff_vip?'▣ Planes VIP':activeVip?'♛ Renovar VIP':'▣ Comprar VIP';
  if(payShortcut)payShortcut.textContent=r.membership?.staff_vip?'Consultar planes (opcional) ↗':activeVip?'Renovar mi membresía ↗':'Explorar planes VIP ↗';
  if(payHeading)payHeading.textContent=r.membership?.staff_vip?'Planes VIP · beneficio por cargo activo':activeVip?'Renovar mi membresía VIP':'Comprar membresía VIP';
  const renewNote=$('vip-renewal-note');
  if(renewNote){renewNote.hidden=!activeVip||Boolean(r.membership?.staff_vip);if(activeVip&&!r.membership?.staff_vip)renewNote.textContent=`✦ Tu VIP está activo hasta el ${new Date(r.membership.ends_at).toLocaleDateString('es-PE')}. Puedes renovarlo; la nueva duración se añadirá después de la fecha de vencimiento vigente.`;}
  const accountTier=$('client-account-tier');
  if(accountTier)accountTier.textContent=r.membership?.staff_vip?'♛ PERSONAL · VIP GRATUITO':activeVip?'♛ CLIENTE VIP ACTIVO':'◇ CUENTA GRATUITA';
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
 if(r.staff_vip){const note=document.createElement('p');note.className='vip-renewal-applied';note.textContent='♛ VIP permanente gratuito mientras mantengas tu cargo. No aparece como pago ni fecha ficticia.';area.append(note);}
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
 // La identidad debe validarse, pero otras consultas no deben ocultar el menú completo.
 await me();
 signedIn=true;
 document.querySelector('.auth-card').hidden=true;$('customer-area').hidden=false;
 document.body.classList.add('client-logged-in');
 if(pendingPayPalReturn){$('payment-method').value='paypal';updatePaymentMethod();clientTab('payments');}
 else clientTab(/^\d+$/.test(new URLSearchParams(location.search).get('plan')||'')?'payments':'overview');
 await Promise.allSettled([loadCustomerPicks(),loadDashboard(),refreshTelegramStatus(),loadNoticePreferences()]);
 if(pendingPayPalReturn)await completePayPalReturn();
}
$('signin').addEventListener('submit',async e=>{
 e.preventDefault();$('loginMsg').textContent='Comprobando acceso…';
 try{
  const r=await call('/api/login',form('signin'));
  if(r.accountType==='admin'){location.replace('/panel');return;}
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
document.querySelectorAll('[data-client-tab]').forEach(btn=>btn.addEventListener('click',()=>{clientTab(btn.dataset.clientTab);if(btn.dataset.clientTab==='notices'&&signedIn)loadNoticePreferences();}));
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
  if(session.accountType==='admin'){location.replace('/panel');return;}
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
  $('telegramLinkButton').hidden=!r.configured||r.linked||r.detached_pending||r.change_cooldown_minutes>0;
  $('telegramUnlinkButton').hidden=!r.linked||r.change_pending;
  $('telegramCheckDeparture').hidden=!r.detached_pending;
  $('telegramInviteButton').hidden=!r.configured||!r.linked||!r.has_vip||r.change_pending;
  $('telegramInviteButton').disabled=Boolean(r.is_member);
  $('telegramInviteButton').textContent=r.is_member?'✓ Ya perteneces al canal VIP':'Solicitar acceso al canal VIP';
  const changeButton=$('telegramChangeButton');
  changeButton.hidden=true; // Cambio antiguo con expulsión deshabilitado; usar desvinculación sin expulsión.
  changeButton.disabled=Boolean(r.change_pending&&r.change_reissue_minutes>0);
  changeButton.textContent=r.change_pending?'Generar otro enlace de cambio':'Cambiar mi cuenta Telegram';
  $('telegramChangeHelp').textContent=r.change_pending
   ?`Cambio pendiente: el Telegram anterior fue retirado. El enlace dura 10 minutos; para generar otro espera ${r.change_reissue_minutes||0} minuto(s).`
   :r.change_cooldown_minutes>0?`Por seguridad, el próximo cambio estará disponible en aproximadamente ${Math.ceil(r.change_cooldown_minutes/1440)} día(s). Si perdiste Telegram, solicita una excepción al dueño.`
   :r.linked?'Puedes solicitar un cambio cada 30 días. Necesitarás confirmar tu contraseña.':'';
  status.textContent=!r.configured?'El dueño todavía no configuró el bot y el canal VIP.':
   r.change_pending?'Cambio de Telegram en curso. Tu cuenta anterior ya no tiene acceso al canal. Vincula la nueva cuenta mediante el enlace generado.':
   r.detached_pending?'Telegram desvinculado: la cuenta antigua todavía tiene su plaza reservada. Puede salir del canal o el creador retirarla manualmente. No puedes vincular otra por ahora.':
   !r.linked?r.change_cooldown_minutes>0?'El Telegram anterior ya salió. Espera el plazo de seguridad de 30 días, salvo excepción autorizada por el dueño.':'Primero vincula tu Telegram para verificar tu identidad.':
   `${r.telegram_username?'@'+r.telegram_username:'Cuenta Telegram vinculada'} · ${r.is_member?'Ya perteneces al canal VIP':r.has_vip?'VIP activo: puedes solicitar acceso':'VIP no activo: renueva tu membresía para ingresar'}`;
  const group=$('telegramPublicLink');group.replaceChildren();
  const addPublicLink=(url,label)=>{
   if(!url||!/^https:\/\/t\.me\//i.test(url))return;
   const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';
   a.className='telegram-action';a.textContent=label;group.append(a);
  };
  addPublicLink(r.public_channel_url,'📢 Canal GRATIS · Pronósticos ↗');
  addPublicLink(r.public_group_url,'💬 Grupo GRATIS · Comunidad extra ↗');
  if(!group.childElementCount)group.textContent='Los enlaces públicos aparecerán cuando el dueño los configure.';
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
$('telegramChangeButton').addEventListener('click',()=>{
 $('telegramChangeForm').hidden=!$('telegramChangeForm').hidden;
});
$('telegramChangeCancel').addEventListener('click',()=>{
 $('telegramChangeForm').reset();$('telegramChangeForm').hidden=true;
});
$('telegramChangeForm').addEventListener('submit',async(event)=>{
 event.preventDefault();
 const form=event.currentTarget;
 if(!form.querySelector('[name="acknowledge"]').checked)return;
 const password=form.querySelector('[name="password"]').value;
 const button=form.querySelector('button[type="submit"]');
 button.disabled=true;$('telegramClientResult').textContent='Verificando contraseña y retirando el acceso anterior…';
 try{
  const r=await call('/api/customers/telegram/change',{password,confirm:true},true);
  form.reset();form.hidden=true;
  const out=$('telegramClientResult');out.replaceChildren();
  const a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.className='telegram-action';a.textContent='Abrir bot con el NUEVO Telegram ↗';
  out.append(a,document.createTextNode(' · Cuenta anterior expulsada. El enlace vence en 10 minutos. Después pulsa «Actualizar estado».'));
  await refreshTelegramStatus();
 }catch(error){$('telegramClientResult').textContent=error.message;}
 finally{button.disabled=false;}
});
$('telegramUnlinkButton')?.addEventListener('click',()=>{$('telegramUnlinkForm').hidden=!$('telegramUnlinkForm').hidden;});
$('telegramUnlinkCancel')?.addEventListener('click',()=>{$('telegramUnlinkForm').reset();$('telegramUnlinkForm').hidden=true;});
$('telegramUnlinkForm')?.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;
 if(!form.elements.namedItem('confirm').checked)return;
 if(!confirm('¿Desvincular SIN expulsar del canal? No podrás enlazar otro Telegram hasta que el antiguo salga y termine el plazo de seguridad.'))return;
 const button=form.querySelector('button[type="submit"]');button.disabled=true;
 $('telegramClientResult').textContent='Desvinculando sin expulsar…';
 try{
  const r=await call('/api/customers/telegram/unlink',{password:form.elements.namedItem('password').value,confirm:true},true);
  form.reset();form.hidden=true;$('telegramClientResult').textContent=r.message;
  await refreshTelegramStatus();await loadNoticePreferences();
 }catch(error){$('telegramClientResult').textContent=error.message;}finally{button.disabled=false;}
});
$('telegramCheckDeparture')?.addEventListener('click',async()=>{
 const button=$('telegramCheckDeparture');button.disabled=true;$('telegramClientResult').textContent='Consultando el estado del canal…';
 try{const r=await call('/api/customers/telegram/check-departure',{},true);$('telegramClientResult').textContent=r.message;await refreshTelegramStatus();}
 catch(error){$('telegramClientResult').textContent=error.message;}finally{button.disabled=false;}
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


// v2.0: optional DM notifications. The backend rechecks Telegram linking and account status.
async function loadNoticePreferences(){
 const status=$('noticePreferencesStatus'),form=$('noticePreferencesForm');
 try{
  const p=await call('/api/customers/notifications/preferences',null,true);
  for(const key of ['vip_enabled','expiry_enabled','picks_enabled'])form.elements.namedItem(key).checked=Boolean(p[key]);
  for(const el of form.querySelectorAll('input[type=checkbox]'))el.disabled=!p.linked;
  form.querySelector('button[type=submit]').disabled=!p.linked;
  status.textContent=p.linked?'Telegram vinculado. Los avisos son opcionales y puedes desactivarlos cuando quieras.':'Primero vincula tu Telegram en la sección Telegram VIP para recibir avisos.';
 }catch(error){status.textContent=error.message;}
}
$('noticePreferencesForm').addEventListener('submit',async(event)=>{
 event.preventDefault();const form=event.currentTarget,status=$('noticePreferencesStatus'),button=form.querySelector('button[type=submit]');
 const prefs=Object.fromEntries(['vip_enabled','expiry_enabled','picks_enabled'].map(k=>[k,form.elements.namedItem(k).checked]));
 button.disabled=true;status.textContent='Guardando preferencias…';
 try{await call('/api/customers/notifications/preferences',prefs,true);status.textContent='✓ Preferencias guardadas. Los mensajes privados se enviarán solo si los autorizaste.';}
 catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
});
