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
 try{const [me,overview]=await Promise.all([api('/api/admin/me'),api('/api/admin/overview')]);$('identity').textContent=`${me.email} · ${me.role}`;for(const key of ['users','active_memberships','pending_payments','predictions'])$(key).textContent=Number(overview.stats[key]||0).toLocaleString('es-PE');show('dashboard');}catch(err){token='';$('loginMsg').textContent=err.message;show('login');}
}
$('logout').addEventListener('click',()=>{token='';show('login');});
refreshSetup();
