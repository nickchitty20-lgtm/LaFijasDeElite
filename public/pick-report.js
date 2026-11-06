/* Fijas de Élite v2.1.5 — Structured football report for authorized sessions. */
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
function pickInfo(p){
 const root=el('div','fe-betting-context');
 const row=el('div','fe-main-pick');
 row.append(el('span','', '🎯 Selección principal'),el('strong','',`${p.market||'Mercado no indicado'} · ${p.selection||'Sin selección'}`));
 root.append(row);
 const extra=el('p','fe-pick-odds',p.odds!=null?`Cuota indicada: ${p.odds} · verifica casa de apuestas y vigencia antes de usarla`:'Cuota del mercado principal: no verificada; no se puede calcular valor esperado');root.append(extra);
 if(p.match_date){const dt=new Date(p.match_date);if(!Number.isNaN(dt.getTime()))root.append(el('small','',`Inicio del partido: ${dt.toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'})}`));}
 return root;
}
function analysis(p){
 if(!p.analysis)return null;
 const details=el('details','fe-full-research');details.append(el('summary','', '📋 Ver análisis detallado, evidencias y riesgos'));
 const content=el('p','',p.analysis);details.append(content);return details;
}
window.FijasPickReport={goals,pickInfo,analysis};
})();
