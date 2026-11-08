/** Customer and Telegram presentation layer only. Never alter stored provenance.
 * External provenance is still explained as third-party and non-official. */
export function publicAnalysisText(value){
 if(value==null)return '';
 return String(value)
  .replace(/(?:OpenFootball(?:\s+football\.json)?(?:\s+CC0(?:-1\.0)?)?|API[- ]?Football|API[- ]?Sports|football-data\.org)/gi,'datos deportivos de terceros')
  .replace(/\bFuente\s*:/gi,'Datos de referencia:');
}
