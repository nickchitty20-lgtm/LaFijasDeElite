/* Fijas de Élite · Ambientación estacional. Visual-only, no external resources. */
(()=>{
 'use strict';
 const themes=['elite','navidad','ano_nuevo','san_valentin','fiestas_patrias','halloween','primavera'];
 const glyphs={elite:['✦','·','✧'],navidad:['❄','✦','❅'],ano_nuevo:['✧','✦','✳'],san_valentin:['♥','✧','·'],fiestas_patrias:['✦','✧','★'],halloween:['✧','✦','☾'],primavera:['✿','✦','❀']};
 const root=document.documentElement;
 const labels={elite:'Élite clásico',navidad:'Navidad',ano_nuevo:'Año Nuevo',san_valentin:'San Valentín',fiestas_patrias:'Fiestas Patrias',halloween:'Halloween',primavera:'Primavera'};
 let latest={mode:'automatico',theme:'elite',motion:'suave',activeTheme:'elite'};
 let override=null; // Only transient, never cached across visits.
 const pane=document.createElement('div');pane.className='fe-seasonal-atmosphere';pane.setAttribute('aria-hidden','true');
 function paint(){
  const theme=override||latest.activeTheme;
  root.dataset.feTheme=theme;
  root.dataset.feMotion=latest.motion;
  root.style.setProperty('--fe-theme-name',JSON.stringify(labels[theme]||labels.elite));
  pane.replaceChildren();
  const count=latest.motion==='apagado'?0:(matchMedia('(max-width: 700px)').matches?9:18);
  for(let i=0;i<count;i++){
   const item=document.createElement('span');item.className='fe-seasonal-particle';
   item.textContent=glyphs[theme][i%glyphs[theme].length];
   item.style.setProperty('--fe-x',`${(i*41+13)%100}%`);
   item.style.setProperty('--fe-y',`${(i*29+11)%100}%`);
   item.style.setProperty('--fe-size',`${i%4===0?26:15+(i%3)*4}px`);
   item.style.setProperty('--fe-delay',`${-((i*1.71)%21)}s`);
   item.style.setProperty('--fe-duration',`${18+(i%5)*6}s`);
   pane.append(item);
  }
  document.dispatchEvent(new CustomEvent('fe:theme-changed',{detail:{...latest,activeTheme:theme}}));
 }
 function applyTheme(data){
  const mode=data?.mode==='manual'?'manual':'automatico';
  const theme=themes.includes(data?.theme)?data.theme:'elite';
  const activeTheme=themes.includes(data?.activeTheme)?data.activeTheme:theme;
  const motion=['suave','normal','apagado'].includes(data?.motion)?data.motion:'suave';
  latest={mode,theme,activeTheme,motion};paint();
 }
 function preview(theme,motion){
  if(themes.includes(theme))latest.activeTheme=theme;
  if(['suave','normal','apagado'].includes(motion))latest.motion=motion;
  paint();
 }
 async function refresh(){
  try{
   const response=await fetch('/api/public/site-theme',{cache:'no-store',credentials:'same-origin'});
   if(response.ok)applyTheme(await response.json());
   else console.warn('FijasTheme: configuración no disponible',response.status);
  }catch(error){console.warn('FijasTheme: no se pudo actualizar el tema',error?.message||error);} // Offline still uses Élite.
 }
 if(document.body)document.body.prepend(pane);else document.addEventListener('DOMContentLoaded',()=>document.body.prepend(pane),{once:true});
 window.FijasTheme={refresh,preview,applyTheme,get:()=>({...latest}),clearVisitor:()=>{override=null;paint();}};
 paint();refresh();
 // Re-resolve scheduled themes when the page remains open overnight.
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
