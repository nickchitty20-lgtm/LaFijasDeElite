const $=id=>document.getElementById(id);
let token='';
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
 try{const r=await api('/api/auth/setup-owner',{method:'POST',body:JSON.stringify(body)});$('setupMsg').textContent=r.message;form.reset();await refreshSetup();setTimeout(()=>show('login'),1800);}catch(err){$('setupMsg').textContent=err.message;}
});
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;$('loginMsg').textContent='Comprobando acceso...';
 try{const body=Object.fromEntries(new FormData(form));const r=await api('/api/auth/login',{method:'POST',body:JSON.stringify(body)});token=r.token;form.reset();$('loginMsg').textContent='';await dashboard();}catch(err){$('loginMsg').textContent=err.message;}
});
async function dashboard(){
 try{const [me,overview]=await Promise.all([api('/api/admin/me'),api('/api/admin/overview')]);$('identity').textContent=`${me.email} · ${me.role}`;for(const key of ['users','active_memberships','pending_payments','predictions'])$(key).textContent=Number(overview.stats[key]||0).toLocaleString('es-PE');show('dashboard');await loadPredictions();await loadCommerce();}catch(err){token='';$('loginMsg').textContent=err.message;show('login');}
}
$('logout').addEventListener('click',()=>{token='';show('login');});
refreshSetup();

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
