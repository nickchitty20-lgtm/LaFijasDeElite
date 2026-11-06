/* Fijas de Élite v2.2.2 — Structured football report for authorized sessions. */
(()=>{'use strict';
const el=(tag,klass,text)=>{const node=document.createElement(tag);if(klass)node.className=klass;if(text!=null)node.textContent=String(text);return node;};
const unknown='Sin estimación disponible';
function addMetric(parent,label,value,detail=''){
 const card=el('div','fe-goal-metric');card.append(el('span','fe-goal-label',label),el('strong','fe-goal-value',value??unknown));
 if(detail)card.append(el('small','fe-goal-detail',detail));parent.append(card);
}
function goals(p){
 if(!p||p.locked||!p.football_details)return null;
 const f=p.football_details;const body=el('section','fe-goals-breakdown');
 body.append(el('h5','','⚽ Goles, mercados y escenarios'));
 const grid=el('div','fe-goal-metrics');
 addMetric(grid,'Total de goles',f.total_line?.market_label||null,'Línea orientativa del proveedor');
 addMetric(grid,'Goles del equipo local',f.home_line?.market_label||null,'No implica un marcador exacto');
 addMetric(grid,'Goles del visitante',f.away_line?.market_label||null,'No implica un marcador exacto');
 const h=f.historical;
 addMetric(grid,'Ambos equipos marcan',h&&h.both_scored!=null?`${h.both_scored} de ${h.games} antecedentes`:null,'Frecuencia H2H, NO probabilidad calibrada');
 addMetric(grid,'Marcador orientativo',f.estimated_score||null,'Escenario estadístico, no una apuesta segura');
 addMetric(grid,'Diferencia de goles',f.estimated_margin!=null&&f.estimated_score!=null?`${f.estimated_margin} gol(es)`:null,'Solo si hay marcador orientativo');
 body.append(grid);
 if(h){const history=el('p','fe-goal-history',`Historial H2H (${h.games} partidos): promedio local ${h.home_average??'—'}, visitante ${h.away_average??'—'}, total ${h.total_average??'—'} goles.`);body.append(history);}
 const probs=f.provider_1x2;
 if(probs&&(probs.home!=null||probs.draw!=null||probs.away!=null)){
  body.append(el('p','fe-goal-probabilities',`Estimación 1X2 del proveedor: local ${probs.home??'—'} % · empate ${probs.draw??'—'} % · visitante ${probs.away??'—'} %. No es una tasa real de acierto.`));
 }
 body.append(el('small','fe-goal-warning',f.disclaimer||'Datos orientativos sin garantías.'));
 return body;
}
function advanced(p){
 if(!p||p.locked||!p.football_details?.advanced)return null;
 const a=p.football_details.advanced,root=el('section','fe-goals-breakdown fe-advanced-report');
 root.append(el('h5','','🔎 Estudio avanzado: forma, bajas y alineaciones'));
 const status={available:'Datos disponibles',no_records:'Sin registros informados',pending:'Pendiente',partial:'Parcial',unavailable:'No disponible'};
 const grid=el('div','fe-goal-metrics');
 addMetric(grid,'Bajas reportadas',a.status?.injuries==='unavailable'?null:String(a.injuries?.reported??0),status[a.status?.injuries]||'No disponible');
 addMetric(grid,'Alineaciones',status[a.status?.lineups]||null,'Suelen publicarse cerca del inicio');
 addMetric(grid,'Estadísticas temporada',status[a.status?.season]||null,'Datos según la competición');
 root.append(grid);
 for(const [side,title] of [['home','LOCAL'],['away','VISITANTE']]){
  const part=el('div','fe-advanced-team');part.append(el('h6','',title));
  const f=a.form?.[side],stats=a.season?.[side],xi=a.lineups?.[side],injuries=a.injuries?.[side]||[];
  if(f?.form_pct!=null)part.append(el('p','',`Forma últimos 5: ${f.form_pct}% (índice del proveedor, no porcentaje de victorias)`));
  if(f?.goals_scored!=null&&f?.goals_allowed!=null)part.append(el('p','',`Goles últimos 5: ${f.goals_scored} a favor, ${f.goals_allowed} en contra`));
  if(stats?.played!=null)part.append(el('p','',`Temporada: ${stats.played} PJ · ${stats.wins??'—'} V / ${stats.draws??'—'} E / ${stats.losses??'—'} D · ${stats.avg_scored??'—'} GF por partido · ${stats.avg_conceded??'—'} GC por partido`));
  if(injuries.length)part.append(el('p','',`Bajas / dudas: ${injuries.map(i=>`${i.name} (${i.type}; ${i.reason})`).join('; ')}`));
  if(xi?.starting?.length)part.append(el('p','',`Once reportado ${xi.formation?'('+xi.formation+')':''}: ${xi.starting.join(', ')}`));
  if(!part.querySelector('p'))part.append(el('p','','Sin datos adicionales para este equipo.'));
  root.append(part);
 }
 if(a.risks?.length)root.append(el('p','fe-goal-warning',a.risks.join(' ')));
 root.append(el('small','fe-goal-warning','Información del proveedor; no asegura que el once sea definitivo ni que una baja determine el resultado.'));
 return root;
}
function pickInfo(p){
 const root=el('div','fe-betting-context');
 const row=el('div','fe-main-pick');
 row.append(el('span','', '🎯 Selección principal'),el('strong','',`${p.market||'Mercado no indicado'} · ${p.selection||'Sin selección'}`));
 root.append(row);
 const extra=el('p','fe-pick-odds',p.odds!=null?`Cuota indicada: ${p.odds} · verifica casa de apuestas y vigencia antes de usarla`:'Cuota del mercado principal: no verificada; no se puede calcular valor esperado');root.append(extra);
 // The live match clock is rendered separately, including for locked VIP cards.
 return root;
}
function analysis(p){
 if(!p.analysis)return null;
 const details=el('details','fe-full-research');details.append(el('summary','', '📋 Ver análisis detallado, evidencias y riesgos'));
 const content=el('p','',p.analysis);details.append(content);return details;
}
window.FijasPickReport={goals,advanced,pickInfo,analysis};
})();
