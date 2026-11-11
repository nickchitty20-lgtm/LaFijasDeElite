"use strict";
const el=id=>document.getElementById(id);
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=n=>Number(n).toLocaleString('es-PE',{minimumFractionDigits:0,maximumFractionDigits:2});
const days=n=>Number(n)===1?'1 día':`${Number(n)} días`;
// v3.5.3: GOLD receives future automatic OPEN-profile picks; VIP retains its higher gate.
function renderMembershipPlans(plans){
 const vipPlans=Array.isArray(plans)?plans.filter(p=>p.tier!=='gold'&&Number(p.price_pen)>0):[];
 const goldPlans=Array.isArray(plans)?plans.filter(p=>p.tier==='gold'&&Number(p.price_pen)>0):[];
 const goldMonthly=goldPlans.find(p=>Number(p.duration_days)===30)||goldPlans[0];
 const monthly=vipPlans.find(p=>Number(p.duration_days)===30)||vipPlans.find(p=>Number(p.duration_days)>=30)||vipPlans[0];
 const vipPrice=monthly?`<div class="price"><small>S/</small>${price(monthly.price_pen)}</div><span class="duration">${days(monthly.duration_days)} · Precio configurado en el sistema</span>`:'<p class="plan-price-pending">Precios disponibles próximamente</p>';
 const vipOffers=vipPlans.length?`<div class="membership-terms"><span>Duraciones disponibles</span><div>${vipPlans.map(p=>`<a href="/clientes.html?plan=${encodeURIComponent(p.id)}" data-plan-auth="${encodeURIComponent(p.id)}" data-plan-name="${clean(p.name)}">${days(p.duration_days)} · S/ ${price(p.price_pen)}</a>`).join('')}</div></div>`:'<p class="membership-terms">Consulta la disponibilidad del plan VIP.</p>';
 return `<article class="plan tier-card tier-gold" aria-label="Membresía Élite Gold">
   <span class="tier-kicker">✧ MEMBRESÍA INTERMEDIA</span><h3>ÉLITE <em>GOLD</em></h3>
   ${goldMonthly?`<div class="price"><small>S/</small>${price(goldMonthly.price_pen)}</div><span class="duration">${days(goldMonthly.duration_days)} · Precio configurado en el sistema</span>`:'<p class="plan-price-pending">Precios próximamente</p>'}
   <p class="tier-explainer">Selecciones GOLD por mensaje directo a tu Telegram vinculado, con acceso controlado y lista blanca propia del nivel GOLD.</p>
   <ul><li>Selecciones GOLD exclusivas</li><li>Análisis y evaluación de riesgos</li><li>Envío privado automático al aprobar una fija GOLD</li><li>Lista blanca GOLD ligada a tu Telegram vinculado</li><li>Sin exposición pública de la selección completa</li></ul>
   ${goldPlans.length?`<div class="membership-terms"><span>Duraciones disponibles</span><div>${goldPlans.map(p=>`<a href="/clientes.html?plan=${encodeURIComponent(p.id)}" data-plan-auth="${encodeURIComponent(p.id)}" data-plan-name="${clean(p.name)}">${days(p.duration_days)} · S/ ${price(p.price_pen)}</a>`).join('')}</div></div>`:''}
   ${goldMonthly?`<a class="button gold" href="/clientes.html?plan=${encodeURIComponent(goldMonthly.id)}" data-plan-auth="${encodeURIComponent(goldMonthly.id)}" data-plan-name="${clean(goldMonthly.name)}">Acceder a GOLD ↗</a>`:'<span class="tier-soon">Inscripciones temporalmente no disponibles</span>'}
 </article>
 <article class="plan tier-card tier-vip featured" aria-label="Membresía Élite VIP">
   <span class="tag">NIVEL MÁXIMO</span><span class="tier-kicker">♛ MEMBRESÍA SUPERIOR</span><h3>ÉLITE <em>VIP</em></h3>
   ${vipPrice}<p class="tier-explainer">Nuestro nivel máximo, con filtros más exigentes, acceso preferente y la cobertura más completa del servicio.</p>
   <ul><li>Pronósticos VIP con filtros exigentes</li><li>Informes detallados y evaluación de riesgos</li><li>Canal privado VIP y alertas</li><li>Prioridad máxima dentro del ecosistema</li><li>Incluye también las selecciones GOLD por privado</li></ul>
   ${vipOffers}
   ${monthly?`<a class="button gold" href="/clientes.html?plan=${encodeURIComponent(monthly.id)}" data-plan-auth="${encodeURIComponent(monthly.id)}" data-plan-name="${clean(monthly.name)}">Acceder a VIP ↗</a>`:'<span class="tier-soon">Inscripciones temporalmente no disponibles</span>'}
 </article>`;
}
async function loadPlans(){
 const target=el('planGrid');if(!target)return;
 try{const r=await fetch('/api/plans');if(!r.ok)throw Error('Planes no disponibles');
  const j=await r.json();target.innerHTML=renderMembershipPlans(j.plans||[]);
 }catch{target.innerHTML=renderMembershipPlans([]);}
}
// Fecha real del encuentro (UTC en MySQL), convertida a hora de Perú.
// Se muestra incluso en adelantos VIP sin revelar su selección.
function teaserKickoff(value){
 const formatted=window.FijasMatchSchedule?.formatDate(value);
 return `<p class="pick-kickoff">🗓 Inicio del partido: ${formatted?clean(formatted)+' · Hora de Perú':'horario no disponible'}</p>`;
}
async function loadPicks(){try{const r=await fetch('/api/predictions/teasers');if(!r.ok)throw Error();const j=await r.json();const items=Array.isArray(j.predictions)?j.predictions:[];if(!items.length){el('picks').innerHTML='<div class="loading">Próximamente publicaremos pronósticos.</div>';return;}el('picks').innerHTML=items.slice(0,6).map(p=>`<article data-pick-id="${clean(p.id)}" class="pick locked-pick"><span class="league">${clean(p.league||'Fútbol')} · ${p.visibility==='vip'?'VIP':p.visibility==='gold'?'GOLD':'ABIERTO'}</span><h3>${clean(p.title)}</h3>${teaserKickoff(p.match_date)}<div class="lock-symbol" aria-hidden="true">🔒</div><p>${p.visibility==='vip'?'Selección exclusiva para miembros VIP.':p.visibility==='gold'?'Selección GOLD para GOLD y VIP.':'Vista abierta del proyecto. Inicia sesión para seguir el panel completo.'}</p><a class="button ghost" href="/clientes.html" data-auth-open="login">${p.visibility==='vip'?'Ver planes VIP':p.visibility==='gold'?'Ver planes GOLD':'Entrar al panel'} ↗</a></article>`).join('');for(const node of el('picks').querySelectorAll('[data-pick-id]')){const p=items.find(x=>String(x.id)===node.dataset.pickId);const placeholder=node.querySelector('.pick-kickoff');if(p&&placeholder){const card=window.FijasMatchSchedule?.render(p.match_date,{prediction_id:p.id});if(card)placeholder.replaceWith(card);}}}catch{el('picks').innerHTML='<div class="loading">Pronósticos no disponibles.</div>';}}
async function loadTelegramCommunity(){
 try{
  const response=await fetch('/api/public/telegram');if(!response.ok)return;
  const links=await response.json();
  for(const [id,url] of [
   ['telegramFreeChannelCta',links.free_channel_url],
   ['telegramFreeChannelFooter',links.free_channel_url],
   ['telegramFreeGroupFooter',links.free_group_url]
  ]){
   const anchor=el(id);
   if(anchor && typeof url==='string' && /^https:\/\/t\.me\//i.test(url)){
    anchor.href=url;anchor.hidden=false;
   }
  }
 }catch{/* Telegram links are optional. */}
}
el('year').textContent=new Date().getFullYear();loadPlans();loadPicks();loadTelegramCommunity();

// Public performance: never synthesize percentages, and do not expose VIP selections.
const perfNumber=v=>Number(v||0).toLocaleString('es-PE');
const MIN_PUBLIC_RESULTS=30;
const publicAccuracy=v=>{const decided=Number(v?.won||0)+Number(v?.lost||0);return decided>=MIN_PUBLIC_RESULTS?perfPercent(v?.accuracy):'En seguimiento';};
const perfPercent=v=>v==null?'—':`${Number(v).toLocaleString('es-PE',{maximumFractionDigits:1})} %`;
const performanceStatus={won:['Ganado','won'],lost:['Perdido','lost'],void:['Anulado','void']};
function performanceCard(title,value,hint='',accent=''){
 return `<div class="performance-card ${accent}"><span>${clean(title)}</span><strong>${clean(value)}</strong><small>${clean(hint)}</small></div>`;
}
function performanceSplit(title,stats,category){
 const w=Math.max(0,Number(stats?.won)||0);
 const l=Math.max(0,Number(stats?.lost)||0);
 const v=Math.max(0,Number(stats?.void)||0);
 const p=Math.max(0,Number(stats?.pending)||0);
 const decided=w+l;
 const accuracy=decided===0?'—':decided>=MIN_PUBLIC_RESULTS?perfPercent(Math.round(w/decided*1000)/10):'En seguimiento';
 const share=decided?`${perfNumber(w)} ganadas de ${perfNumber(decided)} decididas`:'Sin resultados decididos';
 return `<article class="performance-split ${category==='vip'?'is-vip':'is-free'}" aria-label="Resultados de ${clean(title)}">
  <div class="performance-split-top"><span class="performance-group-name">${category==='vip'?'♛':category==='gold'?'✦':'◌'} ${clean(title)}</span><span class="performance-group-label">DATOS REGISTRADOS</span></div>
  <div class="performance-compare-primary"><div><small>Ganadas</small><strong class="performance-compare-won">${perfNumber(w)}</strong></div><div><small>Tasa de acierto</small><strong class="performance-compare-rate">${clean(accuracy)}</strong></div></div>
  <div class="performance-compare-counts"><span>Perdidas <b>${perfNumber(l)}</b></span><span>Anuladas <b>${perfNumber(v)}</b></span><span>Pendientes <b>${perfNumber(p)}</b></span></div>
  ${decided?`<progress class="performance-progress" max="${decided}" value="${w}" aria-label="${share}"></progress>`:`<div class="performance-progress-empty" aria-label="Sin resultados decididos"></div>`}
  <p class="performance-compare-foot">${share}. Porcentajes destacados desde 30 resultados decididos; las derrotas siempre cuentan.</p>
 </article>`;
}

function quickSplit(title,v,variant){
 const decided=Number(v?.won||0)+Number(v?.lost||0);
 return `<article class="spotlight-card ${variant}"><div class="spotlight-card-head"><span>${variant==='vip'?'♛':'⚽'} ${clean(title)}</span><small>HISTORIAL REGISTRADO</small></div>
 <strong class="spotlight-rate">${clean(publicAccuracy(v))}</strong><span class="spotlight-label">${perfNumber(decided)} resultados decididos · Porcentaje visible desde 30</span>
 <div class="spotlight-counts"><span>Ganadas <b>${perfNumber(v?.won)}</b></span><span>Perdidas <b>${perfNumber(v?.lost)}</b></span><span>Anuladas <b>${perfNumber(v?.void)}</b></span></div>
 <p>Cotejos automáticos: ${perfNumber(v?.source_checked)} · Registros manuales: ${perfNumber(v?.manual_checked)}.</p></article>`;
}
async function loadQuickPerformance(){
 const target=el('performanceQuickCards');if(!target)return;
 try{const r=await fetch('/api/public/performance?period=all&visibility=all',{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error();
  const d=await r.json();target.innerHTML=quickSplit('VIP',d.by_visibility?.vip,'vip')+quickSplit('GOLD',d.by_visibility?.gold,'gold')+quickSplit('Abierto',d.by_visibility?.free,'free');
  el('performanceQuickSummary').textContent='Historial completo, incluidas derrotas. Tasas públicas desde 30 resultados decididos.';
 }catch{target.innerHTML='<p class="performance-empty">Todavía no fue posible cargar el historial. Consulta la sección Resultados.</p>';}
}
loadQuickPerformance();

async function loadPublicPerformance(){
 const summary=el('performanceStats'),breakdown=el('performanceBreakdown'),history=el('performanceRecent');
 if(!summary||!breakdown||!history)return;
 const period=el('performancePeriod').value,visibility=el('performanceVisibility').value;
 try{
  const result=await fetch(`/api/public/performance?period=${encodeURIComponent(period)}&visibility=${encodeURIComponent(visibility)}`,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!result.ok)throw Error('No se pudo cargar');
  const data=await result.json();
  // Ignore any superseded slower response when a visitor rapidly changes filters.
  if(period!==el('performancePeriod').value||visibility!==el('performanceVisibility').value)return;
  const v=data.overall||{};
  summary.innerHTML=[
   performanceCard('Pronósticos publicados',perfNumber(v.total),'Incluye retirados'),
   performanceCard('Ganados',perfNumber(v.won),'Resultado registrado','positive'),
   performanceCard('Perdidos',perfNumber(v.lost),'También cuentan retirados','negative'),
   performanceCard('Anulados',perfNumber(v.void),'No afectan la tasa'),
   performanceCard('Pendientes',perfNumber(v.pending),'Activos, sin resultado'),
   performanceCard('Tasa de acierto',publicAccuracy(v),`${perfNumber(v.decided)} pronósticos decididos · Mínimo 30 para mostrar %`,'highlight')
  ].join('');
  breakdown.innerHTML=visibility==='all'?performanceSplit('Pronósticos VIP',data.by_visibility?.vip,'vip')+performanceSplit('Pronósticos GOLD',data.by_visibility?.gold,'gold')+performanceSplit('Pronósticos abiertos',data.by_visibility?.free,'free'):performanceSplit(visibility==='free'?'Pronósticos abiertos':visibility==='gold'?'Pronósticos GOLD':'Pronósticos VIP',v,visibility);
  el('performanceComparisonHint').textContent=visibility==='all'?'Las tres categorías en el mismo período. Tasas visibles desde 30 resultados decididos por categoría.':'Selecciona «Abierto + GOLD + VIP» para comparar las tres categorías.';
  const recent=Array.isArray(data.recent)?data.recent:[];
  if(!recent.length)history.innerHTML='<div class="performance-empty">Todavía no hay resultados registrados para este filtro. Los primeros aparecerán aquí cuando se marque un resultado real.</div>';
  else history.innerHTML=recent.map(p=>{
   const [label,style]=performanceStatus[p.outcome]||['Pendiente','pending'];
   const dateText=window.FijasMatchSchedule?.formatDate(p.match_date)||'Horario no registrado';
   return `<div class="performance-result"><span class="performance-result-match"><strong>${clean(p.title)}</strong><small>#${clean(p.id)} · ${clean(p.league||'Fútbol')} · ${p.visibility==='vip'?'VIP':p.visibility==='gold'?'GOLD':'ABIERTO'} · ${clean(dateText)}${p.withdrawn?' · Retirado':''}${p.score?' · Marcador '+clean(p.score):''} · ${p.result_source==='automatic'?'Cotejo automático':p.result_source==='manual'?'Registro manual':'Registro anterior'}</small></span><span class="performance-tag ${style}">${label}</span></div>`;
  }).join('');
  const withdrawn=Number(v.archived||0);
  el('performanceNote').textContent=`Resultados registrados: ${perfNumber(v.source_checked)} cotejos automáticos y ${perfNumber(v.manual_checked)} registros manuales. ${withdrawn?`Se incluyen ${withdrawn} pronóstico(s) retirado(s) en el historial; ${perfNumber(v.retired_unsettled)} retirado(s) sin resultado no cuentan como pendientes. `:''}La tasa de acierto considera ganadas y perdidas, sin pendientes ni anuladas. Los resultados anteriores no garantizan futuros aciertos.`;
  el('performanceUpdated').textContent='Actualizado: '+new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(data.generated_at));
 }catch(e){summary.innerHTML='<p class="performance-empty">Las estadísticas no están disponibles en este momento.</p>';breakdown.replaceChildren();history.innerHTML='<p class="performance-empty">Vuelve a intentar más tarde.</p>';el('performanceUpdated').textContent='Sin conexión';}
}
for(const id of ['performancePeriod','performanceVisibility'])el(id)?.addEventListener('change',loadPublicPerformance);
loadPublicPerformance();

// Show provider-mandated attribution only while the owner has enabled and
// configured the optional third calendar source. Never expose credentials.
(async()=>{
 try{
  const response=await fetch('/api/public/data-credit',{cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(data.active&&typeof data.credit==='string'&&data.credit.length<120){
   const footer=document.querySelector('footer');if(!footer)return;
   const credit=document.createElement('small');credit.className='fe-data-credit';credit.textContent=data.credit;
   footer.append(credit);
  }
 }catch{}
})();
