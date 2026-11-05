const $=id=>document.getElementById(id);
let token='';
let currentAdminRole='';
async function api(url,options={}){
 const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
 const data=await r.json().catch(()=>({error:'Respuesta inesperada'}));
 if(!r.ok)throw new Error(data.error||'Error de conexión');return data;
}
function show(id){for(const x of ['login','setup','dashboard'])$(x).hidden=x!==id;}
async function refreshSetup(){try{const s=await api('/api/setup/status');$('showSetup').hidden=!s.setupAvailable;}catch{$('showSetup').hidden=true;}}
$('showSetup').addEventListener('click',()=>show('setup'));
$('back').addEventListener('click',()=>show('login'));
$('setupForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;$('setupMsg').textContent='Creando cuenta...';
 const body=Object.fromEntries(new FormData(form));
 try{const r=await api('/api/auth/setup-owner',{method:'POST',body:JSON.stringify(body)});$('setupMsg').textContent=r.message;form.reset();await refreshSetup();
// One-time same-tab handoff from the unified customer/admin login.
setTimeout(()=>show('login'),1800);}catch(err){$('setupMsg').textContent=err.message;}
});
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;$('loginMsg').textContent='Comprobando acceso...';
 try{const body=Object.fromEntries(new FormData(form));const r=await api('/api/auth/login',{method:'POST',body:JSON.stringify(body)});token=r.token;form.reset();$('loginMsg').textContent='';await dashboard();}catch(err){$('loginMsg').textContent=err.message;}
});
async function dashboard(){
 try{const [me,overview]=await Promise.all([api('/api/admin/me'),api('/api/admin/overview')]);currentAdminRole=me.role;$('identity').textContent=`${me.email} · ${me.role}`;for(const key of ['users','active_memberships','pending_payments','predictions'])$(key).textContent=Number(overview.stats[key]||0).toLocaleString('es-PE');show('dashboard');$('staffPanel').hidden=me.role!=='owner';
 const pred=['owner','general_admin','analyst'].includes(me.role);
 const pay=['owner','general_admin','payments_admin'].includes(me.role);
 const clients=['owner','general_admin','payments_admin','moderator'].includes(me.role);
 const audit=['owner','general_admin'].includes(me.role);
 for(const id of ['predictionEditor','predictionHistory'])$(id).hidden=!pred;
 for(const id of ['plansPanel','paymentsPanel'])$(id).hidden=!pay;
 $('customersPanel').hidden=!clients;$('auditPanel').hidden=!audit;
 if($('paypalDiagnosticsPanel'))$('paypalDiagnosticsPanel').hidden=me.role!=='owner';if(me.role==='owner'){await loadStaff();await loadPaypalDiagnostics();}if(pred)await loadPredictions();
 if(pay)await loadCommerce();else if(clients)await loadCustomersOnly();
 if(audit)await loadAudit();initAdminNavigation();}catch(err){token='';$('loginMsg').textContent=err.message;show('login');}
}
$('logout').addEventListener('click',()=>{token='';show('login');});
refreshSetup();
const handoff=sessionStorage.getItem('fijas_admin_handoff');
if(handoff){sessionStorage.removeItem('fijas_admin_handoff');token=handoff;dashboard();}

const predictionForm=$('predictionForm');
predictionForm.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;const btn=form.querySelector('button');btn.disabled=true;
 $('predictionMsg').textContent='Publicando...';
 try{const data=Object.fromEntries(new FormData(form));const r=await api('/api/admin/predictions',{method:'POST',body:JSON.stringify(data)});
 $('predictionMsg').textContent=`Publicado #${r.id}. Telegram: ${r.telegram}.`;form.reset();await loadPredictions();await dashboard();}
 catch(err){$('predictionMsg').textContent=err.message;}finally{btn.disabled=false;}
});
async function loadPredictions(){
 const area=$('predictionList');area.replaceChildren();
 try{const {predictions}=await api('/api/admin/predictions');
 if(!predictions.length){area.textContent='Todavía no hay pronósticos.';return;}
 for(const p of predictions){const item=document.createElement('div');item.className='prediction-item';
 const title=document.createElement('strong');title.textContent=`#${p.id} ${p.title}`;item.append(title);
 const meta=document.createElement('p');meta.textContent=`${p.visibility.toUpperCase()} · ${p.market} · ${p.selection} · cuota ${p.odds} · Telegram: ${p.telegram_status}`;item.append(meta);
 const select=document.createElement('select');for(const v of ['pending','won','lost','void']){const o=document.createElement('option');o.value=v;o.textContent=({pending:'Pendiente',won:'Acertado',lost:'Fallado',void:'Anulado'})[v];select.append(o);}select.value=p.outcome;
 const button=document.createElement('button');button.className='secondary';button.textContent='Guardar resultado';button.addEventListener('click',async()=>{try{await api(`/api/admin/predictions/${p.id}/outcome`,{method:'PATCH',body:JSON.stringify({outcome:select.value})});button.textContent='Guardado';}catch(err){alert(err.message);}});
 item.append(select,button);area.append(item);}
 }catch(err){area.textContent=err.message;}
}

$('planForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{const r=await api('/api/admin/plans',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});$('planMsg').textContent=`Plan #${r.id} creado`;f.reset();await loadCommerce();}catch(err){$('planMsg').textContent=err.message;}});
async function loadCommerce(){
 for(const [id,url,key,fmt] of [['planList','/api/admin/plans','plans',x=>`#${x.id} ${x.name} · ${x.duration_days} días · S/ ${x.price_pen}`],['customerList','/api/admin/customers','users',x=>`#${x.id} ${x.display_name||''} · ${x.email}`]]){
 const el=$(id);el.replaceChildren();try{const r=await api(url);if(!r[key].length)el.textContent='Sin registros todavía';for(const x of r[key]){const d=document.createElement('p');d.textContent=fmt(x);el.append(d);}}catch(err){el.textContent=err.message;}}
 const area=$('paymentList');area.replaceChildren();try{const {payments}=await api('/api/admin/payments');if(!payments.length)area.textContent='No hay solicitudes';for(const x of payments){const d=document.createElement('div');d.className='prediction-item';const info=document.createElement('p');info.textContent=`#${x.id} ${x.email} · ${x.plan} · ${x.method} · S/ ${x.amount_pen} · Ref: ${x.external_reference} · ${x.status}`;d.append(info);if(x.status==='pending'){for(const [action,label] of [['verified','Aprobar tras verificar'],['rejected','Rechazar']]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.addEventListener('click',async()=>{if(!confirm(action==='verified'?'¿Confirmas que comprobaste el ingreso real del dinero en tu cuenta?':'¿Rechazar esta solicitud?'))return;try{await api(`/api/admin/payments/${x.id}/decision`,{method:'POST',body:JSON.stringify({decision:action})});await loadCommerce();await dashboard();}catch(err){alert(err.message);}});d.append(b);}}area.append(d);}}catch(err){area.textContent=err.message;}
}

async function loadStaff(){
 const area=$('staffList');area.replaceChildren();
 try{const {users}=await api('/api/admin/staff');
 if(!users.length){area.textContent='No hay clientes registrados.';return;}
 for(const u of users){const item=document.createElement('div');item.className='staff-row';
 const info=document.createElement('div');const name=document.createElement('strong');name.textContent=u.display_name||'Cliente';const mail=document.createElement('small');mail.textContent=u.email;info.append(name,mail);
 const select=document.createElement('select');select.setAttribute('aria-label','Rol de '+u.email);
 for(const [value,label] of [['customer','Cliente'],['general_admin','Admin general'],['payments_admin','Admin pagos'],['analyst','Analista'],['moderator','Moderador']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=u.role;
 const btn=document.createElement('button');btn.className='secondary';btn.textContent='Guardar rol';btn.addEventListener('click',async()=>{
 if(!confirm('¿Cambiar el rol de '+u.email+' a '+select.options[select.selectedIndex].text+'?'))return;
 btn.disabled=true;try{await api('/api/admin/staff/'+u.id+'/role',{method:'POST',body:JSON.stringify({role:select.value})});$('staffMsg').textContent='Rol actualizado. El cambio de permisos se aplica en el servidor.';await loadStaff();}catch(e){$('staffMsg').textContent=e.message;}finally{btn.disabled=false;}
 });item.append(info,select,btn);area.append(item);}
 }catch(e){area.textContent=e.message;}
}

async function loadCustomersOnly(){
 const area=$('customerList');area.replaceChildren();
 try{const {users}=await api('/api/admin/customers');for(const u of users){const line=document.createElement('p');line.textContent=`#${u.id} ${u.display_name||''} · ${u.email}`;area.append(line);}if(!users.length)area.textContent='Sin usuarios';}
 catch(e){area.textContent=e.message;}
}
async function loadAudit(){
 const area=$('auditList');area.replaceChildren();
 try{const {logs}=await api('/api/admin/audit');for(const log of logs){const item=document.createElement('p');item.textContent=`${new Date(log.created_at).toLocaleString('es-PE')} · ${log.actor||'Sistema'} · ${log.action} · ${log.entity_type} #${log.entity_id||'—'}`;area.append(item);}if(!logs.length)area.textContent='Sin acciones registradas';}
 catch(e){area.textContent=e.message;}
}

// Navegación de una sola sección a la vez, respetando permisos del servidor.
let activeAdminSection='overview';
function initAdminNavigation(){
 const buttons=[...document.querySelectorAll('.admin-nav button[data-section]')];
 for(const button of buttons){
  const access=button.dataset.access;
  button.hidden=Boolean(access && $(access).hidden);
 }
 if(!buttons.some(b=>b.dataset.section===activeAdminSection&&!b.hidden))activeAdminSection='overview';
 selectAdminSection(activeAdminSection);
}
function selectAdminSection(section){
 const buttons=[...document.querySelectorAll('.admin-nav button[data-section]')];
 const selected=buttons.find(b=>b.dataset.section===section&&!b.hidden);
 if(!selected)return;
 activeAdminSection=section;
 for(const b of buttons){const on=b===selected;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');}
 for(const panel of document.querySelectorAll('#dashboard [data-panel]')){
   const accessId=panel.id==='predictionHistory'?'predictionEditor':panel.id;
  const guarded=['predictionEditor','predictionHistory','plansPanel','paymentsPanel','staffPanel','customersPanel','auditPanel'].includes(panel.id);
  panel.hidden=panel.dataset.panel!==section || (panel.id==='paypalDiagnosticsPanel' && currentAdminRole!=='owner') || (guarded && !isAdminPanelAllowed(accessId));
 }
 document.querySelector('#dashboard .heading h1').textContent=({overview:'Resumen del negocio',predictions:'Gestión de pronósticos',payments:'Solicitudes de pago',plans:'Planes y precios',customers:'Clientes registrados',staff:'Gestión de personal',audit:'Historial de actividad'})[section]||'Resumen del negocio';
}
function isAdminPanelAllowed(id){const button=document.querySelector(`.admin-nav button[data-access="${id}"]`);return button&&!button.hidden;}
document.querySelectorAll('.admin-nav button[data-section]').forEach(button=>button.addEventListener('click',()=>selectAdminSection(button.dataset.section)));


// Secure operational diagnostics: only available when server verifies owner JWT.
async function loadPaypalDiagnostics(){
 const el=$('paypalDiagnosticsText');if(!el)return;
 try{
  const st=await api('/api/admin/paypal/diagnostics');
  el.textContent=st.ready?`✅ Configuración completa · ${st.mode} · versión ${st.version}. Puedes probar la conexión.`:`⚠️ Faltan estas variables en Railway: ${st.missing.join(', ')}. Versión: ${st.version}.`;
 }catch(err){el.textContent='No se pudo comprobar PayPal: '+err.message;}
}
$('paypalDiagnosticsRefresh')?.addEventListener('click',loadPaypalDiagnostics);
$('paypalDiagnosticsTest')?.addEventListener('click',async()=>{
 const el=$('paypalDiagnosticsTestResult');el.textContent='Comprobando la autenticación con PayPal…';
 try{const st=await api('/api/admin/paypal/connectivity',{method:'POST',body:'{}'});el.textContent=st.message;}
 catch(err){el.textContent=err.message;}
});
