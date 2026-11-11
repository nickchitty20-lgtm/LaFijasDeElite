/** Explain a zero-result N-FORCE scan without manufacturing selections.
 * Status is based on observed counts, never on a guessed probability.
 */
export function explainScan(report={}){
 const n=value=>Math.max(0,Number(value)||0);
 const fixtures=n(report.fixtures_in_window),modeled=n(report.modeled);
 const fresh=n(report.drafts_created),reopened=n(report.reopened_old_discards);
 const existing=n(report.already_present),insufficient=n(report.insufficient_history);
 const filtered=n(report.below_filters),cal=report.calendar_diagnostic||{};
 const suggestions=[];let code='new_drafts';
 if(fresh||reopened){code='new_drafts';suggestions.push('Revisa las propuestas pendientes antes de aprobarlas.');}
 else if(!fixtures){
  if(n(cal.date_only_in_window)){
   code='missing_kickoff';
   suggestions.push('Hay partidos con fecha, pero sin hora fiable. Actualiza el calendario o verifica el horario; no se generarán pronósticos con horas inventadas.');
  }else if(n(cal.future_known_time)){
   code='outside_window';suggestions.push('Hay partidos con hora fuera de la ventana o no válidos por estado. Revisa el próximo encuentro y el rango de búsqueda.');
  }else{code='missing_fixtures';suggestions.push('No hay partidos futuros utilizables. Comprueba la última importación y si existen archivos actuales para las competiciones.');}
 }else if(existing&&existing+insufficient+filtered>=fixtures){
  if(existing===fixtures){code='already_registered';suggestions.push('Todos los partidos aptos ya están registrados. Revisa Pendientes y Descartadas: un escaneo no duplica partidos.');}
  else{code='mixed';suggestions.push('Hay propuestas ya registradas; revisa Pendientes y Descartadas. Los demás partidos no superaron los requisitos del modelo.');}
 }else if(!modeled){code='insufficient_history';suggestions.push('Hay encuentros futuros, pero no alcanza el historial reciente de ambos equipos o de su competición. Importar resultados más completos puede ayudar.');}
 else if(filtered){code='strict_filters';suggestions.push('El motor calculó modelos, pero ninguna selección alcanzó los filtros estadísticos. No se reducirán esos filtros para forzar publicaciones.');}
 else{code='no_new';suggestions.push('No se obtuvieron propuestas nuevas. Comprueba el detalle por competición y el último escaneo.');}
 if(code==='missing_kickoff'&&n(cal.known_time_in_window)){
  // Some known schedules may have been removed by timing/other constraints.
  suggestions.push('Consulta los encuentros descartados por estado o por empezar demasiado pronto.');
 }
 return {code,headline:({new_drafts:'Hay propuestas para revisar',missing_kickoff:'Faltan horas confirmadas',outside_window:'Partidos fuera del rango',missing_fixtures:'Sin encuentros programados utilizables',already_registered:'Propuestas existentes, no nuevas',mixed:'Escaneo con resultados mixtos',insufficient_history:'Falta historial suficiente',strict_filters:'Ninguna selección superó los filtros',no_new:'Sin propuestas nuevas'})[code],suggestions};
}
export function tallyCompetition(perCompetition,match,outcome){
 const code=String(match.competition||'sin_codigo');
 if(!perCompetition[code])perCompetition[code]={competition:code,league:String(match.league||code),examined:0,modeled:0,insufficient:0,filtered:0,eligible:0,created:0,existing:0};
 const entry=perCompetition[code];
 entry.examined++;
 if(outcome==='insufficient')entry.insufficient++;
 if(outcome==='filtered'){entry.modeled++;entry.filtered++;}
 if(outcome==='new'){entry.modeled++;entry.eligible++;entry.created++;}
 if(outcome==='existing'){entry.modeled++;entry.eligible++;entry.existing++;}
 if(outcome==='reopened'){entry.modeled++;entry.eligible++;}
}
