"use strict";
const el=id=>document.getElementById(id);
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=n=>Number(n).toLocaleString('es-PE',{minimumFractionDigits:0,maximumFractionDigits:2});
const days=n=>Number(n)===1?'1 día':`${Number(n)} días`;
async function loadPlans(){try{const r=await fetch('/api/plans');if(!r.ok)throw Error();const j=await r.json();if(!Array.isArray(j.plans)||!j.plans.length){el('planGrid').innerHTML='<div class="loading">Pronto anunciaremos nuestros planes VIP.</div>';return;}el('planGrid').innerHTML=j.plans.map((p,i)=>`<article class="plan ${i===1?'featured':''}">${i===1?'<span class="tag">MÁS ELEGIDO</span>':''}<h3>${clean(p.name)}</h3><div class="price"><small>S/</small>${price(p.price_pen)}</div><span class="duration">Acceso durante ${days(p.duration_days)}</span><hr><ul><li>Pronósticos exclusivos VIP</li><li>Análisis y selecciones</li><li>Historial de publicaciones</li></ul><a class="button ${i===1?'gold':'ghost'}" href="/clientes.html?plan=${encodeURIComponent(p.id)}">Elegir este plan ↗</a></article>`).join('');}catch{el('planGrid').innerHTML='<div class="loading">No pudimos cargar los planes. Intenta nuevamente más tarde.</div>';}}
async function loadPicks(){try{const r=await fetch('/api/predictions/teasers');if(!r.ok)throw Error();const j=await r.json();const items=Array.isArray(j.predictions)?j.predictions:[];if(!items.length){el('picks').innerHTML='<div class="loading">Próximamente publicaremos pronósticos.</div>';return;}el('picks').innerHTML=items.slice(0,6).map(p=>`<article class="pick locked-pick"><span class="league">${clean(p.league||'Fútbol')} · ${p.visibility==='vip'?'VIP':'GRATIS'}</span><h3>${clean(p.title)}</h3><div class="lock-symbol" aria-hidden="true">🔒</div><p>${p.visibility==='vip'?'Selección exclusiva para miembros VIP.':'Regístrate o inicia sesión para consultar este pronóstico.'}</p><a class="button ghost" href="/clientes.html">${p.visibility==='vip'?'Ver planes VIP':'Iniciar sesión'} ↗</a></article>`).join('');}catch{el('picks').innerHTML='<div class="loading">Pronósticos no disponibles.</div>';}}
el('year').textContent=new Date().getFullYear();loadPlans();loadPicks();

// Public performance: never synthesize percentages, and do not expose VIP selections.
const perfNumber=v=>Number(v||0).toLocaleString('es-PE');
const perfPercent=v=>v==null?'—':`${Number(v).toLocaleString('es-PE',{maximumFractionDigits:1})} %`;
const performanceStatus={won:['Ganado','won'],lost:['Perdido','lost'],void:['Anulado','void']};
function performanceCard(title,value,hint='',accent=''){
 return `<div class="performance-card ${accent}"><span>${clean(title)}</span><strong>${clean(value)}</strong><small>${clean(hint)}</small></div>`;
}
function performanceSplit(title,stats){
 const w=Number(stats?.won||0),l=Number(stats?.lost||0),total=w+l;
 const rate=stats?.accuracy==null?'Aún sin resultados':perfPercent(stats.accuracy);
 return `<article class="performance-split"><div class="performance-split-top"><strong>${clean(title)}</strong><span>${clean(rate)} de acierto registrado</span></div>${total?`<progress class="performance-progress" max="${total}" value="${w}" aria-label="${w} ganados de ${total} decididos"></progress>`:`<div class="performance-progress-empty" aria-label="Sin resultados todavía"></div>`}<small>${perfNumber(w)} ganados · ${perfNumber(l)} perdidos · ${perfNumber(stats?.void)} anulados</small></article>`;
}
async function loadPublicPerformance(){
 const summary=el('performanceStats'),breakdown=el('performanceBreakdown'),history=el('performanceRecent');
 if(!summary||!breakdown||!history)return;
 const period=el('performancePeriod').value,visibility=el('performanceVisibility').value;
 try{
  const result=await fetch(`/api/public/performance?period=${encodeURIComponent(period)}&visibility=${encodeURIComponent(visibility)}`,{headers:{Accept:'application/json'}});
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
   performanceCard('Pendientes',perfNumber(v.pending),'Aún sin resultado'),
   performanceCard('Tasa de acierto',perfPercent(v.accuracy),`${perfNumber(v.decided)} pronósticos decididos`,'highlight')
  ].join('');
  breakdown.innerHTML=visibility==='all'?performanceSplit('Pronósticos gratuitos',data.by_visibility?.free)+performanceSplit('Pronósticos VIP',data.by_visibility?.vip):performanceSplit(visibility==='free'?'Pronósticos gratuitos':'Pronósticos VIP',v);
  const recent=Array.isArray(data.recent)?data.recent:[];
  if(!recent.length)history.innerHTML='<div class="performance-empty">Todavía no hay resultados registrados para este filtro. Los primeros aparecerán aquí cuando se marque un resultado real.</div>';
  else history.innerHTML=recent.map(p=>{
   const [label,style]=performanceStatus[p.outcome]||['Pendiente','pending'];
   const date=p.match_date?new Date(p.match_date):null;
   const dateText=date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Lima'}).format(date):'Fecha no registrada';
   return `<div class="performance-result"><span class="performance-result-match"><strong>${clean(p.title)}</strong><small>#${clean(p.id)} · ${clean(p.league||'Fútbol')} · ${p.visibility==='vip'?'VIP':'GRATIS'} · ${clean(dateText)}${p.withdrawn?' · Retirado':''}</small></span><span class="performance-tag ${style}">${label}</span></div>`;
  }).join('');
  const withdrawn=Number(v.archived||0);
  el('performanceNote').textContent=`Datos calculados desde los pronósticos publicados en MySQL. ${withdrawn?`Se incluyen ${withdrawn} pronóstico(s) retirado(s). `:''}Los resultados son introducidos por la administración y aún no están verificados automáticamente contra marcadores oficiales. Tasa = ganados ÷ (ganados + perdidos); no incluye pendientes ni anulados. Los aciertos pasados no garantizan los próximos.`;
  el('performanceUpdated').textContent='Actualizado: '+new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(data.generated_at));
 }catch(e){summary.innerHTML='<p class="performance-empty">Las estadísticas no están disponibles en este momento.</p>';breakdown.replaceChildren();history.innerHTML='<p class="performance-empty">Vuelve a intentar más tarde.</p>';el('performanceUpdated').textContent='Sin conexión';}
}
for(const id of ['performancePeriod','performanceVisibility'])el(id)?.addEventListener('change',loadPublicPerformance);
loadPublicPerformance();
