/* Fijas de Élite v3.8.4 · Ambientaciones festivas con movimiento REAL.
   Todas las ilustraciones SVG se crean localmente: sin redes, librerías ni imágenes externas. */
(()=>{
 'use strict';
 const THEMES=['elite','navidad','ano_nuevo','san_valentin','fiestas_patrias','halloween','primavera'];
 const MOTIONS=['suave','normal','intenso','apagado'];
 const NAMES={elite:'Élite clásico',navidad:'Navidad',ano_nuevo:'Año Nuevo',san_valentin:'San Valentín',fiestas_patrias:'Fiestas Patrias',halloween:'Halloween',primavera:'Primavera'};
 const root=document.documentElement;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const mobile=window.matchMedia?.('(max-width: 700px)');
 let latest={mode:'automatico',theme:'elite',motion:'normal',activeTheme:'elite'};
 let previewing=false;
 const svg=(body,viewBox='0 0 64 64')=>`<svg viewBox="${viewBox}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
 const ART={
  snow:svg('<g stroke="currentColor" fill="none" stroke-width="3.4" stroke-linecap="round"><path d="M32 3v58M3 32h58M11.5 11.5l41 41M52.5 11.5l-41 41"/><path d="m25 10 7 7 7-7M25 54l7-7 7 7M10 25l7 7-7 7M54 25l-7 7 7 7M17 10l0 9-9 0M47 54v-9h9M47 10v9h9M17 54v-9H8"/></g>'),
  bat:svg('<path fill="currentColor" d="M32 24c-4-9-8-8-10-2-8-8-16-9-22-5 3 4 5 7 4 10 5-2 8 0 10 4 2-2 6-1 9 1 0 7 4 14 9 17 5-3 9-10 9-17 3-2 7-3 9-1 2-4 5-6 10-4-1-3 1-6 4-10-6-4-14-3-22 5-2-6-6-7-10 2Z"/><circle cx="28" cy="29" r="1.3" fill="#fba04c"/><circle cx="36" cy="29" r="1.3" fill="#fba04c"/>'),
  ghost:svg('<path fill="currentColor" d="M11 54V26a21 21 0 0 1 42 0v28l-9-6-7 6-7-6-9 6-10-6Z"/><ellipse cx="25" cy="29" rx="3.7" ry="5.1" fill="#483568"/><ellipse cx="40" cy="29" rx="3.7" ry="5.1" fill="#483568"/><ellipse cx="33" cy="41" rx="4" ry="5" fill="#483568"/>'),
  pumpkin:svg('<path fill="#f88932" d="M32 14C13 4 4 17 4 36c0 16 10 23 28 23s28-7 28-23C60 17 51 4 32 14Z"/><path d="M32 14V5m-8 2 8-3 4 9" stroke="#5ba35d" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M20 28 12 36h14Zm24 0-6 8h14ZM20 44q12 17 24 0Z" fill="#3b1a17"/><path d="M27 15c-7 9-8 34-1 41M39 15c7 9 8 34 1 41" fill="none" stroke="#ffb25f" stroke-opacity=".55" stroke-width="2"/>'),
  heart:svg('<path fill="currentColor" d="M32 57 7 32C-7 17 8-5 27 13l5 6 5-6C56-5 71 17 57 32L32 57Z"/>'),
  petal:svg('<path fill="currentColor" d="M32 60C12 47 6 28 20 10 29 0 46 1 53 17 62 40 43 54 32 60Z"/><path fill="none" stroke="#fff9" stroke-width="2" d="M32 56Q31 33 45 16"/>'),
  flower:svg('<g fill="currentColor"><ellipse cx="32" cy="15" rx="9" ry="15"/><ellipse cx="32" cy="49" rx="9" ry="15"/><ellipse cx="15" cy="32" rx="15" ry="9"/><ellipse cx="49" cy="32" rx="15" ry="9"/><ellipse cx="20" cy="20" rx="9" ry="13" transform="rotate(-45 20 20)"/><ellipse cx="44" cy="44" rx="9" ry="13" transform="rotate(-45 44 44)"/><ellipse cx="20" cy="44" rx="9" ry="13" transform="rotate(45 20 44)"/><ellipse cx="44" cy="20" rx="9" ry="13" transform="rotate(45 44 20)"/></g><circle cx="32" cy="32" r="11" fill="#e7b94d"/>'),
  butterfly:svg('<path fill="currentColor" d="M30 29C10-4-6 12 11 34 0 49 18 65 30 38l2-3 2 3C46 65 64 49 53 34 70 12 54-4 34 29Z"/><path d="M32 28v23" stroke="#fffa" stroke-width="3"/><circle cx="20" cy="25" r="4" fill="#fff8"/><circle cx="44" cy="25" r="4" fill="#fff8"/>'),
  star:svg('<path fill="currentColor" d="m32 1 7 23 24 8-24 7-7 24-8-24L1 32l23-8Z"/>'),
  streamer:svg('<path d="M6 47C9-1 55 67 57 13" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>')
 };
 const scene=document.createElement('div');scene.className='fe-seasonal-atmosphere';scene.setAttribute('aria-hidden','true');
 const aurora=document.createElement('div');aurora.className='fe-seasonal-aurora';
 const ornaments=document.createElement('div');ornaments.className='fe-seasonal-ornaments';
 const particles=document.createElement('div');particles.className='fe-seasonal-particles';
 scene.append(aurora,ornaments,particles);
 function attach(){if(!scene.isConnected)document.body?.prepend(scene);}
 function rng(n){const v=Math.sin(n*12.9898+78.233)*43758.5453;return v-Math.floor(v);}
 function item(kind,i,size,extra={}){
  const element=document.createElement('span');element.className=`fe-fx fe-fx-${kind}`;
  element.innerHTML=ART[kind]||ART.star;
  const x=extra.x??(rng(i+14)*100);
  const y=extra.y??(rng(i+503)*100);
  element.style.setProperty('--x',`${x.toFixed(2)}%`);
  element.style.setProperty('--y',`${y.toFixed(2)}%`);
  element.style.setProperty('--s',`${Math.round(size)}px`);
  element.style.setProperty('--delay',`${(-rng(i+85)*22).toFixed(2)}s`);
  element.style.setProperty('--duration',`${(extra.duration??(11+rng(i+91)*11)).toFixed(2)}s`);
  element.style.setProperty('--drift',`${Math.round(-95+rng(i+245)*190)}px`);
  element.style.setProperty('--hue',String(Math.round(rng(i+138)*360)));
  if(extra.color)element.style.color=extra.color;
  particles.append(element);
  return element;
 }
 function fixture(className,inner=''){
  const el=document.createElement('div');el.className=`fe-season-fixture ${className}`;el.innerHTML=inner;ornaments.append(el);return el;
 }
 function render(){
  attach();
  const theme=THEMES.includes(latest.activeTheme)?latest.activeTheme:'elite';
  root.dataset.feTheme=theme;root.dataset.feMotion=latest.motion;
  const isSmall=!!mobile?.matches;
  const multiplier=latest.motion==='intenso'?1.55:latest.motion==='suave'?.75:1;
  const count=amount=>Math.min(66,Math.round(amount*multiplier*(isSmall?.57:1)));
  particles.replaceChildren();ornaments.replaceChildren();
  // Never display free-floating fake "snow" glyphs as plain dots; every item is its own vector.
  if(theme==='navidad'){
   const bulbs=fixture('fe-christmas-lights',Array.from({length:15},()=>'<i></i>').join(''));
   [...bulbs.children].forEach((bulb,i)=>bulb.style.setProperty('--bulb',i));
   fixture('fe-christmas-tree fe-tree-left','<span>🎄</span>');
   fixture('fe-christmas-tree fe-tree-right','<span>🎄</span>');
   for(let i=0;i<count(35);i++)item('snow',i,16+rng(i+4)*24,{duration:9+rng(i+52)*12});
   for(let i=0;i<count(8);i++)item('star',i+80,8+rng(i+40)*12);
  }else if(theme==='halloween'){
   fixture('fe-halloween-moon');
   fixture('fe-pumpkin-left',ART.pumpkin);fixture('fe-pumpkin-right',ART.pumpkin);
   for(let i=0;i<count(12);i++)item('bat',i,33+rng(i+33)*34,{y:4+rng(i+100)*65,duration:7+rng(i+70)*10});
   for(let i=0;i<count(7);i++)item('ghost',i+40,27+rng(i+56)*30,{y:15+rng(i+104)*65,duration:8+rng(i+76)*12});
  }else if(theme==='ano_nuevo'){
   for(let i=0;i<(isSmall?3:5);i++){
    const x=14+rng(i+27)*72,y=10+rng(i+37)*58;
    const b=fixture('fe-firework',Array.from({length:16},()=>'<i></i>').join(''));
    [...b.children].forEach((ray,k)=>{ray.style.setProperty('--angle',`${k*22.5}deg`);ray.style.setProperty('--ray',k);});b.style.setProperty('--x',`${x}%`);b.style.setProperty('--y',`${y}%`);b.style.setProperty('--fw-delay',`${-i*1.15}s`);
   }
   for(let i=0;i<count(27);i++)item('streamer',i,10+rng(i+6)*17,{duration:9+rng(i+85)*8,color:i%2?'#ffd88f':'#ad9df7'});
   for(let i=0;i<count(12);i++)item('star',i+80,9+rng(i+6)*16);
  }else if(theme==='san_valentin'){
   fixture('fe-valentine-halo');
   for(let i=0;i<count(26);i++)item('heart',i,15+rng(i+19)*30,{duration:10+rng(i+81)*11,color:i%3?'#ff9ab5':'#ffe0ed'});
   for(let i=0;i<count(12);i++)item('petal',i+40,13+rng(i+42)*15,{color:'#f2a5c9'});
  }else if(theme==='fiestas_patrias'){
   fixture('fe-patrias-ribbon');
   for(let i=0;i<count(37);i++)item('streamer',i,13+rng(i+17)*17,{duration:8+rng(i+38)*8,color:i%3===0?'#fff6ee':'#f24450'});
   for(let i=0;i<count(9);i++)item('star',i+100,12+rng(i+71)*10,{color:'#ffe6db'});
  }else if(theme==='primavera'){
   fixture('fe-spring-meadow');
   for(let i=0;i<count(25);i++)item('petal',i,13+rng(i+15)*25,{color:i%2?'#ffd0e5':'#fff0b4'});
   for(let i=0;i<count(10);i++)item('flower',i+40,24+rng(i+25)*20,{color:i%2?'#f6a9c9':'#f1eee1'});
   for(let i=0;i<count(6);i++)item('butterfly',i+70,30+rng(i+41)*23,{color:i%2?'#fdaed9':'#c1df7c'});
  }else{
   for(let i=0;i<count(19);i++)item('star',i,7+rng(i+9)*13,{duration:10+rng(i+28)*15,color:'#ebcb8b'});
  }
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=({navidad:'#06241f',halloween:'#190c25',ano_nuevo:'#100d2a',san_valentin:'#271025',fiestas_patrias:'#2b1219',primavera:'#0f241a',elite:'#0a0e12'})[theme];
  document.dispatchEvent(new CustomEvent('fe:theme-changed',{detail:{...latest,activeTheme:theme,count:particles.childElementCount}}));
 }
 function applyTheme(data){
  if(!data||typeof data!=='object')return;
  const theme=THEMES.includes(data.theme)?data.theme:'elite';
  latest={mode:data.mode==='manual'?'manual':'automatico',theme,motion:MOTIONS.includes(data.motion)?data.motion:'normal',activeTheme:THEMES.includes(data.activeTheme)?data.activeTheme:theme};
  previewing=false;render();
 }
 function preview(theme,motion){
  latest.activeTheme=THEMES.includes(theme)?theme:latest.activeTheme;
  if(MOTIONS.includes(motion))latest.motion=motion;
  previewing=true;render();
 }
 async function refresh(){
  if(previewing)return;
  try{
   const response=await fetch('/api/public/site-theme',{cache:'no-store',credentials:'same-origin'});
   if(response.ok){const settings=await response.json();if(!previewing)applyTheme(settings);}else console.warn('FijasTheme: estado',response.status);
  }catch(err){console.warn('FijasTheme: configuración no disponible',err?.message||err);}
 }
 if(document.body)attach();else document.addEventListener('DOMContentLoaded',attach,{once:true});
 window.FijasTheme={refresh,preview,applyTheme,get:()=>({...latest}),getEffects:()=>({theme:root.dataset.feTheme,motion:root.dataset.feMotion,particles:particles.childElementCount})};
 render();refresh();
 mobile?.addEventListener?.('change',render);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
