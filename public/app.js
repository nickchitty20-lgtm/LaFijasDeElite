const $=id=>document.getElementById(id);
let currentAdminRole='';
const ADMIN_PANEL_BUILD='3.8.2';
// Diagnose a partial/old Railway deployment instead of silently rendering stale UI.
async function checkAdminBuild(){
 const label=$('adminBuildVersion'),status=$('adminBuildStatus');
 if(label)label.textContent='Panel JS v'+ADMIN_PANEL_BUILD;
 try{
  const response=await fetch('/health',{cache:'no-store',credentials:'same-origin'});
  const server=await response.json();
  const deployed=String(server.version||'desconocida');
  if(status){status.textContent=deployed===ADMIN_PANEL_BUILD
   ?'✓ Panel actualizado · v'+ADMIN_PANEL_BUILD+' · Horarios en hora de Perú'
   :'⚠️ Versión distinta: servidor v'+deployed+' / navegador v'+ADMIN_PANEL_BUILD+'. Recarga sin caché y revisa el despliegue.';
   status.dataset.buildMatch=String(deployed===ADMIN_PANEL_BUILD);}
 }catch{if(status)status.textContent='No se pudo verificar la versión desplegada. Prueba recargar la página.';}
}
// Fallback independent of the live-schedule helper; never shows an unverified countdown.
function fallbackAdminKickoff(value){
 const row=document.createElement('p');row.className='fe-kickoff-missing';
 if(!value){row.textContent='🗓 Inicio del partido: horario no disponible';return row;}
 const raw=String(value).trim(),normalized=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)?raw.replace(' ','T')+'Z':raw;
 const dt=new Date(normalized);
 if(!Number.isFinite(dt.getTime())){row.textContent='🗓 Inicio del partido: horario no disponible';return row;}
 row.textContent='🗓 Inicio programado: '+new Intl.DateTimeFormat('es-PE',{
  timeZone:'America/Lima',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
 }).format(dt)+' (Perú) · Horario sin confirmar en vivo';
 return row;
}

async function api(url,options={}){
 const r=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json'}});
 const data=await r.json().catch(()=>({error:'Respuesta inesperada'}));
 if(!r.ok)throw new Error(data.error||'Error de conexión');return data;
}
checkAdminBuild();
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
   const meta=document.createElement('p');meta.textContent=`${p.visibility.toUpperCase()} · ${p.market} · ${p.selection} · cuota ${p.odds??'No disponible'} · Telegram: ${p.telegram_status}`;item.append(meta);
   // El inicio del PARTIDO (no la fecha de publicación) ya viene de MySQL en UTC.
   // Una hora vencida no implica un resultado final confirmado.
   const storedKickoff=p.match_kickoff_utc||p.match_date;
   const kickoff=window.FijasMatchSchedule?.render(storedKickoff,{prediction_id:p.id});
   if(kickoff)item.append(kickoff);
   else item.append(fallbackAdminKickoff(storedKickoff));
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

// Promotional tariffs: dedicated owner-only controls, no changes to historical invoices.
async function loadPlanDiscounts(plans){
 const select=$('discountPlanSelect');select.replaceChildren();
 const form=$('planDiscountForm');if(!form)return;
 const isOwner=currentAdminRole==='owner';form.querySelectorAll('input,select,button').forEach(control=>control.disabled=!isOwner);
 $('discountMsg').textContent=isOwner?'Promociones para nuevas ventas. Las compras anteriores no cambian.':'Solo el propietario puede modificar descuentos.';
 for(const plan of plans.filter(p=>p.active)){
  const option=document.createElement('option');option.value=String(plan.id);
  option.textContent=`${plan.tier.toUpperCase()} · ${plan.name} · ${plan.duration_days} días · S/ ${Number(plan.price_pen).toFixed(2)}`;
  select.append(option);
 }
 const list=$('planList');list.replaceChildren();
 for(const plan of plans){
  const item=document.createElement('div');item.className='discount-plan-row';
  const label=document.createElement('p');
  const campaign=plan.discount;
  label.textContent=`#${plan.id} ${plan.name} · ${plan.duration_days} días · S/ ${Number(plan.price_pen).toFixed(2)}`+
   (campaign?` → S/ ${Number(plan.effective_price_pen).toFixed(2)} · ${campaign.reason}${campaign.ends_at?' · hasta '+campaign.ends_at:''}`:plan.discount_active?` · Promoción fuera de vigencia (${plan.discount_reason||'sin motivo'} · ${plan.discount_starts_at||'inicio libre'} a ${plan.discount_ends_at||'sin límite'})`:' · Precio normal');
  item.append(label);
  if(isOwner&&plan.discount_active){
   const stop=document.createElement('button');stop.type='button';stop.className='secondary';stop.textContent='Finalizar descuento';
   stop.addEventListener('click',async()=>{
    const reason=prompt('Motivo para retirar este descuento (mínimo cinco caracteres):');
    if(reason===null)return;if(reason.trim().length<5)return void ($('discountMsg').textContent='Debes indicar un motivo de al menos cinco caracteres.');
    if(!confirm('¿Desactivar la promoción de este plan para nuevas compras?'))return;
    stop.disabled=true;
    try{await api(`/api/admin/plans/${plan.id}/discount`,{method:'DELETE',body:JSON.stringify({reason:reason.trim()})});await loadCommerce();}
    catch(e){$('discountMsg').textContent=e.message;stop.disabled=false;}
   });item.append(stop);
  }
  list.append(item);
 }
}
$('planDiscountForm').addEventListener('submit',async e=>{
 e.preventDefault();if(currentAdminRole!=='owner')return;
 const planId=$('discountPlanSelect').value,kind=$('discountKind').value,amount=Number($('discountAmount').value);
 const reason=$('discountReason').value.trim(),starts_at=$('discountStart').value||null,ends_at=$('discountEnd').value||null;
 if(!planId||reason.length<5)return void ($('discountMsg').textContent='Selecciona plan e indica el motivo.');
 if(starts_at&&ends_at&&starts_at>ends_at)return void ($('discountMsg').textContent='Fecha final anterior a la inicial.');
 if(!confirm('¿Aplicar esta promoción a todas las NUEVAS compras del plan seleccionado?'))return;
 try{const r=await api(`/api/admin/plans/${planId}/discount`,{method:'POST',body:JSON.stringify({kind,amount,reason,starts_at,ends_at})});
   $('discountMsg').textContent='✅ '+r.message;await loadCommerce();}
 catch(error){$('discountMsg').textContent=error.message;}
});
$('planForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{const r=await api('/api/admin/plans',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});$('planMsg').textContent=`Plan #${r.id} creado`;f.reset();await loadCommerce();}catch(err){$('planMsg').textContent=err.message;}});
async function loadCommerce(){
 for(const [id,url,key,fmt] of [['customerList','/api/admin/customers','users',x=>`#${x.id} ${x.display_name||''} · ${x.email}`]]){
 const el=$(id);el.replaceChildren();try{const r=await api(url);if(!r[key].length)el.textContent='Sin registros todavía';for(const x of r[key]){const d=document.createElement('p');d.textContent=fmt(x);el.append(d);}}catch(err){el.textContent=err.message;}}
 try{const {plans}=await api('/api/admin/plans');await loadPlanDiscounts(plans);}catch(error){$('discountMsg').textContent=error.message;}
 const area=$('paymentList');area.replaceChildren();try{const {payments}=await api('/api/admin/payments');if(!payments.length)area.textContent='No hay solicitudes';for(const x of payments){const d=document.createElement('div');d.className='prediction-item';const info=document.createElement('p');info.textContent=`#${x.id} ${x.email} · ${x.plan} · ${x.method==='card'?'Tarjeta / pasarela':x.method} · S/ ${x.amount_pen} · Ref: ${x.external_reference} · ${x.status}`;d.append(info);if(x.status==='pending'){for(const [action,label] of [['verified','Aprobar tras verificar'],['rejected','Rechazar']]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.addEventListener('click',async()=>{if(!confirm(action==='verified'?'¿Confirmas que comprobaste el ingreso real del dinero en tu cuenta?':'¿Rechazar esta solicitud?'))return;try{await api(`/api/admin/payments/${x.id}/decision`,{method:'POST',body:JSON.stringify({decision:action})});await loadCommerce();await dashboard();}catch(err){alert(err.message);}});d.append(b);}}area.append(d);}}catch(err){area.textContent=err.message;}
}

// v1.8.8 · Manual VIP grant/revocation. Server verifies roles and calculates dates.
let vipSelectedId=null;
let vipSelectedBlocked=false;
let vipHasActive=false;
let vipConfirmedCount=0;
let vipGoldConfirmedCount=0;
const vipDate=value=>value?new Date(value).toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Sin fecha';
function vipMessage(message){$('vipManageMsg').textContent=message;}
async function loadVipPlans(){
 const select=$('vipPlanSelect');select.replaceChildren();
 try{
  const {plans}=await api('/api/admin/plans');
  for(const p of plans.filter(p=>p.active && ['vip','gold'].includes(p.tier))){
   const opt=document.createElement('option');opt.value=String(p.id);
   opt.textContent=`${p.tier.toUpperCase()} · ${p.name} · ${p.duration_days} días (asignación sin cobro)`;
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
   const description=document.createElement('span');description.textContent=`${u.email||'Sin correo'} · ${u.account_status==='blacklisted'?'⛔ Lista negra':u.has_vip?'VIP activo':u.has_gold?'GOLD activo':'Cliente'}`;
   btn.append(label,description);btn.addEventListener('click',()=>loadVipCustomer(u.id));area.append(btn);
  }
 }catch(err){area.textContent='No se pudo buscar: '+err.message;}
});
async function loadVipCustomer(id){
 vipSelectedId=null;$('vipCustomerDetails').hidden=true;vipMessage('Cargando membresías…');
 try{
  const data=await api('/api/admin/vip/customers/'+encodeURIComponent(id));
  vipSelectedId=String(data.user.id);vipSelectedBlocked=data.user.account_status==='blacklisted';vipHasActive=Boolean(data.has_vip);
  vipConfirmedCount=Number(data.confirmed_count||0);vipGoldConfirmedCount=Number(data.gold_confirmed_count||0);
  $('vipSelectedName').textContent=data.user.display_name||'Cliente #'+data.user.id;
  $('vipSelectedEmail').textContent=`#${data.user.id} · ${data.user.email||'Sin correo'}`;
  const status=$('vipSelectedStatus');status.className='vip-status'+(vipHasActive?' vip-status-active':vipSelectedBlocked?' vip-status-blocked':'');
  status.textContent=vipSelectedBlocked?'⛔ Cuenta en lista negra':`VIP: ${data.vip_until?vipDate(data.vip_until):'sin acceso'} · GOLD: ${data.gold_until?vipDate(data.gold_until):'sin acceso'}`;
  $('vipGrantButton').disabled=vipSelectedBlocked||!$('vipPlanSelect').value;
  $('vipRevokeButton').disabled=($('vipRevokeTier').value==='vip'?vipConfirmedCount:vipGoldConfirmedCount)===0;
  const history=$('vipMembershipHistory');history.replaceChildren();
  if(!data.memberships.length)history.textContent='Este cliente todavía no tiene membresías.';
  for(const m of data.memberships){
   const row=document.createElement('div');row.className='vip-history-row';
   const title=document.createElement('strong');title.textContent=`#${m.id} · ${m.tier.toUpperCase()} · ${m.plan} · ${m.source==='manual'?'Alta manual':'Compra'}`;
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
  vipMessage(vipSelectedBlocked?'Esta cuenta está en Rank 0. Desbloquéala en Personal antes de otorgar GOLD/VIP.':data.pending_requests?`Hay ${data.pending_requests} solicitud(es) pendientes de pago que no están incluidas en el VIP confirmado.`:'');
 }catch(err){vipMessage('No se pudo cargar el cliente: '+err.message);}
}
$('vipGrantForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!vipSelectedId||vipSelectedBlocked)return;
 const planId=$('vipPlanSelect').value;const reason=$('vipGrantReason').value.trim();
 const planLabel=$('vipPlanSelect').selectedOptions[0]?.textContent||'el plan';
 if(reason.length<4)return vipMessage('Escribe el motivo (mínimo cuatro caracteres).');
 if(!confirm(`¿Asignar ${planLabel} al cliente seleccionado sin registrar un pago? Quedará anotado en Actividad.`))return;
 const button=$('vipGrantButton');button.disabled=true;vipMessage('Registrando membresía…');
 try{
  const out=await api(`/api/admin/vip/customers/${vipSelectedId}/grant`,{method:'POST',body:JSON.stringify({plan_id:Number(planId),reason})});
  $('vipGrantReason').value='';await loadVipCustomer(vipSelectedId);
  vipMessage(`✅ ${out.message} Vigencia hasta: ${vipDate(out.ends_at)}.`);
  await refreshAdminStats();
 }catch(err){vipMessage('No se pudo otorgar la membresía: '+err.message);}finally{button.disabled=vipSelectedBlocked;}
});
$('vipRevokeTier').addEventListener('change',()=>{$('vipRevokeButton').disabled=vipSelectedBlocked||($('vipRevokeTier').value==='vip'?vipConfirmedCount:vipGoldConfirmedCount)===0;});
$('vipRevokeForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!vipSelectedId)return;const tier=$('vipRevokeTier').value;const count=tier==='vip'?vipConfirmedCount:vipGoldConfirmedCount;if(count===0)return;
 const reason=$('vipRevokeReason').value.trim();if(reason.length<4)return vipMessage('Indica el motivo del retiro.');
 if(!confirm(`¿CONFIRMAS retirar el nivel ${tier.toUpperCase()} vigente y sus renovaciones de este cliente? Esto NO reembolsa pagos ni cancela solicitudes pendientes.`))return;
 const button=$('vipRevokeButton');button.disabled=true;vipMessage(`Retirando acceso ${tier.toUpperCase()}…`);
 try{
  const out=await api(`/api/admin/vip/customers/${vipSelectedId}/revoke`,{method:'POST',body:JSON.stringify({reason,tier})});
  $('vipRevokeReason').value='';await loadVipCustomer(vipSelectedId);
  vipMessage(`Acceso retirado (${out.cancelled} períodos). Pagos anteriores conservados, sin reembolsos.`);
  await refreshAdminStats();
 }catch(err){vipMessage('No se pudo retirar acceso: '+err.message);}finally{button.disabled=vipSelectedBlocked||($('vipRevokeTier').value==='vip'?vipConfirmedCount:vipGoldConfirmedCount)===0;}
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
  const labels={vip_manual_granted:'VIP asignado manualmente',vip_manual_revoked:'VIP retirado manualmente',membership_manual_granted:'Membresía manual asignada',membership_manual_revoked:'Acceso retirado manualmente',plan_discount_set:'Descuento creado o actualizado',plan_discount_disabled:'Descuento finalizado'};
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
 owner:['overview','predictions','performance-demo','football','sources','visual-theme','payments','finance','vip','plans','customers','staff','audit','telegram','mytelegram'],
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
 document.querySelector('#dashboard .heading h1').textContent=({overview:'Resumen del negocio',predictions:'Gestión de pronósticos',payments:'Solicitudes de pago',finance:'Finanzas y conciliación',vip:'Gestión manual GOLD y VIP',plans:'Planes y precios',customers:'Clientes registrados',staff:'Gestión de personal',audit:'Historial de actividad',telegram:'Telegram y suscriptores VIP',mytelegram:'Mi Telegram VIP',football:'Análisis automático de fútbol',sources:'Fuentes deportivas','performance-demo':'Estadísticas de prueba · DEMO','visual-theme':'Temas y festividades'})[section]||'Resumen del negocio';
 if(section==='sources'&&currentAdminRole==='owner')loadSportsSources();
 if(section==='visual-theme'&&currentAdminRole==='owner')loadSiteThemeSettings();
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
  $('telegramAdminSetup').textContent=[s.bot_configured?'Bot ✓':'Falta bot',s.vip_channel_configured?'VIP ✓':'Falta VIP',s.free_channel_configured?'Canal oficial ✓':'Falta canal oficial',s.free_group_configured?'Grupo extra ✓':'Grupo extra sin configurar',s.webhook_secret_configured?'Secreto ✓':'Falta secreto'].join(' · ');
  $('telegramAdminLinked').textContent=String(s.linked);
  $('telegramAdminMembers').textContent=String(s.vip_members);
  await Promise.allSettled([refreshGoldDeliveryStatus(),refreshGoldWhitelistAdmin()]);
  $('telegramCoverage').textContent=`Telegram informa ${s.telegram_member_count??'—'} miembros; IDs de miembros conocidos: ${s.tracked_members}. Desvinculados pendientes de salida: ${s.detached_pending}. Telegram anteriores conservados por el creador: ${s.creator_preserved??0}. El bot no puede descargar la lista total: revisa manualmente usuarios antiguos no registrados.`;
 }catch(error){$('telegramAdminResult').textContent=error.message;}
}
async function refreshGoldDeliveryStatus(){
 const node=$('telegramGoldDeliveryStatus');if(!node)return;
 try{const r=await api('/api/admin/telegram/gold-status');const c=r.counts||{};
  node.textContent=`En cola: ${c.pending||0} · Enviadas: ${c.sent||0} · Fallidas: ${c.failed||0} · Interrumpidas: ${c.sending||0} · No enviadas por permisos: ${c.skipped||0}. ${r.bot_configured?'Bot conectado':'Falta token del bot'}.`;
 }catch(e){node.textContent='No se pudo consultar las entregas GOLD: '+e.message;}
}
async function refreshGoldWhitelistAdmin(){
 const root=$('telegramGoldWhitelistAdminResults');if(!root)return;
 try{
  const data=await api('/api/admin/telegram/gold-whitelist');root.replaceChildren();
  if(!data.members?.length){root.textContent='Todavía no hay usuarios registrados en la lista blanca GOLD.';return;}
  const summary=document.createElement('p');
  summary.textContent=`Verificados y vigentes: ${data.members.filter(x=>x.state==='authorized').length} · Pendientes: ${data.members.filter(x=>x.state==='pending').length} · Mostrando ${data.members.length} registros.`;
  root.append(summary);
  const list=document.createElement('div');list.className='gold-whitelist-admin-list';
  for(const m of data.members){
   const line=document.createElement('div');line.className='gold-whitelist-admin-row';
   const name=document.createElement('strong');name.textContent=`${m.display_name} · ${m.username?'@'+m.username:'Telegram sin @usuario'} · #${m.user_id}`;
   const state=document.createElement('span');state.textContent=({authorized:'✓ GOLD autorizado',pending:'⌛ Pendiente de /start',inactive:'Sin membresía activa o sin vinculación',revoked:'Desvinculado'})[m.state]||m.state;
   line.append(name,state);list.append(line);
  }
  root.append(list);
 }catch(error){root.textContent='No se pudo actualizar la lista blanca GOLD: '+error.message;}
}
$('telegramGoldWhitelistRefresh')?.addEventListener('click',refreshGoldWhitelistAdmin);
$('telegramGoldRefresh')?.addEventListener('click',refreshGoldDeliveryStatus);
$('telegramFreeChannelCheck')?.addEventListener('click',async()=>{
 const msg=$('telegramFreeChannelResult');msg.textContent='Verificando el canal oficial…';
 try{const r=await api('/api/admin/telegram/free-channel/check',{method:'POST',body:'{}'});
  msg.textContent=`✓ ${r.title} · ID ${r.chat_id} · Bot autorizado para publicar.`;
 }catch(error){msg.textContent='⚠ '+error.message;}
});
$('telegramFreeChannelTest')?.addEventListener('click',async()=>{
 if(!confirm('¿Enviar un mensaje de PRUEBA visible para todos en el canal oficial?'))return;
 const msg=$('telegramFreeChannelResult');msg.textContent='Enviando prueba al canal…';
 try{const r=await api('/api/admin/telegram/free-channel/test',{method:'POST',body:'{}'});
  msg.textContent=`✓ Mensaje #${r.message_id} enviado a ${r.title} (ID ${r.chat_id}).`;
 }catch(error){msg.textContent='⚠ '+error.message;}
});
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
   const schedule=window.FijasMatchSchedule?.render(p.match_date,{...(p.locked?{}:p.football_details?.match_context||{}),prediction_id:p.id});if(schedule)card.append(schedule);
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
// Owner-controlled source settings; the saved DB value is authoritative on every load.
async function loadSportsSources(){
 if(currentAdminRole!=='owner'||!$('sportsSourcesPanel'))return;
 const toggle=$('sportsSecondaryToggle'),state=$('sportsSecondaryState'),info=$('sportsSecondaryInfo'),live=$('sportsLiveState'),notice=$('sportsSourcesNotice');
 const dataToggle=$('sportsFootballDataToggle'),wideToggle=$('sportsWideToggle');
 toggle.disabled=true;if(dataToggle)dataToggle.disabled=true;if(wideToggle)wideToggle.disabled=true;
 try{
  const data=await api('/api/admin/football/sources');
  toggle.checked=Boolean(data.secondary.enabled);
  state.textContent=toggle.checked?'Activada':'Desactivada';
  state.classList.toggle('enabled',toggle.checked);
  state.classList.toggle('disabled',!toggle.checked);
  info.textContent=`${data.secondary.competition_count} competiciones por liga + búsqueda diaria 7 días · El acceso gratuito devuelve hasta 1 por liga y 3 por día; no es el calendario completo de ESPN.`;
  const last=$('sportsSecondaryLastImport'),run=data.secondary.last_import;
  if(last)last.textContent=run?`Última importación: ${run.requests||0} consultas · ${run.discovered||0} partidos detectados · ${run.inserted||0} nuevos · ${run.matched||0} vinculados · ${run.daily?.unmapped||0} de competiciones no admitidas · ${run.daily?.limit_days||0} días llegaron al límite gratis${run.errors?.length?' · Incidencias: '+run.errors.slice(0,2).join(' / '):''}.`:'Sin resultados de importación en este proceso. Importa datos para comprobar la cobertura.';
  live.textContent=data.live_schedule.configured?'Configurado':'No configurado';
  live.classList.toggle('enabled',data.live_schedule.configured);
  live.classList.toggle('disabled',!data.live_schedule.configured);
  const footballData=data.football_data;
  if(footballData&&dataToggle){
   const dataState=$('sportsFootballDataState'),keyState=$('sportsFootballDataKeyState'),lastData=$('sportsFootballDataLastImport');
   dataToggle.checked=Boolean(footballData.enabled);
   dataToggle.disabled=false;
   dataState.textContent=footballData.enabled?(footballData.configured?'Activada':'Sin clave'):'Desactivada';
   dataState.classList.toggle('enabled',Boolean(footballData.enabled&&footballData.configured));
   dataState.classList.toggle('disabled',!footballData.enabled||!footballData.configured);
   keyState.textContent=footballData.configured?'Clave configurada en Railway · Lista para consultar':'Falta FOOTBALL_DATA_ORG_KEY en Railway. Puedes activar el interruptor, pero no se descargarán partidos hasta configurar la clave.';
   const run=footballData.last_import;
   lastData.textContent=run?`Última consulta: ${run.requests||0} solicitudes · ${run.received||0} recibidos · ${run.discovered||0} compatibles · ${run.inserted||0} nuevos · ${run.matched||0} vinculados · ${run.without_time||0} sin hora exacta${run.errors?.length?' · '+run.errors.slice(0,2).join(' / '):''}`:'Sin importación registrada en este proceso.';
  }
  const wide=data.api_football_wide;
  if(wide&&wideToggle){
   const wideState=$('sportsWideState'),keyState=$('sportsWideKeyState'),last=$('sportsWideLastImport');
   wideToggle.checked=Boolean(wide.enabled);wideToggle.disabled=false;
   wideState.textContent=!wide.enabled?'Desactivada':!wide.configured?'Sin clave':wide.plan==='extended'?'Activa · 30 días':'Activa · hoy y mañana';
   wideState.classList.toggle('enabled',Boolean(wide.enabled&&wide.configured));
   wideState.classList.toggle('disabled',!wide.enabled||!wide.configured);
   keyState.textContent=!wide.configured?'Requiere FOOTBALL_API_KEY en Railway':wide.plan==='extended'?'Plan extendido: búsqueda de hasta 30 días · '+wide.competition_count+' competiciones reconocidas':'Plan gratuito: hoy y mañana (UTC), sujetos a la cuota disponible. Para 30 días, necesitas un plan compatible y FOOTBALL_SCHEDULE_PLAN=extended.';
   const run=wide.last_import;
   last.textContent=run?`Última importación: ${run.requests||0} consultas · ${run.received||0} recibidos · ${run.discovered||0} compatibles · ${run.inserted||0} nuevos · ${run.matched||0} vinculados · ${run.unmapped||0} ligas sin histórico${run.errors?.length?' · '+run.errors.slice(0,2).join(' / '):''}`:'Sin importaciones de la fuente amplia en este proceso.';
  }
  toggle.disabled=false;
 }catch(error){state.textContent='Error de lectura';notice.textContent='No se pudo cargar la configuración: '+error.message;if(dataToggle)dataToggle.disabled=false;if(wideToggle)wideToggle.disabled=false;}
}
$('sportsWideToggle')?.addEventListener('change',async()=>{
 const toggle=$('sportsWideToggle'),state=$('sportsWideState'),notice=$('sportsSourcesNotice');
 const enabled=toggle.checked;toggle.disabled=true;notice.textContent='Guardando calendario amplio…';
 try{
  const saved=await api('/api/admin/football/sources/wide-calendar',{method:'POST',body:JSON.stringify({enabled})});
  state.textContent=saved.enabled?'Activada':'Desactivada';
  state.classList.toggle('enabled',saved.enabled&&saved.configured);state.classList.toggle('disabled',!saved.enabled||!saved.configured);
  notice.textContent=saved.message;
 }catch(error){toggle.checked=!enabled;notice.textContent='No se pudo guardar: '+error.message;}
 finally{toggle.disabled=false;}
});
$('sportsSecondaryToggle')?.addEventListener('change',async()=>{
 const toggle=$('sportsSecondaryToggle'),notice=$('sportsSourcesNotice'),state=$('sportsSecondaryState');
 const enabled=toggle.checked;toggle.disabled=true;notice.textContent='Guardando el cambio…';
 try{
  const saved=await api('/api/admin/football/sources/secondary',{method:'POST',body:JSON.stringify({enabled})});
  state.textContent=saved.enabled?'Activada':'Desactivada';
  state.classList.toggle('enabled',saved.enabled);state.classList.toggle('disabled',!saved.enabled);
  notice.textContent=saved.message+' Pulsa «Importar datos ahora» si deseas consultar nuevos partidos.';
 }catch(error){toggle.checked=!enabled;notice.textContent='No se pudo guardar: '+error.message;}
 finally{toggle.disabled=false;}
});
$('sportsFootballDataToggle')?.addEventListener('change',async()=>{
 const toggle=$('sportsFootballDataToggle'),notice=$('sportsSourcesNotice'),state=$('sportsFootballDataState');
 const enabled=toggle.checked;toggle.disabled=true;notice.textContent='Guardando el calendario ampliado…';
 try{
  const saved=await api('/api/admin/football/sources/football-data',{method:'POST',body:JSON.stringify({enabled})});
  state.textContent=saved.enabled?(saved.configured?'Activada':'Sin clave'):'Desactivada';
  state.classList.toggle('enabled',saved.enabled&&saved.configured);
  state.classList.toggle('disabled',!saved.enabled||!saved.configured);
  notice.textContent=saved.message;
 }catch(error){toggle.checked=!enabled;notice.textContent='No se pudo guardar la fuente: '+error.message;}
 finally{toggle.disabled=false;}
});
async function loadSportsFixturePreview(){
 const list=$('sportsFixturesList'),notice=$('sportsFixturesNotice');
 if(currentAdminRole!=='owner'||!list||!notice)return;
 notice.textContent='Consultando los partidos importados…';
 try{
  const data=await api('/api/admin/football/fixtures');
  list.replaceChildren();
  if(!data.fixtures.length){notice.textContent='No hay partidos futuros importados. Revisa la última importación, que la fuente complementaria esté activada y los límites de cobertura.';return;}
  const withTime=data.fixtures.filter(x=>x.scheduled_time_known&&x.kick_off).length;
  notice.textContent=`${data.fixtures.length} partidos cargados · ${withTime} con hora · ${data.fixtures.length-withTime} sin hora (21 días).`;
  for(const fixture of data.fixtures.slice(0,35)){
   const item=document.createElement('article');item.className='sports-fixture-item';
   const title=document.createElement('strong');title.textContent=`${fixture.home_team} vs ${fixture.away_team}`;
   const row=document.createElement('small');
   let date='Sin hora confirmada';
   if(fixture.scheduled_time_known&&fixture.kick_off){
    const d=new Date(fixture.kick_off);
    if(Number.isFinite(d.getTime()))date=d.toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
   }
   row.textContent=`${fixture.league} · ${date} · ${fixture.source==='verificador'?'Horario verificado':fixture.source==='complementaria'?'Calendario adicional':fixture.source==='football-data'?'Calendario ampliado':fixture.source==='wide-calendar'?'Calendario fuente IV':'Histórico'}${fixture.verified_status?' · Verificado: '+fixture.verified_status:' · Estado no comprobado en vivo'}`;
   item.append(title,row);list.append(item);
  }
 }catch(error){notice.textContent='Error al consultar los partidos: '+error.message;}
}
$('sportsTomorrowAudit')?.addEventListener('click',async()=>{
 const button=$('sportsTomorrowAudit'),notice=$('sportsTomorrowAuditResult'),list=$('sportsTomorrowAuditMatches');
 button.disabled=true;list.replaceChildren();notice.textContent='Comparando el calendario de mañana con MySQL…';
 try{
  const r=await api('/api/admin/football/calendar-audit');
  notice.textContent=`${r.date_utc} (UTC): ${r.received} partidos recibidos · ${r.in_mysql} compatibles en MySQL · ${r.missing_in_mysql} compatibles aún sin importar · ${r.unmapped} de torneos sin historial compatible. ${r.diagnosis}`;
  for(const [title,items] of [['Compatibles que faltan en MySQL',r.examples_missing],['Otras competiciones recibidas',r.examples_unsupported]]){
   if(!items?.length)continue;
   const heading=document.createElement('strong');heading.textContent=title;list.append(heading);
   for(const match of items){const line=document.createElement('p');line.textContent=`${match.match} · ${match.league} · ${match.kickoff?new Date(match.kickoff).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Hora desconocida'}`;list.append(line);}
  }
 }catch(error){notice.textContent='Comprobación no disponible: '+error.message;}
 finally{button.disabled=false;}
});
$('sportsFixturesRefresh')?.addEventListener('click',loadSportsFixturePreview);
$('sportsFixturePreview')?.addEventListener('toggle',()=>{if($('sportsFixturePreview').open)loadSportsFixturePreview();});
$('sportsSourcesRefresh')?.addEventListener('click',loadSportsSources);
$('sportsSourcesImportScan')?.addEventListener('click',async()=>{
 const button=$('sportsSourcesImportScan'),notice=$('sportsSourcesNotice');
 button.disabled=true;notice.textContent='Solicitando búsqueda de partidos y análisis al terminar…';
 try{const result=await api('/api/admin/football/import-scan',{method:'POST',body:'{}'});
  notice.textContent=result.message||'Búsqueda iniciada. Consulta Análisis automático para el resultado.';
 }catch(e){notice.textContent='Error al buscar y analizar: '+e.message;}
 finally{button.disabled=false;}
});
$('sportsSourcesImport')?.addEventListener('click',async()=>{
 const button=$('sportsSourcesImport'),notice=$('sportsSourcesNotice');
 button.disabled=true;notice.textContent='Solicitando importación de datos deportivos…';
 try{const response=await api('/api/admin/football/import',{method:'POST',body:'{}'});
  notice.textContent=response.message||'Importación solicitada. Consulta Análisis automático para ver los resultados.';
 }catch(error){notice.textContent='Error al importar: '+error.message;}
 finally{button.disabled=false;}
});

async function loadFootballEngine(){
 const summary=$('footballEngineSummary'),list=$('footballCandidateList'),message=$('footballEngineMsg');
 if(!summary||currentAdminRole!=='owner')return;
 try{
  const [status,result]=await Promise.all([api('/api/admin/football/status'),api('/api/admin/football/candidates')]);
  const radarAuto=$('footballVipRadarAuto');if(radarAuto)radarAuto.checked=Boolean(status.vip_radar?.enabled);
  const syncLabel=$('liveScheduleStatus');
  if(syncLabel)api('/api/admin/schedules/status').then(s=>{
   const time=s.latest_verified?window.FijasMatchSchedule?.formatDate(s.latest_verified):null;
   const scope=s.allowed_dates_utc?` · Fechas consultables (UTC): ${s.allowed_dates_utc.from} a ${s.allowed_dates_utc.to}`:'';
   syncLabel.textContent=s.live_configured?
    `${s.last_error?'⚠️ Calendario con incidencia':'⚽ Calendario configurado'} · ${s.verified_matches} partidos vinculados · Última verificación: ${time||'pendiente'}${scope}. ${s.last_error?'Último error: '+s.last_error:'Los horarios fuera de cobertura siguen sin confirmar.'}`:
    '⚠️ Calendario NO sincronizado en vivo. Configura FOOTBALL_SCHEDULE_LIVE=true y FOOTBALL_API_KEY en Railway. Los horarios actuales son orientativos.';
  }).catch(()=>{syncLabel.textContent='⚠️ No se pudo verificar el estado del calendario.';});
  summary.replaceChildren();
  for(const id of ['footballImportButton','footballBacktestButton','footballSettleButton']){
   const button=$(id);if(button)button.hidden=!status.engine;
  }
  const stats=[
   ['Motor de análisis',status.engine?'N-FORCE':(status.configured?'Motor clásico':'Sin configurar')],
   ...(status.engine?[['Cotejo automático de resultados',status.settlement?.working?'Comprobando…':status.settlement?.last?`${status.settlement.last.settled} actualizados · ${status.settlement.last.won} ganados · ${status.settlement.last.lost} perdidos · ${status.settlement.last.void} anulados`:'Pendiente del siguiente control'],['Sin cotejar: sin FT / mercado desconocido',status.settlement?.last?`${status.settlement.last.invalid_source} / ${status.settlement.last.unsupported}`:'—']]:[]),
   ...(status.engine?[['Partidos importados',status.total_matches||0],['Resultados históricos',status.complete_matches||0],['Calendario complementario',status.secondary_enabled?'Activado (Fuentes deportivas)':'Desactivado (actívalo en Fuentes deportivas)'],['Torneos del calendario complementario',status.secondary_competitions??'—'],['Partidos exclusivos de la fuente adicional',status.secondary_fixtures??0],['Calendario ampliado',status.football_data_enabled?(status.football_data_configured?'Activado':'Activado sin clave'):'Desactivado'],['Partidos exclusivos del calendario ampliado',status.football_data_fixtures??0],['Última importación del calendario ampliado',status.last_import_report?.football_data?`${status.last_import_report.football_data.received||0} recibidos · ${status.last_import_report.football_data.discovered||0} compatibles · ${status.last_import_report.football_data.inserted||0} nuevos · ${status.last_import_report.football_data.without_time||0} sin hora · ${(status.last_import_report.football_data.errors||[]).join(' / ')}`:'Pendiente'],['Partidos de clubes incorporados por el verificador',status.verified_club_fixtures??0],['Errores del calendario complementario',status.last_import_report?.secondary?.errors?.slice(0,2).join(' · ')||'Sin errores reportados'],['Último rastreo complementario',status.last_import_report?.secondary?`${status.last_import_report.secondary.requests||0} consultas · ${status.last_import_report.secondary.discovered||0} detectados · ${status.last_import_report.secondary.inserted||0} nuevos · ${status.last_import_report.secondary.matched||0} vinculados${status.last_import_report.secondary.errors?.length?' · Algunas consultas fallaron':''}`:'Pendiente de importar datos'],['Última importación',status.source_import?`${status.source_import.status} · ${status.source_import.sources} registros de competición · ${status.source_import.records} partidos`:'Pendiente'],['Competiciones cargadas en MySQL',status.loaded_competitions!=null?`${status.loaded_competitions} de ${status.configured_competitions||20} configuradas`:'No disponible'],['Competiciones con verificación de horarios independiente',status.live_schedule_supported_competitions!=null?`${status.live_schedule_supported_competitions} de ${status.configured_competitions||20} (según cobertura del sincronizador)`:'No disponible'],['Competiciones de la última importación',status.last_import_report?.competitions_imported!=null?`${status.last_import_report.competitions_imported} con datos en la última importación`:'Ejecuta «Importar datos» para comprobar la cobertura'],['Torneos de selecciones configurados',status.national_competitions_configured??'—'],['Torneos de selecciones cargados',status.loaded_national_competitions??'—'],['Partidos de selecciones en MySQL',status.national_matches??'—'],['Temporadas aún sin datos',status.last_import_report?.datasets_missing??'—'],['Backtesting',status.backtest?`${status.backtest.evaluated} evaluados · ${status.backtest.accuracy??'—'}% precisión observada${status.backtest.validated?'':' (muestra insuficiente, antigua o de otra versión)'}`:'Aún sin validar'],
   ['Resultados retrospectivos del perfil GOLD / VIP',status.backtest?.segments?`Abierto: ${status.backtest.segments.free?.evaluated||0} pruebas · ${status.backtest.segments.free?.accuracy??'—'}% | VIP: ${status.backtest.segments.vip?.evaluated||0} pruebas · ${status.backtest.segments.vip?.accuracy??'—'}%`:'Pendiente de backtesting'],
   ['Backtest por tipo de fútbol',status.backtest?.by_context?Object.entries(status.backtest.by_context).map(([key,v])=>`${key==='national'?'Selecciones':'Clubes'}: ${v.evaluated||0} partidos modelados, ${(Object.values(v.by_market||{}).map(m=>m.evaluated||0).reduce((a,b)=>a+b,0))} selecciones por mercado (exige 32 por mercado VIP)`).join(' | '):'Validar modelo 1.9 para separar clubes y selecciones'],
   ['Evaluación por mercado',status.backtest?.by_market?Object.entries(status.backtest.by_market).map(([market,v])=>`${market}: ${v.evaluated} pruebas · ${v.accuracy}%`).join(' | ')||'Sin selecciones históricas validadas':'Pendiente'],
   ['Comparación con el motor anterior (Brier)',status.backtest?.comparison_previous?.paired_evaluated?
    `Anterior: ${status.backtest.comparison_previous.previous_brier} · Nuevo: ${status.backtest.comparison_previous.current_brier} · ${status.backtest.comparison_previous.paired_evaluated} partidos pareados. ${status.backtest.comparison_previous.brier_difference<0?'Mejora retrospectiva':status.backtest.comparison_previous.brier_difference>0?'Sin mejora retrospectiva':'Mismo error'} (menor es mejor).`:'Ejecuta Validar modelo']]:[]),
   ['Búsqueda automática',status.auto_scan?'Activada':'Desactivada'],
   ['Publicación automática',status.auto_publish?'Activada':'Solo revisión'],
   ['Telegram canal oficial',status.telegram_free_ready?'Configurado':'Falta token o chat ID'],
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
   ['Diagnóstico de búsqueda',status.last_scan_report?.insight?.headline||'Ejecuta Analizar ahora para conocer el motivo'],
   ['Partidos futuros sin hora exacta',status.last_scan_report?.fixtures_without_time??'Pendiente de un escaneo reciente'],
   ['Calendario: diagnóstico',status.calendar_diagnostic?.diagnosis||'Sin diagnóstico'],
   ['Encuentros con fecha pero sin hora en la ventana',status.calendar_diagnostic?.date_only_in_window??'—'],
   ['Horarios utilizables dentro de la ventana',status.calendar_diagnostic?.known_time_in_window??'—'],
   ['Horarios excluidos por estado del partido',status.calendar_diagnostic?.known_time_blocked_status??'—'],
   ['Próximo encuentro con hora',status.calendar_diagnostic?.next_known?`${status.calendar_diagnostic.next_known.league} · ${status.calendar_diagnostic.next_known.match} · ${new Date(status.calendar_diagnostic.next_known.kickoff).toLocaleString('es-PE',{timeZone:'America/Lima'})}`:'No aparece en la base de datos'],
   ['Ligas con encuentros futuros',status.calendar_diagnostic?.leagues_with_future??'—'],
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
  if(!result.candidates.length){list.textContent='No hay propuestas pendientes. Las descartadas y publicadas no se muestran aquí. Importa datos y analiza nuevos partidos para generar más propuestas.';return;}
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
   if(c.vip_validation){
    const badge=document.createElement('p');badge.className='football-meta';
    badge.textContent=c.vip_validation.approved?
     `👑 VIP verificada retrospectivamente: ${c.vip_validation.evaluated} pruebas · ${c.vip_validation.accuracy}% observado.`:
     `⚠️ VIP sin validación suficiente: ${c.vip_validation.reason}`;
    badge.style.color=c.vip_validation.approved?'#d3b468':'#edb2a9';item.append(badge);
   }
   if(c.status==='draft'){
    const actions=document.createElement('div');actions.className='football-candidate-actions';
    const feedback=document.createElement('p');feedback.className='football-meta';feedback.setAttribute('role','status');item.append(feedback);
    if(c.needs_refresh){
     const explanation=document.createElement('p');explanation.className='football-meta';
     explanation.textContent=c.schedule_changed?'⚠️ Cambió el horario del partido. Reanaliza la propuesta antes de aprobarla.':'⚠️ Propuesta antigua: reanalízala con el modelo actual antes de aprobarla. Se conserva esta misma propuesta.';
     item.append(explanation);
    }
    if(c.source_readiness&&!c.source_readiness.ready){
     const warning=document.createElement('p');warning.className='football-meta';
     warning.textContent='⚠️ '+c.source_readiness.message;
     item.append(warning);
     if(c.source_readiness.action==='verify_schedule'){
      const checkButton=document.createElement('button');checkButton.type='button';checkButton.className='secondary';
      checkButton.textContent='🕒 Verificar horario y estado del partido';
      checkButton.addEventListener('click',async()=>{
       checkButton.disabled=true;feedback.textContent='Consultando el calendario para este partido…';
       try{
        const result=await api('/api/admin/schedules/verify',{method:'POST',body:JSON.stringify({candidate_id:c.id})});
        feedback.textContent=result.message||'Verificación completada.';
        await loadFootballEngine();
        message.textContent=result.message||'Estado actualizado. Revisa la propuesta antes de publicarla.';
       }catch(error){feedback.textContent=error.message;message.textContent=error.message;checkButton.disabled=false;}
      });
      actions.append(checkButton);
     }
     if(c.source_readiness.action==='import_data'){
      const importButton=document.createElement('button');importButton.type='button';importButton.className='secondary';
      importButton.textContent='⬇ Actualizar datos deportivos';
      importButton.addEventListener('click',async()=>{
       importButton.disabled=true;
       try{
        const response=await api('/api/admin/football/import',{method:'POST',body:'{}'});
        feedback.textContent=(response.message||'Importación iniciada.')+' Al completarse, reanaliza esta misma propuesta antes de aprobarla.';
       }catch(error){feedback.textContent=error.message;}
       finally{importButton.disabled=false;}
      });
      actions.append(importButton);
     }
    }
    const update=document.createElement('button');update.type='button';update.className='secondary';
    update.textContent='🔄 Reanalizar esta propuesta';
    update.addEventListener('click',async()=>{
     update.disabled=true;
     try{
      const r=await api(`/api/admin/football/candidates/${c.id}/refresh`,{method:'POST',body:'{}'});
      if(!r.refreshed){feedback.textContent=r.reason||'No se pudo actualizar';update.disabled=false;return;}
      await loadFootballEngine();message.textContent=r.message+' '+r.market+' · '+r.selection;
     }catch(error){feedback.textContent=error.message;update.disabled=false;}
    });actions.append(update);
    const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary';refresh.textContent='🔄 Actualizar lesiones y alineaciones';refresh.hidden=Boolean(status.engine);
    refresh.addEventListener('click',async()=>{refresh.disabled=true;try{
      const r=await api(`/api/admin/football/candidates/${c.id}/refresh-advanced`,{method:'POST',body:'{}'});
      message.textContent=r.message||'Datos actualizados';await loadFootballEngine();
    }catch(error){message.textContent=error.message;refresh.disabled=false;}});actions.append(refresh);
    for(const [action,label] of [['publish','Aprobar y publicar'],['discard','Descartar']]){
     const button=document.createElement('button');button.className=action==='discard'?'secondary':'';button.textContent=label;
     if(action==='publish'&&c.visibility==='vip'&&c.vip_validation&&!c.vip_validation.approved){
      button.disabled=true;button.title='Requiere validación histórica VIP antes de publicar';
     }
     if(action==='publish'&&(c.needs_refresh||c.source_readiness&&!c.source_readiness.ready)){
      button.disabled=true;button.title=c.needs_refresh?'Reanaliza esta misma propuesta antes de aprobarla':c.source_readiness.message;
     }
     button.addEventListener('click',async()=>{
      if(!confirm(action==='publish'?`¿Publicar esta selección ${c.visibility.toUpperCase()} en web y Telegram?`:'¿Descartar propuesta?'))return;
      button.disabled=true;
      try{
       const response=await api(`/api/admin/football/candidates/${c.id}/${action}`,{method:'POST',body:'{}'});
       const notice=action==='publish'?(response.published?`Publicado en web. Telegram: ${response.telegram||'—'}`:`No publicado: ${response.reason||'Revisa los filtros'}`):'Propuesta descartada';
       if(action==='discard'&&response.ok){
        // Quitarla al instante; el servidor conserva el estado descartado para auditoría.
        item.remove();
        if(!list.querySelector('.football-candidate'))list.textContent='No hay propuestas pendientes. Las nuevas aparecerán en el próximo análisis.';
       }
       if(response.published||action==='discard'){await loadFootballEngine();if(action==='publish')await loadPredictions();}
       else button.disabled=false;
       message.textContent=notice;
       if(item.isConnected)feedback.textContent=notice;
      }catch(error){message.textContent=error.message;feedback.textContent=error.message;button.disabled=false;}
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
  ['Ventana del motor',d.scan_lookahead_days!=null?`${d.scan_lookahead_days} días`:'—'],
  ['Partidos sin horario exacto',d.future_without_known_time??'—'],
  ['Predicción de muestra',d.sample?.prediction_available===true?'Disponible':d.sample?.prediction_available===false?'No disponible':'No comprobada'],
  ['Aprobación de filtros',d.sample?.passes_filters===true?'Sí':d.sample?.passes_filters===false?'No':'Sin muestra'],
 ];
 if(d.provider_requests_limit!=null)items.push(['Uso de API',`${d.provider_requests_current??'—'} / ${d.provider_requests_limit}`]);
 if(d.sample?.match)items.push(['Partido revisado',d.sample.match]);
 if(d.next_fixture)items.push(['Próximo partido detectado',`${d.next_fixture.match} · ${new Date(d.next_fixture.kickoff).toLocaleString('es-PE')}`]);
 for(const [key,value] of items){const p=document.createElement('p');const bold=document.createElement('b');bold.textContent=key+': ';p.append(bold,document.createTextNode(String(value)));holder.append(p);}
 const note=document.createElement('p');note.className='football-diagnostic-note';note.textContent=d.reason||'Prueba completada sin publicar nada.';holder.append(note);
}
// Legacy incompatibility recovery is OWNER-initiated and always rechecks
// model quality on the server. The UI never changes status by itself.
async function loadDiscardedForReview(){
 const target=$('footballDiscardedList'),notice=$('footballDiscardResult');
 if(!target||!notice)return;
 target.replaceChildren();notice.textContent='Consultando registros históricos…';
 try{
  const data=await api('/api/admin/football/discarded');
  const list=Array.isArray(data.candidates)?data.candidates:[];
  if(!list.length){notice.textContent='No hay descartes antiguos en los últimos 150 registros.';return;}
  notice.textContent=`${list.length} descartada(s) encontradas. Solo el dueño puede solicitar una reevaluación individual.`;
  const reasonText={version_incompatible:'Versión incompatible identificada',manual:'Marcada como descarte manual',sin_etiqueta:'Motivo antiguo no registrado'};
  const stateText={revision_permitida:'Puede reanalizarse',ya_publicada:'Ya tiene publicación',horario_no_confirmado:'Sin horario utilizable',partido_iniciado_o_cercano:'Partido iniciado o muy cercano',fuera_de_ventana:'Fuera del rango actual'};
  for(const c of list){
   const article=document.createElement('article');article.className='football-discarded-item';
   const header=document.createElement('strong');header.textContent=`#${c.id} · ${c.match}`;
   const info=document.createElement('p');info.textContent=`${c.league} · ${c.visibility.toUpperCase()} · ${reasonText[c.discard_reason]||c.discard_reason} · Modelo ${c.stored_model} · ${stateText[c.eligibility]||c.eligibility}`;
   const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='Reanalizar y pasar a Pendientes';
   btn.disabled=c.eligibility!=='revision_permitida';
   btn.addEventListener('click',async()=>{
    if(!confirm(`¿Reevaluar ${c.match} con el modelo vigente? Si supera los filtros, volverá como borrador; NO se publicará.`))return;
    btn.disabled=true;notice.textContent='Recalculando…';
    try{
     const result=await api(`/api/admin/football/discarded/${encodeURIComponent(c.id)}/reconsider`,{method:'POST',body:JSON.stringify({confirm:true})});
     if(result.reopened){notice.textContent=result.message;await loadFootballEngine();await loadDiscardedForReview();}
     else {notice.textContent=result.reason||'La propuesta no cumple los requisitos actuales.';btn.disabled=false;}
    }catch(e){notice.textContent=e.message;btn.disabled=false;}
   });
   article.append(header,info,btn);target.append(article);
  }
 }catch(error){notice.textContent=error.message;}
}
$('footballReviewDiscarded')?.addEventListener('click',loadDiscardedForReview);
$('footballTestButton')?.addEventListener('click',async()=>{
 const btn=$('footballTestButton');btn.disabled=true;$('footballEngineMsg').textContent='Comprobando datos deportivos; no se publicará nada…';
 try{const report=await api('/api/admin/football/test',{method:'POST',body:'{}'});footballDiagnosticSummary(report);$('footballEngineMsg').textContent=report.cached?'Mostrando la última prueba (sin gastar más consultas).':'Prueba completada. Revisa los resultados debajo.';}
 catch(err){$('footballEngineMsg').textContent=err.message;}finally{btn.disabled=false;}
});
async function loadFootballVipAudit(){
 const target=$('footballVipAuditResult'),status=$('footballVipAuditStatus'),button=$('footballVipAuditButton');
 if(!target||!status||!button||currentAdminRole!=='owner')return;
 button.disabled=true;status.textContent='Leyendo datos VIP y comprobaciones retrospectivas…';target.hidden=true;target.replaceChildren();
 const add=(heading,value)=>{const p=document.createElement('p'),b=document.createElement('strong');b.textContent=heading+': ';p.append(b,document.createTextNode(String(value)));target.append(p);};
 try{
  const r=await api('/api/admin/football/vip-diagnostic');
  add('Diagnóstico',r.diagnosis);
  add('Siguiente paso',r.next_step);
  add('Borradores VIP / GOLD',`${r.total_vip_drafts} / ${r.total_gold_drafts}`);
  add('VIP N-FORCE publicadas históricamente',r.total_vip_published);
  add('VIP que pasan el modelo / la validación',`${r.publishable_by_model} / ${r.validated}`);
  add('VIP bloqueadas por modelo / validación',`${r.blocked_by_model} / ${r.blocked_by_backtest}`);
  add('Canal Telegram VIP',r.telegram_vip_ready?'Configurado':'Falta token o ID de canal');
  add('Backtest',r.backtest?`${r.backtest.evaluated} partidos · modelo ${r.backtest.model_version||'sin versión'} · ${r.backtest.created_at||'sin fecha'}`:'Aún no ejecutado');
  if(r.backtest?.by_context)for(const [key,group] of Object.entries(r.backtest.by_context)){
   const label=key==='national'?'selecciones':'clubes';
   add(`Backtest ${label}`,`${group.evaluated||0} partidos modelados · mínimo VIP 80 en este grupo`);
   for(const market of (group.by_market||[]).slice(0,8))
    add(`${label} · mercado ${market.market}`,`${market.evaluated||0}/40 pruebas requeridas · ${market.accuracy??'—'}% observado`);
  }else add('Backtest separado','Falta ejecutar «Validar modelo» con la versión 1.8. No se usa el historial de clubes para autorizar selecciones.');
  if(r.backtest?.by_market?.length)for(const market of r.backtest.by_market.slice(0,10))add(`Mercado global ${market.market}`,`${market.evaluated} pruebas · ${market.accuracy??'—'}% observado (no sustituye la validación por grupo)`);
  if(r.scan.available){
   add('Último escaneo: partidos / con modelo / VIP',`${r.scan.fixtures_in_window} / ${r.scan.modeled} / ${r.scan.eligible_vip}`);
   for(const reason of r.scan.rejection_by_market.slice(0,6))add(`Filtro VIP: ${reason.label}`,`${reason.count} mercados evaluados (no partidos únicos)`);
   const names={quality:'Calidad',home_matches:'Historial local',away_matches:'Historial visitante',league_matches:'Historial de liga',home_venue:'Local en casa',away_venue:'Visitante fuera',home_effective:'Muestra efectiva local',away_effective:'Muestra efectiva visitante',home_form_days:'Actualidad local',away_form_days:'Actualidad visitante',opponent_model:'Ajuste de rivales'};
   if(r.scan.sample_gap_fixtures) add('Partidos con requisitos VIP pendientes',`${r.scan.sample_gap_fixtures} partidos con modelo, no mercados`);
   for(const gap of r.scan.sample_gaps_by_requirement||[])add(`Requisito VIP: ${names[gap.code]||gap.code}`,`${gap.count} partidos diferentes`);
   const readiness={league_history:'No alcanza el historial de competición',team_history:'Falta historial de al menos un equipo',stale_form:'El último partido de un equipo es demasiado antiguo',invalid_fixture:'Datos del encuentro insuficientes'};
   for(const item of (r.scan.model_missing_examples||[]).slice(0,10)){
    const s=item.sample||{},q=item.required||{};
    add(`Sin modelo: ${item.match}`,`${readiness[item.reason]||item.reason}. Historial local ${s.home??'—'}/${q.home??'—'}, visitante ${s.away??'—'}/${q.away??'—'}, competición ${s.league??'—'}/${q.league??'—'}. Para clubes, también se exige un partido reciente.`);
   }
   for(const item of (r.scan.sample_gap_examples||[]).slice(0,8)){
    const deficits=(item.missing||[]).map(x=>`${x.label}: ${x.current==null?'sin dato':x.current} / ${x.comparison==='max'?'máximo ':'mínimo '}${x.required}`).join(' · ');
    add(`Partido: ${item.match}`,deficits||'Sin carencias de muestra');
   }
  }else add('Escaneo reciente',r.scan.reason);
  for(const [reason,count] of Object.entries(r.validation_reasons))add(`Validación: ${reason}`,`${count} borradores VIP`);
  for(const example of r.examples)add('Ejemplo bloqueado',`${example.match} · ${example.market}: ${example.reason}`);
  if(r.partial)add('Aviso','La lista de borradores se limitó para evitar sobrecargar MySQL.');
  target.hidden=false;status.textContent='Diagnóstico actualizado. Ninguna comprobación modifica pronósticos ni publica partidos.';
 }catch(e){status.textContent='No se pudo completar el diagnóstico VIP: '+e.message;}
 finally{button.disabled=false;}
}
$('footballVipAuditButton')?.addEventListener('click',loadFootballVipAudit);
$('nforceVipAudit')?.addEventListener('toggle',()=>{if($('nforceVipAudit').open)loadFootballVipAudit();});
function showFootballScanReport(r){
 const report=$('footballScanReport');if(!report)return;
 report.hidden=false;report.replaceChildren();
 const line=(label,value)=>{const row=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';row.append(b,document.createTextNode(String(value)));report.append(row);};
 line('Resultado',r?.message||r?.note||r?.error||'Escaneo finalizado');
 if(r?.ok){
  if(r.insight){
   line('Diagnóstico del escaneo',r.insight.headline||r.insight.code);
   for(const suggestion of r.insight.suggestions||[])line('Qué hacer',suggestion);
  }
  if(r.lookahead_days!=null)line('Ventana de búsqueda',`${r.lookahead_days} días`);
  line('Partidos próximos analizados',r.fixtures_in_window);
  line('Partidos realmente estudiados',r.examined);
  line('Modelos calculados',r.modeled??r.qualified??'—');
  line('Propuestas nuevas guardadas',r.drafts_created);
  if(r.reopened_old_discards!=null)line('Propuestas incompatibles recalculadas y recuperadas',r.reopened_old_discards);
  if(r.already_present!=null)line('Propuestas elegibles ya registradas',r.already_present);
  if(r.existing_by_status)line('Ya registradas (pendientes / descartadas / publicadas)',`${r.existing_by_status.draft||0} / ${r.existing_by_status.discarded||0} / ${r.existing_by_status.published||0}`);
  if(r.fixtures_without_time!=null)line('Partidos futuros sin hora exacta',r.fixtures_without_time);
  if(r.calendar_diagnostic){
   const d=r.calendar_diagnostic;
   line('Diagnóstico de calendario',d.diagnosis);
   line('Fechas dentro del rango sin hora utilizable',d.date_only_in_window);
   line('Horarios válidos dentro del rango',d.known_time_in_window);
   line('Horarios apartados por estado',d.known_time_blocked_status);
   line('Partidos futuros con hora (todos los días)',d.future_known_time);
   for(const league of d.per_league.filter(x=>x.date_only_in_window||x.known_time_in_window||x.known_time_blocked_status).slice(0,10))
    line(league.league,`${league.known_time_in_window} con hora · ${league.date_only_in_window} sin hora · ${league.known_time_blocked_status} por estado`);
  }
  if(r.next_fixture_beyond_window)line('Siguiente fuera de la ventana',`${r.next_fixture_beyond_window.match} · ${new Date(r.next_fixture_beyond_window.kickoff).toLocaleString('es-PE')}`);
  if(r.updated_existing_drafts!=null)line('Borradores actualizados con el nuevo modelo',r.updated_existing_drafts);
  if(r.eligible!=null)line('Propuestas elegibles (nuevas + existentes)',r.eligible);
  if(r.eligible_by_category)line('Clasificación de propuestas (GOLD / VIP; antiguas GRATIS)',`${r.eligible_by_category.gold||0} / ${r.eligible_by_category.vip||0} · ABIERTO: ${r.eligible_by_category.free||0}`);
  if(r.eligible_by_market){
   const names={'1x2':'1X2',over15:'Más de 1.5',over25:'Más de 2.5',under25:'Menos de 2.5',bttsYes:'Ambos marcan Sí',bttsNo:'Ambos marcan No','1X':'Doble oportunidad 1X','X2':'Doble oportunidad X2','12':'Doble oportunidad 12'};
   line('Propuestas por mercado',Object.entries(r.eligible_by_market).map(([key,value])=>`${names[key]||key}: ${value}`).join(' · ')||'Ninguna');
  }
  if(r.vip_rejections_by_market_reason){
   const reasons={invalid_market:'Mercado no admitido',vip_1x2_margin:'Margen 1X2 insuficiente',insufficient_recent_evidence:'Historial reciente insuficiente',missing_goal_sensitivity:'Datos insuficientes para sensibilidad',inconsistent_probability:'Probabilidad inconsistente',weak_nominal_edge:'Probabilidad o diferencia histórica insuficiente',fragile_prediction:'Predicción poco estable'};
   line('Filtros VIP (rechazos por mercado evaluado)',Object.entries(r.vip_rejections_by_market_reason).map(([key,value])=>`${reasons[key]||key}: ${value}`).join(' · ')||'Ninguno');
  }
  if(Array.isArray(r.per_competition)&&r.per_competition.length){
   for(const c of r.per_competition.slice(0,20))line(`Competición: ${c.league}`,`${c.examined} partidos · ${c.modeled} modelos · ${c.created} nuevas · ${c.existing} ya registradas · ${c.insufficient} sin historial · ${c.filtered} filtradas`);
  }
  if(Array.isArray(r.near_misses)&&r.near_misses.length){
   line('Partidos observados pero NO publicables',`${r.near_misses.length} ejemplos. Son diagnósticos, no recomendaciones.`);
   for(const m of r.near_misses.slice(0,5))line('En observación',`${m.match} · ${m.league} · ${m.reason}`);
  }
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
  const days=Number($('footballScanDays')?.value||30);
  const start=await api('/api/admin/football/scan',{method:'POST',body:JSON.stringify({days})});
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
  const byGroup=Object.entries(r.by_context||{}).map(([key,v])=>`${key==='national'?'Selecciones':'Clubes'}: ${v.evaluated||0} partidos modelados`).join(' · ');
  const comparison=r.comparison_previous?.paired_evaluated?
   ` Comparación sobre ${r.comparison_previous.paired_evaluated} partidos: anterior Brier ${r.comparison_previous.previous_brier}, nuevo Brier ${r.comparison_previous.current_brier}. ${r.comparison_previous.brier_difference<0?'Menor error en la muestra.':'No hay mejora demostrada en esta muestra.'}`:'';
  label.textContent=`Backtesting 1X2: ${r.evaluated} partidos · ${r.accuracy??'—'}% aciertos observados · Brier ${r.brier??'—'} · ${r.validated?'Muestra general alcanzada':'Muestra general insuficiente'}. ${byMarket?'Mercados: '+byMarket+'.':'Sin selecciones por mercado validadas.'} ${byGroup?byGroup+'. ':''}${comparison}`;
  await loadFootballEngine();
 }catch(e){label.textContent=e.message;}finally{button.disabled=false;}
});

// Owner-only informational VIP radar. Does not create football_candidates,
// does not classify any match VIP, and cannot send to the public channel.
function renderNearTermScouting(report,container,notice){
 if(!report)return;
 if(notice)notice.textContent=`Próximos ${report.near_term?.days||7} días: ${report.near_term?.detected||0} encuentros detectados en MySQL, ${report.near_term?.eligible||0} aptos para análisis informativo y ${report.near_term?.observations_total||0} pendientes de revisión. ${report.near_term?.message||''}`;
 if(!container)return;
 container.replaceChildren();
 for(const match of report.watchlist||[]){
  const card=document.createElement('div');card.className='football-ai-preview';
  const head=document.createElement('strong');head.textContent=`${match.home} vs. ${match.away}`;card.append(head);
  const detail=document.createElement('p');
  const when=match.kickoff?new Date(match.kickoff).toLocaleString('es-PE',{timeZone:'America/Lima'}):`${match.date||'Fecha pendiente'} (hora sin confirmar)`;
  detail.textContent=`${match.league} · ${when} · ${match.reason_text||'Pendiente de revisión'}`;card.append(detail);

  container.append(card);
 }
 if(!(report.watchlist||[]).length){
  const info=document.createElement('p');info.textContent=report.near_term?.missing_calendar
   ?'No se encontraron partidos para los próximos siete días en la base local. Comprueba el calendario y qué fuentes están habilitadas.'
   :'No hay encuentros adicionales pendientes de revisión en los próximos siete días.';
  container.append(info);
 }
}
async function renderVipRadar(){
 const label=$('footballVipRadarStatus'),list=$('footballVipRadarList');
 if(!label||!list)return;
 label.textContent='Comprobando los próximos siete días y la ventana de 30 días…';list.replaceChildren();
 try{
  const result=await api('/api/admin/football/vip-radar');
  const auto=$('footballVipRadarAuto');if(auto)auto.checked=Boolean(result.enabled);
  const last=result.last?.status?` · Último boletín VIP: ${result.last.status} · Adelanto oficial: ${result.last.public_status||'pendiente'}`:'';
  const first=result.next_eligible_at?` · Primer modelo apto: ${new Date(result.next_eligible_at).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú)`:' · No hay un primer modelo apto';
  label.textContent=`${result.eligible_total} partidos modelados desde ${result.from_hours} horas hasta ${result.lookahead_days} días · ${result.counts.without_history} sin historial${first}${last}.`;
  for(const match of result.items||[]){
   const card=document.createElement('div');card.className='football-ai-preview';
   const head=document.createElement('strong');head.textContent=`${match.home} vs ${match.away}`;card.append(head);
   const info=document.createElement('p');info.textContent=`${match.league} · ${new Date(match.kickoff).toLocaleString('es-PE',{timeZone:'America/Lima'})} (hora Perú) · Calidad del historial ${match.quality}/100`;card.append(info);
   const pp=match.probabilities;
   const probs=document.createElement('p');probs.textContent=`Estimación 1 / X / 2: ${pp.home}% / ${pp.draw}% / ${pp.away}%`;card.append(probs);
   if(match.ai){const ai=document.createElement('p');ai.textContent=`Híbrido IA exploratorio 1 / X / 2: ${match.ai.hybrid.home}% / ${match.ai.hybrid.draw}% / ${match.ai.hybrid.away}%`;card.append(ai);}

   list.append(card);
  }
  if(!(result.items||[]).length){const empty=document.createElement('p');empty.textContent='No hay encuentros con modelo y horario fiable a partir de 2 horas. Mira el diagnóstico de siete días debajo.';list.append(empty);}
  renderNearTermScouting(result,$('footballVipRadarWatchlist'),$('footballVipRadarNearStatus'));
 }catch(error){label.textContent='Radar VIP: '+error.message;}
}
$('footballVipRadarPreview')?.addEventListener('click',renderVipRadar);
$('footballVipRadarRefresh')?.addEventListener('click',async()=>{
 const btn=$('footballVipRadarRefresh'),label=$('footballVipRadarStatus');
 btn.disabled=true;label.textContent='Solicitando importación y análisis de calendario; puede tardar y respeta el límite de consultas.';
 try{
  const result=await api('/api/admin/football/import-scan',{method:'POST',body:'{}'});
  label.textContent=result.message||'Actualización iniciada. Vuelve a revisar el radar después de terminar la importación.';
 }catch(err){label.textContent='No se pudo iniciar la actualización: '+err.message;}
 finally{btn.disabled=false;}
});
// Owner-only Telegram diagnostics, separate from bulletin data and reservations.
$('footballRadarHealth')?.addEventListener('click',async()=>{
 const node=$('footballRadarTelegramHealth'),btn=$('footballRadarHealth');
 btn.disabled=true;node.textContent='Comprobando el bot y permisos de cada canal sin publicar mensajes…';
 try{
  const data=await api('/api/admin/telegram/channel-health');
  const describe=(name,status)=>`${name}: ${status?.ready?'✓ Conectado':'⚠ '+(status?.reason||'Sin conexión')}${status?.ready&&status.title?' · '+status.title:''}`;
  node.textContent=[describe('Bot',data.bot),describe('VIP',data.vip),describe('Oficial',data.official)].join(' | ');
 }catch(error){node.textContent='⚠ No se pudo comprobar Telegram: '+error.message;}
 finally{btn.disabled=false;}
});
$('footballRadarVipTest')?.addEventListener('click',async()=>{
 if(!confirm('¿Enviar un MENSAJE DE PRUEBA al canal VIP? No contiene pronósticos.'))return;
 const btn=$('footballRadarVipTest'),node=$('footballRadarTelegramHealth');btn.disabled=true;node.textContent='Probando envío al canal VIP…';
 try{const r=await api('/api/admin/telegram/vip-channel/test',{method:'POST',body:'{}'});
  node.textContent=`✓ Prueba enviada a VIP (${r.title}), mensaje #${r.message_id}.`;
 }catch(error){node.textContent='⚠ Prueba VIP fallida: '+error.message;}
 finally{btn.disabled=false;}
});
$('footballRadarOfficialTest')?.addEventListener('click',async()=>{
 if(!confirm('¿Enviar un MENSAJE DE PRUEBA al canal OFICIAL? Será visible para todos.'))return;
 const btn=$('footballRadarOfficialTest'),node=$('footballRadarTelegramHealth');btn.disabled=true;node.textContent='Probando envío al canal oficial…';
 try{const r=await api('/api/admin/telegram/free-channel/test',{method:'POST',body:'{}'});
  node.textContent=`✓ Prueba enviada al oficial (${r.title}), mensaje #${r.message_id}.`;
 }catch(error){node.textContent='⚠ Prueba oficial fallida: '+error.message;}
 finally{btn.disabled=false;}
});
$('footballVipRadarSend')?.addEventListener('click',async()=>{
 const btn=$('footballVipRadarSend'),label=$('footballVipRadarStatus');
 if(!confirm('¿Enviar el boletín informativo al canal VIP y un pequeño adelanto al canal oficial? Máximo un envío diario.'))return;
 btn.disabled=true;label.textContent='Revisando destino y preparando el boletín privado…';
 try{const result=await api('/api/admin/football/vip-radar/send',{method:'POST',body:'{}'});
  if(result.needs_confirmation){
   // Previous attempt (including legacy deployments) may have reached Telegram.
   // Only the owner can explicitly authorize one recovery after checking VIP.
   if(confirm('El envío anterior quedó SIN confirmar. Comprueba primero el canal VIP. ¿Confirmas que el boletín de HOY NO llegó allí y autorizas UN reintento?')){
    const retry=await api('/api/admin/football/vip-radar/send',{method:'POST',body:JSON.stringify({confirm_unsent:true})});
    Object.assign(result,retry);
   }
  }
  const publicResult=result.public_announcement;
  const publicNotice=publicResult?.state==='sent'?' Adelanto enviado también al canal oficial.':
    publicResult?.state==='skipped'?` El canal oficial no recibió adelanto: ${publicResult.reason||'destino no disponible'}`:
    publicResult?.state==='failed'?` El adelanto oficial falló: ${publicResult.reason||'revisa permisos'}`:'';
  label.textContent=result.sent?`Boletín informativo entregado a VIP con ${result.items} partidos.${publicNotice}${result.warning?' '+result.warning:''} No se ha publicado ninguna fija VIP oficial.`:result.already_sent?`Ya enviado hoy: ${result.reason} Adelanto oficial: ${result.public_status||'pendiente'}.`:result.reason||result.message||'No se envió el boletín.';
 }catch(error){label.textContent=error.message;}finally{btn.disabled=false;}
});
// Owner-only recovery for an earlier "sent" status that targeted the wrong
// Telegram chat. This is never automatically retried or invoked by the scheduler.
$('footballVipRadarResendConfirmed')?.addEventListener('click',async()=>{
 const button=$('footballVipRadarResendConfirmed'),label=$('footballVipRadarStatus');
 if(!confirm('¿Ya corregiste el canal VIP y comprobaste que el bot tiene permisos? Se enviará un mensaje REAL, no una prueba.'))return;
 if(!confirm('CONFIRMACIÓN DE REENVÍO EXCEPCIONAL: ¿verificaste que el boletín de HOY NO está en el canal VIP correcto? Si sí llegó, reenviarlo podría duplicarlo.'))return;
 button.disabled=true;label.textContent='Comprobando el canal VIP y recuperando el boletín de hoy…';
 try{
  const r=await api('/api/admin/football/vip-radar/recover-delivery',{method:'POST',body:JSON.stringify({destination:'vip',confirm_not_received:true})});
  const p=r.public_announcement;
  label.textContent=r.sent?`✓ Boletín VIP reenviado correctamente (mensaje #${r.message_id||'—'}). ${p?.state==='sent'?'Adelanto oficial enviado.':p?.state==='skipped'||p?.state==='failed'?`Adelanto oficial: ${p.reason||p.state}.`:'Consulta el estado del adelanto oficial.'} ${r.warning||''}`:
   `⚠ ${r.reason||'No pudo completarse el reenvío.'}`;
 }catch(error){label.textContent='⚠ Reenvío VIP: '+error.message;}
 finally{button.disabled=false;}
});
$('footballVipRadarRecoverOfficial')?.addEventListener('click',async()=>{
 const button=$('footballVipRadarRecoverOfficial'),label=$('footballVipRadarStatus');
 if(!confirm('¿Confirmas que el adelanto de HOY NO está publicado en el canal oficial? El anuncio se publicará ahora si Telegram lo permite.'))return;
 button.disabled=true;label.textContent='Recuperando únicamente el anuncio del canal oficial…';
 try{
  const r=await api('/api/admin/football/vip-radar/recover-delivery',{method:'POST',body:JSON.stringify({destination:'official',confirm_not_received:true})});
  label.textContent=r.sent?'✓ Adelanto enviado al canal oficial. No se ha reenviado el boletín privado.':
   `⚠ ${r.reason||r.public_announcement?.reason||'No se pudo enviar el adelanto.'}`;
 }catch(error){label.textContent='⚠ Adelanto oficial: '+error.message;}
 finally{button.disabled=false;}
});
$('footballVipRadarAuto')?.addEventListener('change',async()=>{
 const input=$('footballVipRadarAuto'),label=$('footballVipRadarStatus'),want=input.checked;
 input.disabled=true;
 try{const state=await api('/api/admin/football/vip-radar/settings',{method:'POST',body:JSON.stringify({enabled:want})});
  label.textContent=state.enabled?'Boletín automático activado: máximo uno al día desde las 09:00 (Perú), con adelanto en el canal oficial si está configurado.':'Boletín automático desactivado.';
 }catch(error){input.checked=!want;label.textContent='No se pudo guardar: '+error.message;}finally{input.disabled=false;}
});

// Research-only machine learning preview: the server never uses this to
// authorise GOLD/VIP or to auto-publish a candidate.
$('footballAiForecastButton')?.addEventListener('click',async()=>{
 const button=$('footballAiForecastButton'),notice=$('footballAiForecastStatus'),list=$('footballAiForecastList');
 button.disabled=true;notice.textContent='Calculando pronósticos históricos y comparación con IA…';list.replaceChildren();
 try{
  const r=await api('/api/admin/football/ai-forecasts');
  notice.textContent=r.message||'';
  const row=(heading,value)=>{const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=heading+': ';p.append(strong,document.createTextNode(String(value??'—')));list.append(p);};
  for(const [key,name] of [['club','Clubes'],['national','Selecciones']]){
   const m=r.models?.[key];
   row(`IA ${name}`,!m?'Sin entrenar (ejecuta backtest)':
    `${m.status==='promising_holdout'?'Mejoró en la muestra retrospectiva':m.status==='no_improvement'?'No demostró mejora':'Historial insuficiente'} · ${m.available||0} partidos${m.holdout?` · prueba posterior ${m.holdout} partidos · Brier Poisson ${m.holdout_baseline_brier} / híbrido ${m.holdout_hybrid_brier}`:''}`);
  }
  row('Partidos con historial insuficiente',r.missing_history||0);
  row('Inicio de la búsqueda',`Desde ${r.from_hours||2} horas hasta ${r.lookahead_days||30} días`);
  row('Calendario en próximos 7 días',`${r.near_term?.detected||0} detectados · ${r.near_term?.eligible||0} con modelo apto para Radar`);
  row('Partidos con modelo disponibles',r.forecasts?.length||0);
  for(const f of (r.forecasts||[])){
   const card=document.createElement('div');card.className='football-ai-preview';
   const h=document.createElement('strong');h.textContent=f.match;card.append(h);
   const p=document.createElement('p');p.textContent=`${f.competition} · ${f.kickoff?new Date(f.kickoff).toLocaleString('es-PE',{timeZone:'America/Lima'}):'Hora pendiente'} (hora Perú) · Calidad de historial ${f.quality}/100`;
   card.append(p);
   const o=document.createElement('p');o.textContent=`Poisson 1 / X / 2: ${f.poisson.home}% / ${f.poisson.draw}% / ${f.poisson.away}%`;card.append(o);
   const score=document.createElement('p');score.textContent=`Marcador orientativo del modelo Poisson: ${f.illustrative_score||'—'} (no significa que vaya a ocurrir)`;card.append(score);
   if(f.ai){const ai=document.createElement('p');ai.textContent=`IA 1 / X / 2: ${f.ai.ai.home}% / ${f.ai.ai.draw}% / ${f.ai.ai.away}% · Híbrido: ${f.ai.hybrid.home}% / ${f.ai.hybrid.draw}% / ${f.ai.hybrid.away}% · ${f.ai.status==='promising_holdout'?'Mejoró en prueba retrospectiva':'Sin mejora validada'}`;card.append(ai);}
   else{const warning=document.createElement('p');warning.textContent='IA no entrenada para este tipo de fútbol; solo existe el modelo Poisson.';card.append(warning);}
   const source=document.createElement('small');source.textContent=f.verified_live?'Estado NS verificado recientemente':'Horario/estado aún requieren verificación al publicar';card.append(source);
   list.append(card);
  }
  if(!(r.forecasts||[]).length)row('Sin pronósticos mostrables','Importa encuentros y amplía el historial; los partidos sin modelo no producen predicciones IA.');
  if((r.watchlist||[]).length){
   row('Próximos encuentros que todavía no puede analizar la IA','Partidos detectados que todavía requieren más datos para un modelo completo:');
   for(const m of r.watchlist.slice(0,8))row(`${m.home} vs. ${m.away}`,`${m.date||'Fecha pendiente'} · ${m.reason_text}`);
  }else if(r.near_term?.missing_calendar){
   row('Cobertura de los próximos 7 días','La base MySQL no contiene partidos próximos detectados para ese período. Activa una fuente compatible e importa el calendario.');
  }

 }catch(e){notice.textContent=e.message;}finally{button.disabled=false;}
});

// N-FORCE: reconcile only published fixture-linked predictions with trusted FT data.
$('footballSettleButton')?.addEventListener('click',async()=>{
 const button=$('footballSettleButton'),label=$('footballSettleResult');button.disabled=true;label.textContent='Comparando pronósticos pendientes con marcadores finales importados…';
 try{const r=await api('/api/admin/football/settle',{method:'POST',body:'{}'});
  label.textContent=r.busy?'Ya hay una comprobación en curso.':`Comprobados: ${r.reviewed} · Actualizados: ${r.settled} · Ganadas: ${r.won} · Perdidas: ${r.lost} · Anuladas: ${r.void} · Sin marcador reciente verificable: ${r.invalid_source} · Mercado no reconocible: ${r.unsupported}.`;
  await loadFootballEngine();await loadPredictions();
 }catch(e){label.textContent=e.message;}finally{button.disabled=false;}
});

// v3.8.2 · Persistent seasonal theme editor (owner only).
let seasonSaved=null;
const seasonThemeNames={elite:'Élite clásico',navidad:'Navidad',ano_nuevo:'Año Nuevo',san_valentin:'San Valentín',fiestas_patrias:'Fiestas Patrias',halloween:'Halloween',primavera:'Primavera'};
function seasonFormValues(){const f=$('seasonalThemeForm');return f?{mode:f.elements.mode.value,theme:f.elements.theme.value,motion:f.elements.motion.value}:null;}
function updateSeasonCurrent(settings){
 const item=$('seasonCurrent');if(!item)return;
 item.textContent=`Tema activo: ${seasonThemeNames[settings.activeTheme]||'Élite clásico'} · Modo ${settings.mode==='manual'?'manual':'automático'} · Animación ${settings.motion}.`;
}
async function loadSiteThemeSettings(){
 if(currentAdminRole!=='owner')return;
 try{
  const settings=await api('/api/admin/site-theme');seasonSaved=settings;
  const f=$('seasonalThemeForm');if(!f)return;
  f.elements.mode.value=settings.mode;f.elements.theme.value=settings.theme;f.elements.motion.value=settings.motion;
  updateSeasonCurrent(settings);$('seasonStatus').textContent='';
 }catch(err){$('seasonStatus').textContent='No se pudo cargar: '+err.message;}
}
$('seasonPreview')?.addEventListener('click',()=>{
 if(currentAdminRole!=='owner')return;
 const s=seasonFormValues();if(!s)return;
 window.FijasTheme?.preview(s.theme,s.motion);
 $('seasonStatus').textContent='Vista previa local. Para aplicarla a toda la web pulsa Guardar.';
});
$('seasonResetPreview')?.addEventListener('click',()=>{
 if(!seasonSaved)return;
 window.FijasTheme?.applyTheme(seasonSaved);
 $('seasonStatus').textContent='Vista previa restablecida.';
});
$('seasonalThemeForm')?.addEventListener('submit',async event=>{
 event.preventDefault();if(currentAdminRole!=='owner')return;
 const values=seasonFormValues(),button=$('seasonSave');button.disabled=true;
 $('seasonStatus').textContent='Guardando el tema…';
 try{
  const saved=await api('/api/admin/site-theme',{method:'PUT',body:JSON.stringify(values)});
  seasonSaved=saved;window.FijasTheme?.applyTheme(saved);updateSeasonCurrent(saved);
  $('seasonStatus').textContent='✓ Configuración guardada. El nuevo tema se aplica en las siguientes visitas y al actualizar páginas abiertas.';
 }catch(err){$('seasonStatus').textContent='Error: '+err.message;}
 finally{button.disabled=false;}
});
