'use strict';
/** Landing authentication: the first interaction stays on /, with existing server-side sessions. */
(() => {
 const overlay = document.getElementById('landingAuth');
 if (!overlay) return;
 const dialog = overlay.querySelector('.fe-auth-dialog');
 const context = document.getElementById('landingAuthContext');
 let lastFocus = null;
 let selectedPlan = null;
 let session = { authenticated: false, accountType: null };
 const allowedViews = new Set(['login', 'register', 'forgot']);
 const sections = [...overlay.querySelectorAll('[data-landing-panel]')];
 const forms = { login: document.getElementById('landingSignin'), register: document.getElementById('landingRegister'), forgot: document.getElementById('landingForgot') };
 const statuses = {login: document.getElementById('landingLoginMsg'), register: document.getElementById('landingRegisterMsg'), forgot: document.getElementById('landingForgotMsg')};
 const safePlanId = value => /^\d{1,12}$/.test(String(value ?? '')) ? String(value) : null;
 const destination = plan => '/clientes.html' + (safePlanId(plan) ? '?plan=' + encodeURIComponent(plan) : '');
 const showMessage = (name, message, success = false) => {
  const el = statuses[name]; if (!el) return;
  el.textContent = String(message || '');
  if (success) el.dataset.state = 'success'; else delete el.dataset.state;
 };
 function setView(name) {
  if (!allowedViews.has(name)) return;
  sections.forEach(section => { section.hidden = section.dataset.landingPanel !== name; });
  overlay.querySelectorAll('.fe-auth-tabs [data-landing-view]').forEach(tab => {
   const on = tab.dataset.landingView === name;
   tab.setAttribute('aria-selected', String(on));
   tab.tabIndex = on ? 0 : -1;
  });
  if (!overlay.hidden) {
   const active = overlay.querySelector(`[data-landing-panel="${name}"] input`);
   active?.focus({preventScroll:true});
  }
 }
 function openAuth(view = 'login', plan = null, planName = '') {
  selectedPlan = safePlanId(plan);
  context.hidden = !selectedPlan;
  context.textContent = selectedPlan ? `✦ Plan seleccionado: ${String(planName || 'VIP')}. Continúa con tu cuenta para completar tu solicitud.` : '';
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add('fe-auth-open');
  setView(view);
 }
 function closeAuth() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('fe-auth-open');
  selectedPlan = null;
  lastFocus?.focus?.({preventScroll:true});
 }
 async function api(path, data) {
  const res = await window.FijasSecurity.apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(typeof body.error === 'string' ? body.error : (res.status === 429 ? 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' : 'No se pudo completar la solicitud.'));
  return body;
 }
 async function refreshSession() {
  try {
   const result = await fetch('/api/session', {credentials: 'same-origin'});
   const data = result.ok ? await result.json() : null;
   session = { authenticated: Boolean(data?.authenticated), accountType: data?.accountType || null };
   if (session.authenticated) {
    const topLink = document.querySelector('.topbar [data-auth-open="login"]');
    if (topLink) { topLink.textContent = 'Mi panel ↗'; topLink.href = session.accountType === 'admin' ? '/panel' : '/clientes.html'; }
    document.querySelectorAll('[data-auth-open="register"]').forEach(link => { link.textContent = 'Ir a mi panel ↗'; });
   }
  } catch { /* Offline or unavailable session: preserve sign-in path. */ }
 }
 document.addEventListener('click', event => {
  const opener = event.target.closest('[data-auth-open], [data-plan-auth]');
  if (opener) {
   // Keep external or modified browser gestures native, including keyboard opens.
   if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
   event.preventDefault();
   const plan = opener.hasAttribute('data-plan-auth') ? opener.dataset.planAuth : null;
   if (session.authenticated) {
    location.assign(session.accountType === 'admin' ? '/panel' : destination(plan));
    return;
   }
   openAuth(plan ? 'register' : (opener.dataset.authOpen || 'login'), plan, opener.dataset.planName);
   return;
  }
  const view = event.target.closest('#landingAuth [data-landing-view]');
  if (view) { setView(view.dataset.landingView); return; }
  if (event.target.closest('#landingAuth [data-auth-close]')) closeAuth();
 });
 overlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeAuth(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),a[href]')].filter(el => el.getClientRects().length > 0 && el.closest('[hidden]') === null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length-1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
 });
 for (const name of ['login', 'register', 'forgot']) {
  forms[name].addEventListener('submit', async e => {
   e.preventDefault();
   const form = forms[name];
   if (!form.reportValidity()) return;
   const submit = form.querySelector('button[type="submit"]');
   submit.disabled = true;
   showMessage(name, 'Procesando de forma segura…');
   try {
    const values = Object.fromEntries(new FormData(form));
    if (name === 'login') {
     const result = await api('/api/login', values);
     showMessage(name, 'Sesión iniciada. Abriendo tu panel…', true);
     location.assign(result.accountType === 'admin' ? '/panel' : destination(selectedPlan));
    } else if (name === 'register') {
     await api('/api/customers/register', values);
     forms.login.elements.email.value = values.email;
     forms.login.elements.password.value = '';
     form.elements.password.value = '';
     setView('login');
     showMessage('login', 'Cuenta creada. Inicia sesión para entrar a tu espacio.', true);
     showMessage(name, '');
    } else {
     const result = await api('/api/customers/forgot-password', values);
     showMessage(name, result.message || 'Si el correo está registrado, recibirás las instrucciones.', true);
    }
   } catch (err) { showMessage(name, err.message || 'Ha ocurrido un error.'); }
   finally {submit.disabled = false;}
  });
 }
 refreshSession();
})();
