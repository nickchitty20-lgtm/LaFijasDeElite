"use strict";
/* Non-invasive animation layer: no API changes and no form submissions intercepted. */
(()=>{
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduce)return;
 const animate=(node,klass='ui-appear')=>{if(!node||node.hidden)return;node.classList.remove(klass);void node.offsetWidth;node.classList.add(klass);node.addEventListener('animationend',()=>node.classList.remove(klass),{once:true});};
 const roots=document.querySelectorAll('main > section, main > .card, #dashboard .card, .stats article');
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){animate(e.target,'ui-enter');observer.unobserve(e.target);}}},{threshold:.06});roots.forEach(el=>{if(!el.hidden&&el.getClientRects().length)observer.observe(el);});}
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled){b.classList.remove('ui-press');void b.offsetWidth;b.classList.add('ui-press');b.addEventListener('animationend',()=>b.classList.remove('ui-press'),{once:true});}}, {passive:true});
 const observer=new MutationObserver(mutations=>{for(const m of mutations){if(m.type==='attributes'&&m.attributeName==='hidden'&&!m.target.hidden)animate(m.target,'ui-enter');if(m.type==='childList')for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.matches('.prediction-item,.stats article,.card'))animate(n);n.querySelectorAll?.('.prediction-item').forEach(x=>animate(x));}}});
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
 document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',()=>{const b=form.querySelector('button[type=submit],button:not([type])');if(b)animate(b,'ui-success');}));
})();
