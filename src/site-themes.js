// Fijas de Élite: visual-only seasonal themes. No prediction, payment, or Telegram logic.
export const SITE_THEMES=Object.freeze(['elite','navidad','ano_nuevo','san_valentin','fiestas_patrias','halloween','primavera']);
export const SITE_THEME_MODES=Object.freeze(['automatico','manual']);
export const SITE_THEME_MOTION=Object.freeze(['suave','normal','apagado']);
export const DEFAULT_SITE_THEME=Object.freeze({mode:'automatico',theme:'elite',motion:'suave'});

function limaParts(now){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',month:'numeric',day:'numeric'}).formatToParts(now);
 return Object.fromEntries(parts.filter(p=>p.type==='month'||p.type==='day').map(p=>[p.type,Number(p.value)]));
}
export function themeForDate(now=new Date()){
 const {month,day}=limaParts(now);
 if((month===12&&day>=27)||(month===1&&day<=6))return 'ano_nuevo';
 if(month===12&&day<=26)return 'navidad';
 if(month===2&&day>=10&&day<=15)return 'san_valentin';
 if(month===7&&day>=25&&day<=30)return 'fiestas_patrias';
 if((month===10&&day>=25)||(month===11&&day<=2))return 'halloween';
 if(month===9&&day>=21&&day<=25)return 'primavera';
 return 'elite';
}
export function sanitizeSiteTheme(row={}){
 return {
  mode:SITE_THEME_MODES.includes(row.mode)?row.mode:DEFAULT_SITE_THEME.mode,
  theme:SITE_THEMES.includes(row.theme)?row.theme:DEFAULT_SITE_THEME.theme,
  motion:SITE_THEME_MOTION.includes(row.motion)?row.motion:DEFAULT_SITE_THEME.motion
 };
}
export function effectiveSiteTheme(row={},now=new Date()){
 const settings=sanitizeSiteTheme(row);
 return {...settings,activeTheme:settings.mode==='automatico'?themeForDate(now):settings.theme};
}
