const $=id=>document.getElementById(id);
let currentAdminRole='';
async function api(url,options={}){
 const r=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json'}});
 const data=await r.json().catch(()=>({error:'Respuesta inesperada'}));
 if(!r.ok)throw new Error(data.error||'Error de conexión');return data;
}
// El acceso de todas las cuentas se realiza en la portada con /api/login.
// Esta pagina solo se sirve tras validar una sesion administrativa en el servidor.
function show(id){if(id==='dashboard')$('dashboard').hidden=false;}
// La navegación depende del cargo, NUNCA de si una tarjeta estaba oculta por otra pestaña.
async function dashboard(){
 let me;
 try{
  me=await api('/api/admin/me');
 }catch(err){location.replace('/');return;}
 currentAdminRole=me.role;
 $('identity').textContent=`${me.email} · ${me.role}`;
 show('dashboard');
 // Restaurar el menú de inmediato, aun si alguna consulta secundaria falla.
 initAdminNavigation();
 const pred=['owner','general_admin','analyst'].includes(me.role);
 const pay=['owner','general_admin','payments_admin'].includes(me.role);
 const clients=['owner','general_admin','payments_admin','moderator'].includes(me.role);
 const audit=['owner','general_admin'].includes(me.role);
 const jobs=[
  api('/api/admin/overview').then(overview=>{
   for(const key of ['users','active_memberships','pending_payments','predictions']){
    $(key).textContent=Number(overview.stats?.[key]||0).toLocaleString('es-PE');
   }
  }),
  loadMyTelegram()
 ];
 if(me.role==='owner')jobs.push(loadStaff(),loadPaypalDiagnostics(),loadTelegramAdmin(),loadFootballEngine());
 if(pred)jobs.push(loadPredictions());
 if(pay)jobs.push(loadCommerce(),loadVipPlans(),loadFinance());
 else if(clients)jobs.push(loadCustomersOnly());
 if(audit)jobs.push(loadAudit());
 const results=await Promise.allSettled(jobs);
 const failed=results.filter(x=>x.status==='rejected');
 if(failed.length){
  console.warn('Algunas secciones no pudieron cargar:',failed.map(x=>x.reason?.message||'error'));
  $('dashMsg').textContent='Algunos datos no pudieron actualizarse. Puedes seguir navegando por las secciones y volver a intentarlo.';
 }else{$('dashMsg').textContent='';}
 // No ocultar el dashboard completo por errores de una sección.
}
$('logout').addEventListener('click',async()=>{
 try{await api('/api/logout',{method:'POST',body:'{}'});location.replace('/');}
 catch(err){$('dashMsg').textContent='No se pudo cerrar sesión: '+err.message;}
});
// El servidor ya verifico el rol antes de servir /panel. Se vuelve a validar aqui
// y en cada endpoint sensible: el HTML nunca otorga permisos por si solo.
dashboard();

const predictionForm=$('predictionForm');
predictionForm.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;const btn=form.querySelector('button');btn.disabled=true;
 $('predictionMsg').textContent='Publicando...';
 try{const data=Object.fromEntries(new FormData(form));const r=await api('/api/admin/predictions',{method:'POST',body:JSON.stringify(data)});
 $('predictionMsg').textContent=`Publicado #${r.id}. Telegram: ${r.telegram}.`;form.reset();await loadPredictions();await dashboard();}
 catch(err){$('predictionMsg').textContent=err.message;}finally{btn.disabled=false;}
});
let showArchivedPredictions=false;
$('predictionArchivedToggle')?.addEventListener('click',async()=>{
 showArchivedPredictions=!showArchivedPredictions;
 await loadPredictions();
});
async function loadPredictions(){
 const area=$('predictionList');area.replaceChildren();
 const toggle=$('predictionArchivedToggle');
 if(toggle){toggle.hidden=currentAdminRole!=='owner';toggle.textContent=showArchivedPredictions?'Ver pronósticos activos':'Ver pronósticos retirados';}
 try{
  const {predictions}=await api('/api/admin/predictions'+(showArchivedPredictions&&currentAdminRole==='owner'?'?archived=1':''));
  if(!predictions.length){area.textContent=showArchivedPredictions?'No hay pronósticos retirados.':'Todavía no hay pronósticos.';return;}
  for(const p of predictions){
   const item=document.createElement('div');item.className='prediction-item';
   const title=document.createElement('strong');title.textContent=`#${p.id} ${p.title}`;item.append(title);
   const meta=document.createElement('p');meta.textContent=`${p.visibility.toUpperCase()} · ${p.market} · ${p.selection} · cuota ${p.odds} · Telegram: ${p.telegram_status}`;item.append(meta);
   if(showArchivedPredictions){const archived=document.createElement('p');archived.textContent=`Retirado: ${p.archived_at||'—'} · Motivo: ${p.archive_reason||'—'}`;item.append(archived);}
   else {
    const select=document.createElement('select');for(const v of ['pending','won','lost','void']){const o=document.createElement('option');o.value=v;o.textContent=({pending:'Pendiente',won:'Acertado',lost:'Fallado',void:'Anulado'})[v];select.append(o);}select.value=p.outcome;
    const button=document.createElement('button');button.className='secondary';button.textContent='Guardar resultado';button.addEventListener('click',async()=>{
     const next=select.value;
     const payload={outcome:next};
     if(next!==p.outcome && p.outcome!=='pending'){
      if(currentAdminRole!=='owner'){alert('Solo el dueño puede corregir un resultado ya cerrado.');return;}
      const reason=prompt(`Estás corrigiendo el resultado del pronóstico #${p.id}.\nIndica el motivo de la corrección (mínimo 8 caracteres):`);
      if(reason===null)return;
      if(reason.trim().length<8||reason.trim().length>350){alert('El motivo debe tener entre 8 y 350 caracteres.');return;}
      payload.reason=reason.trim();
     }
     try{await api(`/api/admin/predictions/${p.id}/outcome`,{method:'PATCH',body:JSON.stringify(payload)});p.outcome=next;button.textContent='Guardado';}
     catch(err){alert(err.message);}
    });
    item.append(select,button);
    if(currentAdminRole==='owner'){
     const del=document.createElement('button');del.type='button';del.className='secondary';del.textContent='Eliminar pronóstico';del.style.color='#ffa8a8';
     del.addEventListener('click',async()=>{
      const reason=prompt(`¿Por qué quieres retirar el pronóstico #${p.id}? (mínimo 8 caracteres)`);
      if(reason===null)return;
      if(reason.trim().length<8){alert('Indica un motivo de al menos 8 caracteres.');return;}
      if(!confirm(`¿Confirmas que quieres retirar el pronóstico #${p.id} de la web? El bot también intentará borrar sus mensajes de Telegram. Esta acción no se puede deshacer desde el panel.`))return;
      del.disabled=true;
      try{
       const result=await api(`/api/admin/predictions/${p.id}`,{method:'DELETE',body:JSON.stringify({reason:reason.trim()})});
       const tg=result.telegram||{};
       const detail=`Pronóstico #${p.id} retirado. Telegram: ${tg.removed||0} mensaje(s) eliminado(s), ${tg.failed||0} fallo(s). ${(tg.warnings||[]).join(' ')}`;
       $('predictionDeleteStatus').textContent=detail;
       await loadPredictions();await refreshPredictionSummary();
      }catch(err){$('predictionDeleteStatus').textContent=err.message;del.disabled=false;}
     });
     item.append(del);
    }
   }
   area.append(item);
  }
 }catch(err){area.textContent=err.message;}
}
async function refreshPredictionSummary(){
 try{const {stats}=await api('/api/admin/overview');$('predictions').textContent=Number(stats.predictions||0).toLocaleString('es-PE');}catch{}
}

$('planForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{const r=await api('/api/admin/plans',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});$('planMsg').textContent=`Plan #${r.id} creado`;f.reset();await loadCommerce();}catch(err){$('planMsg').textContent=err.message;}});
async function loadCommerce(){
 for(const [id,url,key,fmt] of [['planList','/api/admin/plans','plans',x=>`#${x.id} ${x.name} · ${x.duration_days} días · S/ ${x.price_pen}`],['customerList','/api/admin/customers','users',x=>`#${x.id} ${x.display_name||''} · ${x.email}`]]){
 const el=$(id);el.replaceChildren();try{const r=await api(url);if(!r[key].length)el.textContent='Sin registros todavía';for(const x of r[key]){const d=document.createElement('p');d.textContent=fmt(x);el.append(d);}}catch(err){el.textContent=err.message;}}
 const area=$('paymentList');area.replaceChildren();try{const {payments}=await api('/api/admin/payments');if(!payments.length)area.textContent='No hay solicitudes';for(const x of payments){const d=document.createElement('div');d.className='prediction-item';const info=document.createElement('p');info.textContent=`#${x.id} ${x.email} · ${x.plan} · ${x.method==='card'?'Tarjeta / pasarela':x.method} · S/ ${x.amount_pen} · Ref: ${x.external_reference} · ${x.status}`;d.append(info);if(x.status==='pending'){for(const [action,label] of [['verified','Aprobar tras verificar'],['rejected','Rechazar']]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.addEventListener('click',async()=>{if(!confirm(action==='verified'?'¿Confirmas que comprobaste el ingreso real del dinero en tu cuenta?':'¿Rechazar esta solicitud?'))return;try{await api(`/api/admin/payments/${x.id}/decision`,{method:'POST',body:JSON.stringify({decision:action})});await loadCommerce();await dashboard();}catch(err){alert(err.message);}});d.append(b);}}area.append(d);}}catch(err){area.textContent=err.message;}
}

// v1.8.8 · Manual VIP grant/revocation. Server verifies roles and calculates dates.
let vipSelectedId=null;
let vipSelectedBlocked=false;
let vipHasActive=false;
let vipConfirmedCount=0;
const vipDate=value=>value?new Date(value).toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Sin fecha';
function vipMessage(message){$('vipManageMsg').textContent=message;}
async function loadVipPlans(){
 const select=$('vipPlanSelect');select.replaceChildren();
 try{
  const {plans}=await api('/api/admin/plans');
  for(const p of plans.filter(p=>p.active)){
   const opt=document.createElement('option');opt.value=String(p.id);
   opt.textContent=`${p.name} · ${p.duration_days} días · S/${Number(p.price_pen).toFixed(2)} (asignación sin cobro)`;
   select.append(opt);
  }
  if(!select.options.length){const opt=document.createElement('option');opt.textContent='No existen planes activos';opt.value='';select.append(opt);}
 }catch(err){vipMessage('No se pudieron cargar los planes: '+err.message);}
}
$('vipSearchForm').addEventListener('submit',async e=>{
 e.preventDefault();const q=$('vipSearchInput').value.trim();const area=$('vipSearchResults');
 if(q.length<2 && !/^\d$/.test(q)){vipMessage('Escribe dos caracteres o el ID de un cliente.');return;}
 vipSelectedId=null;$('vipCustomerDetails').hidden=true;area.textContent='Buscando clientes…';vipMessage('');
 try{
  const {users}=await api('/api/admin/vip/search?q='+encodeURIComponent(q));area.replaceChildren();
  if(!users.length){area.textContent='No se encontraron clientes registrados.';return;}
  for(const u of users){
   const btn=document.createElement('button');btn.type='button';btn.className='vip-customer-choice';
   const label=document.createElement('strong');label.textContent=`${u.display_name||'Cliente'} · #${u.id}`;
   const description=document.createElement('span');description.textContent=`${u.email||'Sin correo'} · ${u.account_status==='blacklisted'?'⛔ Lista negra':u.has_vip?'VIP activo':'Cliente'}`;
   btn.append(label,description);btn.addEventListener('click',()=>loadVipCustomer(u.id));area.append(btn);
  }
 }catch(err){area.textContent='No se pudo buscar: '+err.message;}
});
async function loadVipCustomer(id){
 vipSelectedId=null;$('vipCustomerDetails').hidden=true;vipMessage('Cargando membresías…');
 try{
  const data=await api('/api/admin/vip/customers/'+encodeURIComponent(id));
  vipSelectedId=String(data.user.id);vipSelectedBlocked=data.user.account_status==='blacklisted';vipHasActive=Boolean(data.has_vip);
  vipConfirmedCount=Number(data.confirmed_count||0);
  $('vipSelectedName').textContent=data.user.display_name||'Cliente #'+data.user.id;
  $('vipSelectedEmail').textContent=`#${data.user.id} · ${data.user.email||'Sin correo'}`;
  const status=$('vipSelectedStatus');status.className='vip-status'+(vipHasActive?' vip-status-active':vipSelectedBlocked?' vip-status-blocked':'');
  status.textContent=vipSelectedBlocked?'⛔ Cuenta en lista negra':vipHasActive?`VIP ACTIVO · Vence ${vipDate(data.vip_until)}`:data.vip_until?`VIP programado · ${vipDate(data.vip_until)}`:'Sin VIP activo';
  $('vipGrantButton').disabled=vipSelectedBlocked||!$('vipPlanSelect').value;
  $('vipRevokeButton').disabled=vipConfirmedCount===0;
  const history=$('vipMembershipHistory');history.replaceChildren();
  if(!data.memberships.length)history.textContent='Este cliente todavía no tiene membresías.';
  for(const m of data.memberships){
   const row=document.createElement('div');row.className='vip-history-row';
   const title=document.createElement('strong');title.textContent=`#${m.id} · ${m.plan} · ${m.source==='manual'?'Alta manual':'Compra'}`;
   const info=document.createElement('span');info.textContent=`${m.status==='active'?'Confirmada':m.status==='pending'?'Pendiente':m.status==='cancelled'?'Cancelada':m.status} · ${vipDate(m.starts_at)} — ${vipDate(m.ends_at)}${m.paid?' · Pago verificado':''}`;
   row.append(title,info);
   if(m.status==='cancelled'&&m.revoke_reason){const why=document.createElement('small');why.textContent='Retirada: '+m.revoke_reason;row.append(why);}
   if(currentAdminRole==='owner'){
    const erase=document.createElement('button');erase.type='button';erase.className='vip-archive-button';
    erase.textContent='Eliminar esta membresía';
    erase.setAttribute('aria-label',`Eliminar membresía #${m.id} del cliente ${data.user.display_name||data.user.id}`);
    erase.addEventListener('click',async()=>{
     if(!vipSelectedId)return;
     const reason=prompt(`¿Por qué deseas eliminar la membresía #${m.id} (${m.plan})?\nEl acceso de este período se retirará. Los pagos existentes NO se borrarán ni reembolsarán.\n\nEscribe un motivo (mínimo 4 caracteres):`);
     if(reason===null)return;
     if(reason.trim().length<4||reason.trim().length>350)return vipMessage('El motivo debe tener entre 4 y 350 caracteres.');
     if(!confirm(`¿CONFIRMAS eliminar SOLO la membresía #${m.id}?\n${m.paid?'Tiene un pago verificado que se conservará.':''}\nLa operación quedará registrada en Actividad.`))return;
     erase.disabled=true;vipMessage('Eliminando membresía seleccionada…');
     const selected=vipSelectedId;
     try{
      const out=await api(`/api/admin/vip/customers/${selected}/memberships/${m.id}/archive`,{method:'POST',body:JSON.stringify({reason:reason.trim()})});
      await loadVipCustomer(selected);vipMessage('✅ '+out.message);await refreshAdminStats();
     }catch(err){vipMessage('No se pudo eliminar: '+err.message);erase.disabled=false;}
    });
    row.append(erase);
   }
   history.append(row);
  }
  $('vipCustomerDetails').hidden=false;
  vipMessage(vipSelectedBlocked?'Esta cuenta está en Rank 0. Desbloquéala en Personal antes de otorgar VIP.':data.pending_requests?`Hay ${data.pending_requests} solicitud(es) pendientes de pago que no están incluidas en el VIP confirmado.`:'');
 }catch(err){vipMessage('No se pudo cargar el cliente: '+err.message);}
}
$('vipGrantForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!vipSelectedId||vipSelectedBlocked)return;
 const planId=$('vipPlanSelect').value;const reason=$('vipGrantReason').value.trim();
 const planLabel=$('vipPlanSelect').selectedOptions[0]?.textContent||'el plan';
 if(reason.length<4)return vipMessage('Escribe el motivo (mínimo cuatro caracteres).');
 if(!confirm(`¿Asignar ${planLabel} al cliente seleccionado sin registrar un pago? Quedará anotado en Actividad.`))return;
 const button=$('vipGrantButton');button.disabled=true;vipMessage('Registrando acceso VIP…');
 try{
  const out=await api(`/api/admin/vip/customers/${vipSelectedId}/grant`,{method:'POST',body:JSON.stringify({plan_id:Number(planId),reason})});
  $('vipGrantReason').value='';await loadVipCustomer(vipSelectedId);
  vipMessage(`✅ ${out.message} Vigencia hasta: ${vipDate(out.ends_at)}.`);
  await refreshAdminStats();
 }catch(err){vipMessage('No se pudo otorgar VIP: '+err.message);}finally{button.disabled=vipSelectedBlocked;}
});
$('vipRevokeForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!vipSelectedId||vipConfirmedCount===0)return;
 const reason=$('vipRevokeReason').value.trim();if(reason.length<4)return vipMessage('Indica el motivo del retiro.');
 if(!confirm('¿CONFIRMAS retirar todas las membresías VIP vigentes y futuras de este cliente? Esto NO reembolsa pagos verificados ni cancela solicitudes pendientes.'))return;
 const button=$('vipRevokeButton');button.disabled=true;vipMessage('Retirando acceso VIP…');
 try{
  const out=await api(`/api/admin/vip/customers/${vipSelectedId}/revoke`,{method:'POST',body:JSON.stringify({reason})});
  $('vipRevokeReason').value='';await loadVipCustomer(vipSelectedId);
  vipMessage(`Acceso retirado (${out.cancelled} períodos). Pagos anteriores conservados, sin reembolsos.`);
  await refreshAdminStats();
 }catch(err){vipMessage('No se pudo retirar VIP: '+err.message);}finally{button.disabled=vipConfirmedCount===0;}
});
async function refreshAdminStats(){
 try{const {stats}=await api('/api/admin/overview');for(const key of ['users','active_memberships','pending_payments','predictions'])$(key).textContent=Number(stats[key]||0).toLocaleString('es-PE');}catch{}
}

let staffCache=[];
function renderStaff(){
 const area=$('staffList');area.replaceChildren();
 const filter=$('staffFilter')?.value||'all';
 const blacklisted=staffCache.filter(u=>u.role==='blacklist').length;
 if($('staffCount'))$('staffCount').textContent=`${blacklisted} en lista negra · ${staffCache.length} usuarios cargados`;
 const users=staffCache.filter(u=>filter==='all'||(filter==='blacklist'&&u.role==='blacklist')||(filter==='active'&&u.role!=='blacklist'));
 if(!users.length){area.textContent=filter==='blacklist'?'No hay usuarios en lista negra.':'Sin usuarios para este filtro.';return;}
 for(const u of users){
  const item=document.createElement('div');item.className='staff-row'+(u.role==='blacklist'?' staff-blacklisted':'');
  const info=document.createElement('div');info.className='staff-user';
  const name=document.createElement('strong');name.textContent=u.display_name||'Cliente';
  const mail=document.createElement('small');mail.textContent=u.email;
  const rank=document.createElement('span');rank.className='staff-rank'+(u.role==='blacklist'?' rank-zero':'');rank.textContent=u.role==='blacklist'?'⛔ RANK 0 · LISTA NEGRA':'Rango '+u.rank+' · '+({customer:'Cliente',general_admin:'Admin general',payments_admin:'Admin pagos',analyst:'Analista',moderator:'Moderador'})[u.role];
  info.append(name,mail,rank);
  if(['moderator','analyst','payments_admin','general_admin'].includes(u.role)){const benefit=document.createElement('small');benefit.textContent='♛ VIP gratuito por cargo · sin vencimiento mientras mantenga el rango';info.append(benefit);}
  if(u.role==='blacklist'&&u.blacklist_reason){const reason=document.createElement('small');reason.textContent='Motivo: '+u.blacklist_reason;info.append(reason);}
  const controls=document.createElement('div');controls.className='staff-controls';
  const select=document.createElement('select');select.setAttribute('aria-label','Rol de '+u.email);
  for(const [value,label] of [['customer','Rank 1 · Cliente'],['moderator','Rank 2 · Moderador'],['analyst','Rank 3 · Analista'],['payments_admin','Rank 4 · Admin de pagos'],['general_admin','Rank 5 · Admin general'],['blacklist','⛔ Rank 0 · Lista negra']]){
   const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
  }
  select.value=u.role;
  const reason=document.createElement('input');reason.className='staff-reason';reason.type='text';reason.maxLength=350;reason.placeholder='Motivo obligatorio de lista negra';reason.setAttribute('aria-label','Motivo de sanción');
  const syncReason=()=>{reason.hidden=select.value!=='blacklist';reason.required=select.value==='blacklist'&&u.role!=='blacklist';};
  select.addEventListener('change',syncReason);syncReason();
  const btn=document.createElement('button');btn.className='secondary';btn.textContent=u.role==='blacklist'?'Guardar / desbloquear':'Guardar cargo';
  btn.addEventListener('click',async()=>{
   if(select.value===u.role){$('staffMsg').textContent='Selecciona un cargo diferente para aplicar cambios.';return;}
   const description=select.options[select.selectedIndex].text;
   if(select.value==='blacklist'&&reason.value.trim().length<4){$('staffMsg').textContent='Escribe el motivo de la sanción (mínimo 4 caracteres).';reason.focus();return;}
   const message=select.value==='blacklist'?`¿Añadir ${u.email} a lista negra? Perderá el acceso de inmediato, incluso si tiene VIP activo.`:`¿Asignar ${description} a ${u.email}? ${u.role==='blacklist'?'Esto quitará su bloqueo.':''}`;
   if(!confirm(message))return;
   btn.disabled=true;
   try{
    const result=await api('/api/admin/staff/'+u.id+'/role',{method:'POST',body:JSON.stringify({role:select.value,...(select.value==='blacklist'?{reason:reason.value.trim()}:{})})});
    $('staffMsg').textContent=select.value==='blacklist'
     ? ('Cuenta en Rank 0. '+(result.telegram_vip?.vip_channel_blocked===false
         ? '⚠️ No se confirmó la expulsión del canal VIP. Usa Telegram → Sincronizar y revisa permisos.'
         : 'Expulsión del canal VIP solicitada; el grupo público no se modifica.'))
     : (u.role==='blacklist'
        ? ('Rank 0 retirado. '+(result.telegram_vip?.vip_channel_unblocked===true
          ? 'Telegram desbloqueado. Para entrar al canal necesita VIP y una invitación nueva.'
          : '⚠️ Desbloqueo de Telegram pendiente; entra a Telegram → Auditar y limpiar miembros conocidos.'))
        : 'Cargo actualizado y acceso restablecido según el rol.');
    await loadStaff();
   }catch(e){$('staffMsg').textContent=e.message;}finally{btn.disabled=false;}
  });
  controls.append(select,reason,btn);item.append(info,controls);area.append(item);
 }
}
async function loadStaff(){
 try{const {users}=await api('/api/admin/staff');staffCache=users;renderStaff();}
 catch(e){$('staffList').textContent=e.message;}
}
$('staffFilter')?.addEventListener('change',renderStaff);

async function loadCustomersOnly(){
 const area=$('customerList');area.replaceChildren();
 try{const {users}=await api('/api/admin/customers');for(const u of users){const line=document.createElement('p');line.textContent=`#${u.id} ${u.display_name||''} · ${u.email}`;area.append(line);}if(!users.length)area.textContent='Sin usuarios';}
 catch(e){area.textContent=e.message;}
}
async function loadAudit(){
 const area=$('auditList');area.replaceChildren();
 try{const {logs}=await api('/api/admin/audit');for(const log of logs){
  const item=document.createElement('p');
  const labels={vip_manual_granted:'VIP asignado manualmente',vip_manual_revoked:'VIP retirado manualmente'};
  let details={};try{details=typeof log.details==='string'?JSON.parse(log.details):(log.details||{});}catch{}
  const reason=typeof details.reason==='string'?' · Motivo: '+details.reason:'';
  item.textContent=`${new Date(log.created_at).toLocaleString('es-PE')} · ${log.actor||'Sistema'} · ${labels[log.action]||log.action} · ${log.entity_type} #${log.entity_id||'—'}${reason}`;
  area.append(item);
 }if(!logs.length)area.textContent='Sin acciones registradas';}
 catch(e){area.textContent=e.message;}
}

// Cada cargo ve solamente sus módulos autorizados; la navegación no depende
// de la propiedad hidden del panel (que cambia cada vez que elegimos una pestaña).
const ADMIN_SECTIONS_BY_ROLE={
 owner:['overview','predictions','performance-demo','football','payments','finance','vip','plans','customers','staff','audit','telegram','mytelegram'],
 general_admin:['overview','predictions','payments','finance','vip','plans','customers','audit','mytelegram'],
 payments_admin:['overview','payments','finance','vip','plans','customers','mytelegram'],
 analyst:['overview','predictions','mytelegram'],
 moderator:['overview','customers','mytelegram']
};
let activeAdminSection='overview';
function adminAllowedSections(){return new Set(ADMIN_SECTIONS_BY_ROLE[currentAdminRole]||['overview']);}
function initAdminNavigation(){
 const allowed=adminAllowedSections();
 for(const button of document.querySelectorAll('.admin-nav button[data-section]')){
  button.hidden=!allowed.has(button.dataset.section);
 }
 if(!allowed.has(activeAdminSection))activeAdminSection='overview';
 selectAdminSection(activeAdminSection);
}
function selectAdminSection(section){
 const allowed=adminAllowedSections();
 if(!allowed.has(section))return;
 const selected=document.querySelector(`.admin-nav button[data-section="${section}"]`);
 if(!selected)return;
 activeAdminSection=section;
 for(const button of document.querySelectorAll('.admin-nav button[data-section]')){
  const visible=allowed.has(button.dataset.section);
  button.hidden=!visible;
  const active=visible&&button===selected;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 }
 for(const panel of document.querySelectorAll('#dashboard [data-panel]')){
  const ownOnly=panel.id==='paypalDiagnosticsPanel';
  panel.hidden=panel.dataset.panel!==section||!allowed.has(panel.dataset.panel)||(ownOnly&&currentAdminRole!=='owner');
 }
 document.querySelector('#dashboard .heading h1').textContent=({overview:'Resumen del negocio',predictions:'Gestión de pronósticos',payments:'Solicitudes de pago',finance:'Finanzas y conciliación',vip:'Gestión de membresías VIP',plans:'Planes y precios',customers:'Clientes registrados',staff:'Gestión de personal',audit:'Historial de actividad',telegram:'Telegram y suscriptores VIP',mytelegram:'Mi Telegram VIP',football:'Análisis automático de fútbol','performance-demo':'Estadísticas de prueba · DEMO'})[section]||'Resumen del negocio';
}
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

// v1.9.0: finance dashboard. All text comes from textContent, never HTML from API.
async function loadFinance(){
 const summary=$('financeCards'),plans=$('financePlans'),incidents=$('financeIncidents'),unmatched=$('financeUnmatched'),msg=$('financeMsg');
 if(!summary)return;
 try{
  const r=await api('/api/admin/finance');
  for(const node of [summary,plans,incidents,unmatched])node.replaceChildren();
  const metrics=[
   ['Ventas PayPal Live (bruto)',`US$ ${Number(r.stats.live_gross_usd||0).toFixed(2)}`],
   ['Reembolsos Live',`US$ ${Number(r.stats.live_refunds_usd||0).toFixed(2)}`],
   ['Pagos Yape/Plin/banco verificados',`S/ ${Number(r.stats.manual_verified_pen||0).toFixed(2)}`],
   ['Sandbox · NO son ingresos',`US$ ${Number(r.stats.sandbox_test_gross_usd||0).toFixed(2)}`],
   ['Órdenes Live pendientes',String(r.stats.live_pending||0)],
   ['Operaciones anteriores sin entorno',String(r.stats.historical_unclassified||0)]
  ];
  for(const [name,value] of metrics){const tile=document.createElement('article');tile.className='finance-tile';const k=document.createElement('small');k.textContent=name;const v=document.createElement('strong');v.textContent=value;tile.append(k,v);summary.append(tile);}
  if(!r.byPlan.length)plans.textContent='Todavía no hay cobros PayPal Live conciliados.';
  for(const p of r.byPlan){const item=document.createElement('p');item.className='finance-line';item.textContent=`${p.plan} · ${p.payments} venta(s) · US$ ${Number(p.gross_usd).toFixed(2)} bruto`;plans.append(item);}
  if(!r.incidents.length)incidents.textContent='No se registraron reembolsos ni disputas.';
  for(const p of r.incidents){const item=document.createElement('p');item.className='finance-line';item.textContent=`${p.kind.toUpperCase()} · ${p.email} · Pago #${p.payment_id} · ${p.paypal_environment} · ${p.paypal_financial_state}${p.amount_usd!=null?' · US$ '+Number(p.amount_usd).toFixed(2):''}`;incidents.append(item);}
  if(!r.unmatched.length)unmatched.textContent='Sin eventos pendientes de revisión.';
  for(const ev of r.unmatched){const item=document.createElement('p');item.className='finance-line';item.textContent=`${ev.environment} · ${ev.event_type} · ${ev.event_id}`;unmatched.append(item);}
  msg.textContent=`Modo actual: ${r.mode.toUpperCase()}. ${r.note}`;
 }catch(err){summary.textContent='No se pudieron cargar los datos.';msg.textContent=err.message;}
}
$('financeRefresh')?.addEventListener('click',loadFinance);

// v1.9.1 Telegram owner controls. No token or webhook secret reaches the browser.
async function loadTelegramAdmin(){
 try{
  const s=await api('/api/admin/telegram');
  $('telegramAdminSetup').textContent=[s.bot_configured?'Bot ✓':'Falta bot',s.vip_channel_configured?'VIP ✓':'Falta canal',s.free_group_configured?'Grupo ✓':'Falta grupo',s.webhook_secret_configured?'Secreto ✓':'Falta secreto'].join(' · ');
  $('telegramAdminLinked').textContent=String(s.linked);
  $('telegramAdminMembers').textContent=String(s.vip_members);
  $('telegramCoverage').textContent=`Telegram informa ${s.telegram_member_count??'—'} miembros; IDs de miembros conocidos: ${s.tracked_members}. Desvinculados pendientes de salida: ${s.detached_pending}. Telegram anteriores conservados por el creador: ${s.creator_preserved??0}. El bot no puede descargar la lista total: revisa manualmente usuarios antiguos no registrados.`;
 }catch(error){$('telegramAdminResult').textContent=error.message;}
}
$('telegramOwnerUnlinkForm')?.addEventListener('submit',async event=>{
 event.preventDefault();if(currentAdminRole!=='owner')return;
 const form=event.currentTarget,msg=$('telegramOwnerUnlinkResult');
 if(!confirm('¿Desvincular sin expulsar del canal? El Telegram anterior SEGUIRÁ dentro. Se bloqueará una segunda vinculación mientras la plaza esté ocupada.'))return;
 const data=Object.fromEntries(new FormData(form));msg.textContent='Desvinculando sin expulsar…';
 try{const r=await api('/api/admin/telegram/unlink',{method:'POST',body:JSON.stringify(data)});msg.textContent=r.message;form.reset();await loadTelegramAdmin();}
 catch(error){msg.textContent=error.message;}
});
$('telegramOwnerForceUnlinkForm')?.addEventListener('submit',async event=>{
 event.preventDefault();if(currentAdminRole!=='owner')return;
 const form=event.currentTarget,msg=$('telegramOwnerForceUnlinkResult');
 if(!confirm('ATENCIÓN: el Telegram anterior NO será expulsado y podrás vincular uno nuevo. Esto permite dos miembros en el canal mientras el VIP esté activo. ¿Autorizar expresamente?'))return;
 const data=Object.fromEntries(new FormData(form));
 data.confirm_keep_old=data.confirm_keep_old==='on';
 msg.textContent='Comprobando autorización y desvinculando…';
 try{const r=await api('/api/admin/telegram/force-unlink',{method:'POST',body:JSON.stringify(data)});
  msg.textContent=r.message;form.reset();await loadTelegramAdmin();}
 catch(error){msg.textContent=error.message;}
});
$('telegramPreservedCheckForm')?.addEventListener('submit',async event=>{
 event.preventDefault();if(currentAdminRole!=='owner')return;
 const form=event.currentTarget,msg=$('telegramPreservedCheckResult');
 msg.textContent='Comprobando estado en Telegram…';
 try{const r=await api('/api/admin/telegram/check-preserved',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
  msg.textContent=r.message;if(r.released)form.reset();await loadTelegramAdmin();}
 catch(error){msg.textContent=error.message;}
});
$('telegramChangeExceptionForm').addEventListener('submit',async event=>{
 event.preventDefault();if(currentAdminRole!=='owner')return;
 const form=event.currentTarget;const msg=$('telegramChangeExceptionResult');
 if(!window.confirm('¿Autorizar una excepción al plazo de 30 días? El cliente todavía deberá introducir su contraseña.'))return;
 const data=Object.fromEntries(new FormData(form));msg.textContent='Registrando excepción…';
 try{const r=await api('/api/admin/telegram/change-exception',{method:'POST',body:JSON.stringify(data)});msg.textContent=r.message;form.reset();}
 catch(error){msg.textContent=error.message;}
});
$('telegramWebhookConfigure').addEventListener('click',async()=>{
 if(!confirm('¿Configurar el webhook HTTPS del bot con las variables de Railway?'))return;
 const msg=$('telegramAdminResult');msg.textContent='Configurando webhook…';
 try{const r=await api('/api/admin/telegram/configure',{method:'POST',body:'{}'});msg.textContent=`Webhook activo para @${r.bot_username}.`;await loadTelegramAdmin();}
 catch(error){msg.textContent=error.message;}
});
$('telegramSync').addEventListener('click',async()=>{
 const msg=$('telegramAdminResult');msg.textContent='Sincronizando canal VIP…';
 try{const r=await api('/api/admin/telegram/sync',{method:'POST',body:'{}'});msg.textContent=`IDs auditados: ${r.checked} · Mantienen acceso: ${r.kept} · Retirados: ${r.removed} · Fallos: ${r.failed} · Administradores Telegram para revisión: ${r.telegram_admins}. La auditoría cubre miembros conocidos, no toda la lista de Telegram.`;await loadTelegramAdmin();}
 catch(error){msg.textContent=error.message;}
});

// v1.9.4 · Staff's own Telegram link and VIP picks, separate from owner operations.
function renderMyTelegramLink(url,label,detail){
 const target=$('myTelegramResult');target.replaceChildren();
 const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;
 target.append(a,document.createTextNode(' · '+detail));
}
async function loadMyTelegram(){
 const msg=$('myTelegramStatus');if(!msg)return;
 try{
  const r=await api('/api/customers/telegram');
  $('myTelegramPrepare').hidden=true;
  $('myTelegramLink').hidden=Boolean(r.linked)||Boolean(r.detached_pending)||r.change_cooldown_minutes>0||!r.configured;
  $('myTelegramInvite').hidden=!r.linked||!r.has_vip||r.change_pending||!r.configured;
  $('myTelegramInvite').disabled=Boolean(r.is_member);
  $('myTelegramInvite').textContent=r.is_member?'✓ Ya estás dentro del canal':'Solicitar acceso al canal VIP';
  $('myTelegramChange').hidden=true; // Se retiró el cambio automático que expulsaba otra cuenta.
  msg.textContent=r.staff_vip?`♛ VIP por cargo · sin vencimiento. ${r.linked?'Telegram vinculado'+(r.telegram_username?' @'+r.telegram_username:''):'Telegram no vinculado'}. ${r.is_member?'Ya estás en el canal VIP.':''}`:
    (r.has_vip?'VIP pagado activo':'No tienes VIP')+' · '+(r.linked?'Telegram vinculado':'Vincula tu Telegram');
 }catch(e){
  msg.textContent=e.message;
  $('myTelegramPrepare').hidden=currentAdminRole!=='owner'||!/perfil de cliente todavía/i.test(e.message);
  $('myTelegramLink').hidden=true;$('myTelegramInvite').hidden=true;$('myTelegramChange').hidden=true;
 }
 try{
  const r=await api('/api/customers/predictions');
  const root=$('myTelegramPicks');root.replaceChildren();
  for(const p of r.predictions.filter(p=>p.visibility==='vip').slice(0,12)){
   const card=document.createElement('article');card.className='my-vip-pick';
   const h=document.createElement('strong');h.textContent=p.locked?'🔒 '+p.title:p.title;
   card.append(h);
   const schedule=window.FijasMatchSchedule?.render(p.match_date,p.locked?null:p.football_details?.match_context);if(schedule)card.append(schedule);
   if(p.locked){const body=document.createElement('p');body.textContent='Necesitas acceso VIP vigente.';card.append(body);}
   else if(window.FijasPickReport){card.append(window.FijasPickReport.pickInfo(p));const goals=window.FijasPickReport.goals(p);if(goals)card.append(goals);const adv=window.FijasPickReport.advanced?.(p);if(adv)card.append(adv);const details=window.FijasPickReport.analysis(p);if(details)card.append(details);}
   else{const body=document.createElement('p');body.textContent=p.analysis||'Sin análisis';card.append(body);}
   root.append(card);
  }
  if(!root.children.length)root.textContent='Aún no hay pronósticos VIP publicados.';
 }catch(error){$('myTelegramPicks').textContent='No se pudo consultar el contenido: '+error.message;}
}
$('myTelegramRefresh')?.addEventListener('click',loadMyTelegram);
$('myTelegramPrepare')?.addEventListener('click',async()=>{
 try{const r=await api('/api/admin/telegram/prepare-owner-profile',{method:'POST',body:'{}'});$('myTelegramResult').textContent=r.message;await loadMyTelegram();}
 catch(e){$('myTelegramResult').textContent=e.message;}
});
$('myTelegramLink')?.addEventListener('click',async()=>{
 try{const r=await api('/api/customers/telegram/link',{method:'POST',body:'{}'});renderMyTelegramLink(r.url,'Abrir bot y pulsar Iniciar ↗','Enlace personal de 10 minutos.');}
 catch(e){$('myTelegramResult').textContent=e.message;}
});
$('myTelegramInvite')?.addEventListener('click',async()=>{
 try{const r=await api('/api/customers/telegram/invite',{method:'POST',body:'{}'});renderMyTelegramLink(r.url,'Solicitar ingreso al canal VIP ↗','El bot comprobará tu Telegram y cargo.');}
 catch(e){$('myTelegramResult').textContent=e.message;}
});
$('myTelegramChange')?.addEventListener('click',()=>{$('myTelegramChangeForm').hidden=!$('myTelegramChangeForm').hidden;});
$('myTelegramChangeForm')?.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;
 if(!confirm('¿Confirmas que la cuenta antigua perderá su acceso al canal antes del cambio?'))return;
 try{
  const r=await api('/api/customers/telegram/change',{method:'POST',body:JSON.stringify({password:form.elements.password.value,confirm:true})});
  form.reset();form.hidden=true;renderMyTelegramLink(r.url,'Abrir bot en NUEVO Telegram ↗','El anterior fue retirado.');await loadMyTelegram();
 }catch(e){$('myTelegramResult').textContent=e.message;}
});


// v2.1.3 — Manual scan and detailed reasons, owner-only.
async function loadFootballEngine(){
 const summary=$('footballEngineSummary'),list=$('footballCandidateList'),message=$('footballEngineMsg');
 if(!summary||currentAdminRole!=='owner')return;
 try{
  const [status,result]=await Promise.all([api('/api/admin/football/status'),api('/api/admin/football/candidates')]);
  summary.replaceChildren();
  for(const id of ['footballImportButton','footballBacktestButton','footballSettleButton']){
   const button=$(id);if(button)button.hidden=!status.engine;
  }
  const stats=[
   ['Motor de análisis',status.engine?'N-FORCE Football Intelligence':(status.configured?'Motor clásico':'Sin configurar')],
   ...(status.engine?[['Cotejo automático de resultados',status.settlement?.working?'Comprobando…':status.settlement?.last?`${status.settlement.last.settled} actualizados · ${status.settlement.last.won} ganados · ${status.settlement.last.lost} perdidos · ${status.settlement.last.void} anulados`:'Pendiente del siguiente control'],['Sin cotejar: sin FT / mercado desconocido',status.settlement?.last?`${status.settlement.last.invalid_source} / ${status.settlement.last.unsupported}`:'—']]:[]),
   ...(status.engine?[['Partidos importados',status.total_matches||0],['Resultados históricos',status.complete_matches||0],['Última importación',status.source_import?`${status.source_import.status} · ${status.source_import.sources} registros de competición · ${status.source_import.records} registros`:'Pendiente'],['Backtesting',status.backtest?`${status.backtest.evaluated} evaluados · ${status.backtest.accuracy??'—'}% precisión observada${status.backtest.validated?'':' (muestra insuficiente, antigua o de otra versión)'}`:'Aún sin validar'],
   ['Resultados retrospectivos gratis / VIP',status.backtest?.segments?`Gratis: ${status.backtest.segments.free?.evaluated||0} pruebas · ${status.backtest.segments.free?.accuracy??'—'}% | VIP: ${status.backtest.segments.vip?.evaluated||0} pruebas · ${status.backtest.segments.vip?.accuracy??'—'}%`:'Pendiente de backtesting'],
   ['Evaluación por mercado',status.backtest?.by_market?Object.entries(status.backtest.by_market).map(([market,v])=>`${market}: ${v.evaluated} pruebas · ${v.accuracy}%`).join(' | ')||'Sin selecciones históricas validadas':'Pendiente']]:[]),
   ['Búsqueda automática',status.auto_scan?'Activada':'Desactivada'],
   ['Publicación automática',status.auto_publish?'Activada':'Solo revisión'],
   ['Telegram comunidad',status.telegram_free_ready?'Configurado':'Falta token o chat ID'],
   ['Telegram VIP',status.telegram_vip_ready?'Configurado':'Falta token o chat ID'],
   ['Estado del motor',status.scanning?'Analizando partidos…':status.publishing?'Publicando pronósticos…':'En espera'],
   ['Propuestas pendientes',status.drafts],
   ['Publicadas',status.published],
   ['Resultados ganados / perdidos',`${status.won} / ${status.lost}`],
   ['Acierto observado',status.accuracy==null?'Sin suficientes resultados':`${status.accuracy}%`],
   ['Último escaneo',status.latest?`${status.latest.status} · ${new Date(status.latest.started_at).toLocaleString('es-PE')} · ${status.latest.drafts_created||0} propuestas`:'Todavía no se ejecutó'],
   ['Programador de análisis',status.last_scheduler_message||'Todavía sin comprobaciones'],
   ['Próximo escaneo estimado',status.auto_scan?(status.scheduled_retry_at?new Date(status.scheduled_retry_at).toLocaleString('es-PE',{timeZone:'America/Lima'})+' (Perú) · '+status.scheduled_retry_reason:'Al iniciar o en el siguiente control'):'Desactivado'],
   ['Último escaneo: revisados / sin modelo / por filtros',status.latest?`${status.latest.examined||0} / ${status.latest.without_prediction||0} / ${status.latest.below_filters||0}`:'Sin datos'],
   ['Motivos de historial insuficiente',status.last_scan_report?.insufficient_reasons?JSON.stringify(status.last_scan_report.insufficient_reasons):'Pendiente de un escaneo reciente'],
   ['Propuestas existentes / borradores actualizados',status.last_scan_report?`${status.last_scan_report.already_present||0} / ${status.last_scan_report.updated_existing_drafts||0}`:'Pendiente de escaneo'],
   ['Partidos futuros sin hora exacta',status.last_scan_report?.fixtures_without_time??'Pendiente de un escaneo reciente'],
   ['Motivo de cero publicaciones',status.last_publish_report?.reason||'Mira el estado y los filtros; puede que no existan candidatos válidos'],
   ['Candidatos sin canal / sin requisitos',status.last_publish_report?`${status.last_publish_report.missing_channel||0} / ${status.last_publish_report.blocked_by_filters||0}`:'Sin comprobación'],
   ['Última publicación automática',status.last_publish_report?`${status.last_publish_report.published} publicadas · ${status.last_publish_report.failed} fallos`:'Aún sin ejecución'],
   ['Escaneos manuales disponibles hoy',status.engine?'Pausa mínima de 5 min':`${status.manual_scan?.remaining??'—'} / ${status.manual_scan?.daily_limit??2}`]
  ];
  for(const [title,value] of stats){const div=document.createElement('div');const small=document.createElement('small');small.textContent=title;const strong=document.createElement('strong');strong.textContent=String(value);div.append(small,strong);summary.append(div);}
  const scanButton=$('footballScanButton');
  if(scanButton){scanButton.disabled=!status.manual_scan?.available||!!status.scanning;
   scanButton.title=status.manual_scan?.reason||'Analiza partidos reales, guarda propuestas, no publica';}
  const allowance=$('footballScanAllowance');
  if(allowance)allowance.textContent=status.manual_scan?.available?
   `Puedes iniciar un análisis ahora. Quedan ${status.manual_scan.remaining} escaneos manuales hoy (UTC).`:
   (status.manual_scan?.reason||'Análisis en ejecución.');
  if(!status.configured)message.textContent='⚠️ Falta FOOTBALL_API_KEY en Railway.';
  else if(status.engine && !status.total_matches)message.textContent='⬇️ Importa primero los resultados deportivos con «Importar datos».';
  else if(!status.auto_scan||!status.auto_publish)message.textContent=status.engine?'⚠️ Para anunciar automáticamente, activa FOOTBALL_AUTO_SCAN=true, FOOTBALL_AUTO_PUBLISH=true y NFORCE_LIVE_RELEASE_ACK=true tras revisar el historial y el backtesting.':'⚠️ Para anunciar automáticamente, activa FOOTBALL_AUTO_SCAN=true y FOOTBALL_AUTO_PUBLISH=true en Railway.';
  else if(!status.telegram_free_ready||!status.telegram_vip_ready)message.textContent='⚠️ Revisa el token del bot y los IDs de los canales de Telegram.';
  else if(status.last_error)message.textContent='⚠️ Último error del motor: '+status.last_error;
  else if(status.latest?.status==='failed')message.textContent='⚠️ Último escaneo fallido: '+(status.latest.error_message||'Revisa los logs de Railway');
  else if(status.drafts===0&&status.latest?.status==='completed')message.textContent='ℹ️ El último escaneo terminó sin propuestas. Mira el contador de descartes y cuándo se intentará de nuevo.';
  list.replaceChildren();
  if(!result.candidates.length){list.textContent='No hay propuestas todavía. Importa datos y busca partidos. Si no hay encuentros futuros con horario confirmado, no se crearán fijas.';return;}
  for(const c of result.candidates){
   const item=document.createElement('article');item.className='football-candidate';
   const title=document.createElement('h3');title.textContent=`${c.home_team} vs ${c.away_team}`;
   const info=document.createElement('p');info.className='football-meta';info.textContent=`${c.league} · ${c.visibility.toUpperCase()} · ${c.status}`;
   const schedule=window.FijasMatchSchedule?.render(c.kickoff,c.match_context);
   const pick=document.createElement('p');pick.textContent=`Mercado: ${c.market} · Selección: ${c.selection} · ${status.engine?'Probabilidad estimada N-FORCE':'Estimación del proveedor'}: ${c.provider_probability}% (no calibrada) · Cuota: ${c.odds==null?'No disponible':c.odds}`;
   if(status.engine&&c.own_model?.quality!=null)pick.textContent+=` · Calidad del historial: ${c.own_model.quality}/100 (NO es acierto)`;
   const goals=c.goal_projection;
   item.append(title,info);
   if(goals){
    const goalBox=document.createElement('div');goalBox.className='football-goals-preview';
    const headingGoals=document.createElement('strong');headingGoals.textContent='⚽ Proyección de goles y marcador orientativo';goalBox.append(headingGoals);
    const goalRows=[
     [goals.home||'Local',goals.home_line?.label],
     [goals.away||'Visitante',goals.away_line?.label],
     ['Total',goals.total_line?.label],
    ];
    for(const [label,value] of goalRows){if(!value)continue;const line=document.createElement('p');line.textContent=`${label}: ${value}`;goalBox.append(line);}
    const score=document.createElement('p');score.className='football-score';
    score.textContent=goals.illustrative_score!=null?
      `Escenario: ${goals.illustrative_score} · Diferencia: ${goals.illustrative_margin} ${goals.illustrative_margin===1?'gol':'goles'}`:
      'Marcador exacto: sin estimación por falta de datos suficientes.';
    goalBox.append(score);
    const disclaimer=document.createElement('small');disclaimer.textContent=`Proyecciones orientativas, no garantizadas. Mercado seleccionado: ${c.market}. El marcador más probable no es una apuesta de resultado exacto.`;goalBox.append(disclaimer);
    item.append(goalBox);
   }
   if(c.advanced){
    const adv=document.createElement('div');adv.className='football-advanced-preview';
    const headline=document.createElement('strong');headline.textContent='🔎 Lesiones, alineaciones y forma';adv.append(headline);
    const statuses=c.advanced.status||{};
    const labels={available:'Datos disponibles',no_records:'Sin reportes',unavailable:'No disponible',pending:'Pendiente',partial:'Parcial'};
    for(const [label,value] of [['Bajas reportadas',statuses.injuries==='unavailable'?'Sin datos':String(c.advanced.injuries?.reported??0)],['Alineaciones',labels[statuses.lineups]||'Pendiente'],['Estadísticas temporada',labels[statuses.season]||'Sin datos']]){
     const p=document.createElement('p');p.textContent=`${label}: ${value}`;adv.append(p);
    }
    item.append(adv);
   }
   const detail=document.createElement('details');const heading=document.createElement('summary');heading.textContent='Leer análisis, datos y riesgos';const paragraph=document.createElement('p');paragraph.textContent=c.analysis;paragraph.className='football-analysis';detail.append(heading,paragraph);
   if(schedule)item.append(schedule);item.append(pick,detail);
   if(c.status==='draft'){
    const actions=document.createElement('div');actions.className='football-candidate-actions';
    const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary';refresh.textContent='🔄 Actualizar lesiones y alineaciones';refresh.hidden=Boolean(status.engine);
    refresh.addEventListener('click',async()=>{refresh.disabled=true;try{
      const r=await api(`/api/admin/football/candidates/${c.id}/refresh-advanced`,{method:'POST',body:'{}'});
      message.textContent=r.message||'Datos actualizados';await loadFootballEngine();
    }catch(error){message.textContent=error.message;refresh.disabled=false;}});actions.append(refresh);
    for(const [action,label] of [['publish','Aprobar y publicar'],['discard','Descartar']]){
     const button=document.createElement('button');button.className=action==='discard'?'secondary':'';button.textContent=label;
     button.addEventListener('click',async()=>{
      if(!confirm(action==='publish'?`¿Publicar esta selección ${c.visibility.toUpperCase()} en web y Telegram?`:'¿Descartar propuesta?'))return;
      button.disabled=true;
      try{const response=await api(`/api/admin/football/candidates/${c.id}/${action}`,{method:'POST',body:'{}'});message.textContent=action==='publish'?`Resultado: ${response.published?'publicado':'sin cambios'}. Telegram: ${response.telegram||'—'}`:'Propuesta descartada';await loadFootballEngine();if(action==='publish')await loadPredictions();}
      catch(error){message.textContent=error.message;button.disabled=false;}
     });actions.append(button);
    }
    item.append(actions);
   }
   list.append(item);
  }
 }catch(err){message.textContent=err.message;}
}
function footballDiagnosticSummary(d){
 const holder=$('footballDiagnosticResult');if(!holder)return;
 holder.hidden=false;holder.replaceChildren();
 const title=document.createElement('strong');title.textContent=d.ok?'Diagnóstico del origen y partidos disponibles':'Diagnóstico';holder.append(title);
 const items=[
  ['Conexión',d.api_connected?'Correcta':'Sin verificar'],
  ['Partidos disponibles',d.fixture_total??d.fixtures_returned??'—'],
  ['Próximos partidos con horario',d.fixtures_in_window??'—'],
  ['Predicción de muestra',d.sample?.prediction_available===true?'Disponible':d.sample?.prediction_available===false?'No disponible':'No comprobada'],
  ['Aprobación de filtros',d.sample?.passes_filters===true?'Sí':d.sample?.passes_filters===false?'No':'Sin muestra'],
 ];
 if(d.provider_requests_limit!=null)items.push(['Uso de API',`${d.provider_requests_current??'—'} / ${d.provider_requests_limit}`]);
 if(d.sample?.match)items.push(['Partido revisado',d.sample.match]);
 if(d.next_fixture)items.push(['Próximo partido detectado',`${d.next_fixture.match} · ${new Date(d.next_fixture.kickoff).toLocaleString('es-PE')}`]);
 for(const [key,value] of items){const p=document.createElement('p');const bold=document.createElement('b');bold.textContent=key+': ';p.append(bold,document.createTextNode(String(value)));holder.append(p);}
 const note=document.createElement('p');note.className='football-diagnostic-note';note.textContent=d.reason||'Prueba completada sin publicar nada.';holder.append(note);
}
$('footballTestButton')?.addEventListener('click',async()=>{
 const btn=$('footballTestButton');btn.disabled=true;$('footballEngineMsg').textContent='Comprobando datos deportivos; no se publicará nada…';
 try{const report=await api('/api/admin/football/test',{method:'POST',body:'{}'});footballDiagnosticSummary(report);$('footballEngineMsg').textContent=report.cached?'Mostrando la última prueba (sin gastar más consultas).':'Prueba completada. Revisa los resultados debajo.';}
 catch(err){$('footballEngineMsg').textContent=err.message;}finally{btn.disabled=false;}
});
function showFootballScanReport(r){
 const report=$('footballScanReport');if(!report)return;
 report.hidden=false;report.replaceChildren();
 const line=(label,value)=>{const row=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';row.append(b,document.createTextNode(String(value)));report.append(row);};
 line('Resultado',r?.message||r?.note||r?.error||'Escaneo finalizado');
 if(r?.ok){
  line('Partidos próximos analizados',r.fixtures_in_window);
  line('Partidos realmente estudiados',r.examined);
  line('Modelos calculados',r.modeled??r.qualified??'—');
  line('Propuestas nuevas guardadas',r.drafts_created);
  if(r.already_present!=null)line('Propuestas elegibles ya registradas',r.already_present);
  if(r.updated_existing_drafts!=null)line('Borradores actualizados con el nuevo modelo',r.updated_existing_drafts);
  if(r.eligible!=null)line('Propuestas elegibles (nuevas + existentes)',r.eligible);
  if(r.recently_skipped!=null)line('Partidos pausados temporalmente (ahorro API)',r.recently_skipped);
  line('Datos insuficientes',r.insufficient_history??r.without_prediction??0);
  line('Rechazados por filtros',r.below_filters);
  if(r.provider_errors!=null)line('Errores del proveedor',r.provider_errors);
  if(r.provider_calls!=null)line('Consultas de este escaneo',`${r.provider_calls} / ${r.provider_budget} presupuestadas`);
  for(const example of r.rejection_examples||[])line(typeof example==='string'?'Historial insuficiente':example.match,typeof example==='string'?example:example.reason);
  for(const example of r.filter_examples||[])line('Por debajo de los filtros',example);
  for(const warning of r.warnings||[])line('Aviso API',warning);
 }
}
$('footballScanButton')?.addEventListener('click',async()=>{
 const btn=$('footballScanButton');btn.disabled=true;
 const msg=$('footballEngineMsg');msg.textContent='Iniciando análisis estadístico de los partidos guardados…';
 try{
  const start=await api('/api/admin/football/scan',{method:'POST',body:'{}'});
  if(start.accepted){
   msg.textContent='Escaneo en curso; actualizaremos esta pantalla cuando termine.';
   // Manual requests return immediately because the provider's Free limit
   // makes a complete analysis longer than the HTTP proxy timeout.
   const until=Date.now()+10*60*1000;
   const poll=async()=>{
    try{
     const status=await api('/api/admin/football/status');
     if(status.scanning&&Date.now()<until){setTimeout(poll,10000);return;}
     if(status.scanning){msg.textContent='Escaneo aún en curso: vuelve a cargar el panel para ver el resultado.';btn.disabled=false;return;}
     showFootballScanReport(status.last_scan_report||{message:'Escaneo terminado; revisa el último registro.'});
     msg.textContent=status.last_scan_report?.note||status.last_scan_report?.message||status.last_scan_report?.error||'Escaneo terminado.';
     await loadFootballEngine();btn.disabled=false;
    }catch(error){msg.textContent='La consulta de estado falló: '+error.message;btn.disabled=false;}
   };
   setTimeout(poll,12000);
  }else{showFootballScanReport(start);btn.disabled=false;await loadFootballEngine();}
 }catch(error){msg.textContent=error.message;btn.disabled=false;}
});
$('footballReloadButton')?.addEventListener('click',loadFootballEngine);

// N-FORCE: controls are shown only when the local engine answers these routes.
$('footballImportButton')?.addEventListener('click',async()=>{
 const button=$('footballImportButton'),label=$('footballImportResult');button.disabled=true;
 label.textContent='Importando resultados y calendarios deportivos…';
 try{const r=await api('/api/admin/football/import',{method:'POST',body:'{}'});label.textContent=r.message||'Importación iniciada. Actualiza el estado.';
  setTimeout(loadFootballEngine,15000);
 }catch(e){label.textContent=e.message;}finally{button.disabled=false;}
});
$('footballBacktestButton')?.addEventListener('click',async()=>{
 const button=$('footballBacktestButton'),label=$('footballBacktestResult');button.disabled=true;
 label.textContent='Evaluando pronósticos históricos sin usar resultados futuros…';
 try{const r=await api('/api/admin/football/backtest',{method:'POST',body:'{}'});
  const byMarket=Object.entries(r.by_market||{}).map(([key,v])=>`${key}: ${v.evaluated} evaluadas · ${v.accuracy}% acierto observado`).join(' | ');
  label.textContent=`Backtesting 1X2: ${r.evaluated} partidos · ${r.accuracy??'—'}% aciertos observados · Brier ${r.brier??'—'} · ${r.validated?'Muestra general alcanzada':'Muestra general insuficiente'}. ${byMarket?'Mercados: '+byMarket+'.':'Sin selecciones por mercado validadas.'}`;
  await loadFootballEngine();
 }catch(e){label.textContent=e.message;}finally{button.disabled=false;}
});

// N-FORCE: reconcile only published fixture-linked predictions with trusted FT data.
$('footballSettleButton')?.addEventListener('click',async()=>{
 const button=$('footballSettleButton'),label=$('footballSettleResult');button.disabled=true;label.textContent='Comparando pronósticos pendientes con marcadores finales importados…';
 try{const r=await api('/api/admin/football/settle',{method:'POST',body:'{}'});
  label.textContent=r.busy?'Ya hay una comprobación en curso.':`Comprobados: ${r.reviewed} · Actualizados: ${r.settled} · Ganadas: ${r.won} · Perdidas: ${r.lost} · Anuladas: ${r.void} · Sin marcador reciente verificable: ${r.invalid_source} · Mercado no reconocible: ${r.unsupported}.`;
  await loadFootballEngine();await loadPredictions();
 }catch(e){label.textContent=e.message;}finally{button.disabled=false;}
});
