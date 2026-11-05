"use strict";
// Progressive enhancement: site remains fully usable if animations are unavailable.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const progress = document.querySelector('.scroll-progress');
  let ticking = false;
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0})`;
    ticking = false;
  }
  addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateProgress); ticking = true; }
  }, { passive: true });
  addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.09, rootMargin: '0px 0px -25px 0px' });
  const mark = root => {
    root.querySelectorAll('.section-heading, .benefit, .plan, .pick, .metrics > div, .cta').forEach(node => {
      if (node.classList.contains('reveal-ready')) return;
      node.classList.add('reveal-ready');
      observer.observe(node);
    });
  };
  mark(document);
  // Plans and predictions arrive asynchronously from the existing API.
  for (const id of ['planGrid', 'picks']) {
    const target = document.getElementById(id);
    if (target) new MutationObserver(() => mark(target)).observe(target, { childList: true });
  }
})();
