/** Customer and Telegram presentation layer only. Never alter stored provenance.
 * External provenance is still explained as third-party and non-official. */
export function publicAnalysisText(value){
 if(value==null)return '';
 return String(value)
  .replace(/\b(?:N[- ]?FORCE\s+)?FOOTBALL\s+INTELLIGENCE\b/gi,'N-FORCE')
  .replace(/(?:OpenFootball(?:\s+football\.json)?(?:\s+CC0(?:-1\.0)?)?|API[- ]?Football|API[- ]?Sports|football-data\.org)/gi,'datos deportivos de terceros')
  .replace(/\bFuente\s*:/gi,'Datos de referencia:')
  .replace(/(?:Estos ajustes no garantizan mayor acierto\.|Ningún pronóstico es una certeza\.|Sin cuotas verificadas ni rentabilidad demostrada\.|Los resultados anteriores no garantizan futuros aciertos\.)/gi,'')
  .replace(/[ \t]+\n/g,'\n')
  .replace(/\n{3,}/g,'\n\n').trim();
}
