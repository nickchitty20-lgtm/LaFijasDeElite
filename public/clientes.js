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
$('signin').addEventListener('submit',async e=>{e.preventDefault();try{const r=await call('/api/login',form('signin'));if(r.accountType==='admin'){sessionStorage.setItem('fijas_admin_handoff',r.token);location.replace('/admin.html');return;}token=r.token;await me();await loadCustomerPicks();await loadDashboard();document.querySelector('.auth-card').hidden=true;$('customer-area').hidden=false;document.body.classList.add('client-logged-in');clientTab('overview');}catch(err){$('loginMsg').textContent=err.message;}});
$('forgot').addEventListener('submit',async e=>{e.preventDefault();try{const r=await call('/api/customers/forgot-password',form('forgot'));$('forgotMsg').textContent=r.message;}catch(err){$('forgotMsg').textContent=err.message;}});
$('reset').addEventListener('submit',async e=>{e.preventDefault();try{await call('/api/customers/reset-password',{token:new URLSearchParams(location.search).get('reset_token'),...form('reset')});history.replaceState(null,'','/clientes.html');view('login');$('loginMsg').textContent='Contraseña actualizada. Ya puedes iniciar sesión.';}catch(err){$('resetMsg').textContent=err.message;}});
$('request').addEventListener('submit',async e=>{e.preventDefault();try{if(!token)throw Error('Primero inicia sesión');const r=await call('/api/customers/payment-requests',form('request'),true);$('requestMsg').textContent=`Solicitud #${r.payment_id} pendiente de revisión.`;await me();await loadCustomerPicks();await loadDashboard();}catch(err){$('requestMsg').textContent=err.message;}});
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

// PayPal hosted checkout. The browser never receives card details or API secrets.
async function initPayPal(){
 const btn=$('culqi-pay'),msg=$('culqi-msg');if(!btn)return;
 try{const st=await call('/api/payments/automatic/status');btn.disabled=!st.enabled;msg.textContent=st.enabled?`PayPal ${st.mode==='sandbox'?'Sandbox (pruebas)':'Live'} · cobro en USD, tasa referencial S/${st.pen_per_usd} por US$1.`:'PayPal pendiente de habilitación por el dueño.';}
 catch{msg.textContent='PayPal temporalmente no disponible.';}
}
$('culqi-pay')?.addEventListener('click',async()=>{
 const btn=$('culqi-pay'),msg=$('culqi-msg');if(!token){msg.textContent='Primero inicia sesión.';return;}
 const planId=Number($('plans').value);if(!planId){msg.textContent='Selecciona un plan.';return;}
 btn.disabled=true;msg.textContent='Preparando checkout seguro…';
 try{const r=await call('/api/customers/payments/paypal',{plan_id:planId},true);window.location.assign(r.checkout_url);}
 catch(e){msg.textContent=e.message;btn.disabled=false;}
});
$('mp-check')?.addEventListener('click',async()=>{
 const msg=$('culqi-msg');try{const r=await call('/api/customers/payments/paypal/check',{},true);msg.textContent=r.message;await me();await loadDashboard();await loadCustomerPicks();}catch(e){msg.textContent=e.message;}
});
initPayPal();
const paypalParams=new URLSearchParams(location.search);
if(paypalParams.has('paypal_return')){
 clientTab('payments');
 const order=paypalParams.get('token');
 if(paypalParams.get('paypal_return')==='success'&&order&&/^[A-Z0-9-]{8,64}$/i.test(order)){
  call('/api/customers/payments/paypal/capture',{order_id:order},true).then(async r=>{$('culqi-msg').textContent=r.message;await me();await loadDashboard();await loadCustomerPicks();}).catch(e=>{$('culqi-msg').textContent=e.message+' Usa «Verificar pago».';});
 }else $('culqi-msg').textContent='El pago fue cancelado o no confirmado. No se activó VIP.';
 history.replaceState(null,'',location.pathname);
}
