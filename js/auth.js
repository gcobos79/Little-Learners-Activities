/* Teacher sign-in, set-password (invitation / reset links), first sign-in on a
 * device, and the teacher PIN used on shared classroom tablets. */
window.LL = window.LL || {};
(function () {
  const { el, $, toast, dialog, confirmDialog } = LL.ui;
  const S = LL.store;
  const LOCAL_MODE = 'll-v122-local-mode';

  const localMode = () => { try { return localStorage.getItem(LOCAL_MODE) === '1'; } catch { return false; } };
  const setLocalMode = (on) => { try { if (on) localStorage.setItem(LOCAL_MODE, '1'); else localStorage.removeItem(LOCAL_MODE); } catch { /* ignore */ } };

  /** Should the app ask the teacher to sign in before anything else? */
  function needsLogin() { return LL.cloud.enabled() && !LL.cloud.signedIn() && !localMode() && !S.isGuest(); }

  /* ---------- Guest mode (V127) ----------
   * Anyone can try the activities the teacher marked «Compartir con invitados»: only activities and their
   * folders, no students, no teacher tools, and nothing is saved (not in the database, not here).
   * The guest stays a guest while this tab is open (sessionStorage), also after a reload. */
  const GUEST = 'll-guest';
  const guestFlag = (on) => { try { if (on) sessionStorage.setItem(GUEST, '1'); else sessionStorage.removeItem(GUEST); } catch { /* ignore */ } };
  const guestRemembered = () => { try { return sessionStorage.getItem(GUEST) === '1'; } catch { return false; } };

  /** preview: the teacher's «Ver como invitado» (Ajustes); «Volver al maestro» returns to the teacher area. */
  async function enterGuest(btn, opts = {}) {
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Entrando…'; }
    try {
      const data = await LL.cloud.rpcPublic('guest_catalog');
      const library = ((data && data.quizzes) || []).map((r) => LL.sync._convert.rowToEntry(r));
      const folders = ((data && data.folders) || []).map((f) => ({ id: f.id, name: f.name, parentId: f.parent_id || null, color: f.color }));
      S.setGuest({ library, folders });
      guestFlag(!opts.preview);
      LL.app.enterGuest(!!opts.preview);
      return true;
    } catch (e) {
      guestFlag(false);
      toast('No se pudo entrar como invitado: ' + friendly(e), 'error');
      if (!S.isGuest() && !opts.preview) LL.app.go('login');
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
    }
  }
  /* ---------- Administrator (V127) ----------
   * The database says who is administrator (table ll_admins, function is_ll_admin). Only the
   * administrator can share activities with guests and use the ElevenLabs voice. The answer is kept
   * for this account so the screens don't wait for the internet. */
  const ADMIN = 'll-admin';
  function isAdmin() {
    const me = LL.cloud.user();
    if (!me || !LL.cloud.signedIn()) return false;
    try { const a = JSON.parse(localStorage.getItem(ADMIN) || 'null'); return !!(a && a.uid === me.id && a.admin); } catch { return false; }
  }
  async function refreshAdmin() {
    const me = LL.cloud.user();
    if (!me || !LL.cloud.signedIn()) return false;
    try {
      const admin = (await LL.cloud.rpc('is_ll_admin', {})) === true;
      localStorage.setItem(ADMIN, JSON.stringify({ uid: me.id, admin }));
      return admin;
    } catch { return isAdmin(); }
  }

  function exitGuest() {
    S.setGuest(null);
    guestFlag(false);
  }

  function friendly(e) {
    const m = String(e && e.message || e || '');
    if (e && e.code === 'offline') return 'No hay conexión a internet. Revisa el Wi-Fi e inténtalo de nuevo.';
    if (/invalid login credentials|invalid_grant|invalid_credentials/i.test(m)) return 'El correo o la contraseña no son correctos.';
    if (/email not confirmed/i.test(m)) return 'Primero confirma tu correo con el enlace que te enviamos.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
    if (/should be different/i.test(m)) return 'La nueva contraseña debe ser diferente a la anterior.';
    if (/weak|at least/i.test(m)) return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
    return m || 'Algo salió mal. Inténtalo de nuevo.';
  }

  /* ---------- Sign-in screen ---------- */
  function renderLogin(message) {
    const page = $('#screen-login');
    const email = el('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@escuela.org', required: true, 'aria-label': 'Correo electrónico' });
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', required: true, 'aria-label': 'Contraseña' });
    const err = el('p.problem-box', { hidden: true, role: 'alert' });
    const btn = el('button.btn.primary.big', { type: 'submit' }, 'Entrar');
    const form = el('form.login-form', { novalidate: true },
      el('label.field', 'Correo electrónico', email),
      el('label.field', 'Contraseña', pass),
      err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (!email.value.trim() || !pass.value) { err.textContent = 'Escribe tu correo y tu contraseña.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        await LL.cloud.signIn(email.value.trim(), pass.value);
        await afterSignIn();
      } catch (ex) {
        err.textContent = friendly(ex); err.hidden = false;
      } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
    });
    page.replaceChildren(el('div.login-wrap',
      el('div.login-row',
      el('div.login-card.panel',
        el('div.login-logo', { 'aria-hidden': 'true' }, '✨'),
        el('h1', 'Little Learners'),
        el('p.lead', 'Entra con tu cuenta de maestro.'),
        message ? el('p.ok-box', message) : null,
        form,
        el('button.link-btn', { type: 'button', onclick: () => resetDialog(email.value) }, '¿Olvidaste tu contraseña?'),
        el('p.small.muted', 'Las cuentas son por invitación. Si necesitas una, pídela a quien administra esta página.')),
      el('div.login-guest.panel',
        el('div.login-guest-icon', { 'aria-hidden': 'true' }, '👋'),
        el('div',
          el('h2', 'Guest / Invitado'),
          el('p.small.muted', '¿No tienes cuenta? Prueba las actividades compartidas. No se guarda nada.'),
          el('p.small.muted', { lang: 'en' }, 'No account? Try the shared activities. Nothing is saved.')),
        el('div.guest-btns',
          el('button.btn.primary.big.guest-btn', { type: 'button', onclick: (e) => { LL.ui.setGuestLang('es'); enterGuest(e.currentTarget); } }, 'Entrar como invitado'),
          el('button.btn.soft.big.guest-btn-en', { type: 'button', lang: 'en', onclick: (e) => { LL.ui.setGuestLang('en'); enterGuest(e.currentTarget); } }, 'Enter as guest (English)')))),
      el('div.login-alt',
        el('button.btn.ghost', { type: 'button', onclick: () => { setLocalMode(true); LL.app.go('students'); } }, 'Usar sin cuenta, solo en este dispositivo'),
        el('p.small.muted', 'Sin cuenta, las actividades se guardan solo en este navegador.')),
      el('footer.site-footer',
        el('button', { type: 'button', onclick: () => LL.app.openInfo('privacidad') }, 'Privacidad'), el('span', { 'aria-hidden': 'true' }, '·'),
        el('button', { type: 'button', onclick: () => LL.app.openInfo('terminos') }, 'Términos'))));
    setTimeout(() => email.focus(), 50);
  }

  async function resetDialog(prefill) {
    const email = el('input', { type: 'email', autocomplete: 'username', value: prefill || '', placeholder: 'tu@escuela.org' });
    const ok = await dialog({
      title: 'Cambiar contraseña',
      body: el('div', { style: { display: 'grid', gap: '10px' } }, el('p', 'Te enviaremos un correo con un enlace para crear una contraseña nueva.'), el('label.field', 'Correo electrónico', email)),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: 'Enviar enlace', kind: 'primary', value: () => (email.value.trim() ? true : (email.focus(), undefined)) }],
    });
    if (!ok) return;
    try { await LL.cloud.sendPasswordReset(email.value.trim()); toast('Listo. Revisa tu correo (y la carpeta de spam).', 'success'); }
    catch (e) { toast(friendly(e), 'error'); }
  }

  /* ---------- New password (from invitation or reset email) ---------- */
  function renderSetPassword(kind) {
    const page = $('#screen-set-password');
    const p1 = el('input', { type: 'password', autocomplete: 'new-password', minlength: '8', placeholder: 'Mínimo 8 caracteres' });
    const p2 = el('input', { type: 'password', autocomplete: 'new-password', minlength: '8', placeholder: 'Repite la contraseña' });
    const err = el('p.problem-box', { hidden: true, role: 'alert' });
    const btn = el('button.btn.primary.big', { type: 'submit' }, 'Guardar contraseña');
    const form = el('form.login-form', { novalidate: true }, el('label.field', 'Contraseña nueva', p1), el('label.field', 'Repite la contraseña', p2), err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (p1.value.length < 8) { err.textContent = 'Usa al menos 8 caracteres.'; err.hidden = false; return; }
      if (p1.value !== p2.value) { err.textContent = 'Las contraseñas no coinciden.'; err.hidden = false; return; }
      btn.disabled = true;
      try {
        await LL.cloud.setPassword(p1.value);
        toast('Contraseña guardada.', 'success');
        await afterSignIn();
      } catch (ex) { err.textContent = friendly(ex); err.hidden = false; }
      finally { btn.disabled = false; }
    });
    const u = LL.cloud.user();
    page.replaceChildren(el('div.login-wrap', el('div.login-card.panel',
      el('div.login-logo', { 'aria-hidden': 'true' }, '🔑'),
      el('h1', kind === 'invite' ? '¡Bienvenido!' : 'Contraseña nueva'),
      el('p.lead', kind === 'invite' ? 'Crea una contraseña para tu cuenta de maestro.' : 'Escribe tu contraseña nueva.'),
      u && u.email ? el('p.muted', u.email) : null,
      form)));
    setTimeout(() => p1.focus(), 50);
  }

  /* ---------- First sign-in on this device ---------- */
  async function afterSignIn() {
    setLocalMode(false);
    const me = LL.cloud.user();
    const prev = LL.sync.owner();
    if (me && prev && prev !== me.id) {
      // Another teacher's activities are on this device: remove them before syncing.
      const ok = await confirmDialog('Este dispositivo tiene actividades de otra cuenta',
        'Para proteger su privacidad, se quitarán de este dispositivo (esa cuenta las conserva en la nube). Después se descargarán las tuyas.', 'Continuar');
      if (!ok) { await LL.cloud.signOut(); renderLogin(); LL.app.go('login'); return; }
      LL.sync.clearLocalLibrary();
      S.quietly(() => { S.saveRoster([]); S.savePinHash(null); });
      try { localStorage.removeItem(S.KEYS.settingsAt); } catch { /* ignore */ }
      LL.sync.reset(me.id);
    } else if (me && !prev) {
      if (LL.sync.localHasData()) {
        const nQ = S.quizzes().length, nF = S.folders().length;
        const ok = await dialog({
          title: '¿Subir tus actividades a tu cuenta?',
          body: 'En este dispositivo hay ' + nQ + ' quiz(zes) y ' + nF + ' carpeta(s). Se guardarán en tu cuenta para que aparezcan en tus otros dispositivos y tabletas.',
          actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: 'Subir a mi cuenta', kind: 'primary', value: true }],
        });
        if (!ok) { await LL.cloud.signOut(); renderLogin(); LL.app.go('login'); return; }
      }
      LL.sync.reset(me.id);
    }
    refreshAdmin();
    LL.app.go('students');
    toast('Sesión iniciada' + (me && me.email ? ': ' + me.email : '') + '. Sincronizando…');
    LL.sync.run().then((ok) => { if (ok) toast('✓ Actividades sincronizadas.', 'success'); });
  }

  async function signOut() {
    if (!(await confirmDialog('¿Cerrar sesión en este dispositivo?', 'Las actividades se quedan en este dispositivo, pero ya no se actualizarán hasta que vuelvas a entrar.', 'Cerrar sesión'))) return;
    await LL.sync.run().catch(() => {});
    await LL.cloud.signOut();
    toast('Sesión cerrada.');
    LL.app.goHome();
  }

  /* ---------- Teacher PIN ---------- */
  async function hashPin(pin) {
    const text = 'little-learners-pin|' + pin;
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return 'sha256:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch { /* fall through */ }
    let h = 0x811c9dc5; // FNV-1a fallback for browsers without Web Crypto
    for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'fnv:' + h.toString(16);
  }

  function pinPad(title, subtitle, extraActions = []) {
    return new Promise((resolve) => {
      let value = '';
      const dots = el('div.pin-dots', { 'aria-live': 'polite' });
      const draw = () => { dots.replaceChildren(...Array.from({ length: Math.max(4, value.length) }, (_, i) => el('span' + (i < value.length ? '.on' : '')))); dots.setAttribute('aria-label', value.length + ' dígitos'); };
      draw();
      const pad = el('div.pin-pad');
      const add = (d) => { if (value.length < 8) { value += d; draw(); } };
      for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) pad.append(el('button', { type: 'button', onclick: () => add(d) }, d));
      pad.append(el('button', { type: 'button', 'aria-label': 'Borrar', onclick: () => { value = value.slice(0, -1); draw(); } }, '⌫'));
      pad.append(el('button', { type: 'button', onclick: () => add('0') }, '0'));
      pad.append(el('button.ok', { type: 'button', 'aria-label': 'Aceptar', onclick: () => finish() }, '✓'));
      const onKey = (e) => {
        if (/^[0-9]$/.test(e.key)) { add(e.key); e.preventDefault(); }
        else if (e.key === 'Backspace') { value = value.slice(0, -1); draw(); e.preventDefault(); }
        else if (e.key === 'Enter') { finish(); e.preventDefault(); }
      };
      document.addEventListener('keydown', onKey, true);
      let done;
      const p = dialog({ title, body: el('div.pin-box', subtitle ? el('p.muted', subtitle) : null, dots, pad), actions: [...extraActions, { label: 'Cancelar', kind: 'ghost', value: false }] });
      function finish() { done = value; document.querySelector('.modal-back')?.click(); }
      p.then((v) => { document.removeEventListener('keydown', onKey, true); resolve(v === 'forgot' ? 'forgot' : (done || null)); });
    });
  }

  let fails = 0, lockedUntil = 0;
  /** Ask for the PIN (if one is set). Resolves true when the teacher may enter.
   *  opts.title: heading of the PIN pad. opts.notice: show a wrong PIN in a box with «Aceptar». */
  async function checkPin(opts = {}) {
    const saved = S.pinHash();
    if (!saved) return true;
    const tell = async (title, text) => {
      if (opts.notice) await dialog({ title, body: el('p', text), actions: [{ label: 'Aceptar', kind: 'primary', value: true }] });
      else toast(text, 'error');
    };
    if (Date.now() < lockedUntil) { await tell('⏳ Espera un momento', 'Demasiados intentos. Espera ' + Math.ceil((lockedUntil - Date.now()) / 1000) + ' segundos.'); return false; }
    const me = LL.cloud.user();
    const pin = await pinPad(opts.title || '🔒 PIN del maestro', opts.hint || null, me ? [{ label: '¿Olvidaste el PIN?', kind: 'ghost', value: 'forgot' }] : []);
    if (pin == null) return false;
    if (pin === 'forgot') return forgotPin(me);
    if ((await hashPin(pin)) === saved) { fails = 0; return true; }
    fails++;
    if (fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; }
    await tell('❌ PIN incorrecto', 'El PIN no es correcto.');
    return false;
  }

  /** Entering the account password also opens the teacher area (and lets you change the PIN there). */
  async function forgotPin(me) {
    const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
    const ok = await dialog({
      title: 'Entrar con tu contraseña',
      body: el('div', { style: { display: 'grid', gap: '10px' } }, el('p', 'Escribe la contraseña de ' + me.email + '. Luego puedes cambiar el PIN en «Ajustes».'), el('label.field', 'Contraseña', pass)),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: 'Entrar', kind: 'primary', value: () => (pass.value ? true : (pass.focus(), undefined)) }],
    });
    if (!ok) return false;
    try { await LL.cloud.signIn(me.email, pass.value); return true; }
    catch (e) { toast(friendly(e), 'error'); return false; }
  }

  async function setPinFlow() {
    const a = await pinPad('Nuevo PIN', 'Elige de 4 a 8 números.');
    if (a == null) return;
    if (a.length < 4) { toast('El PIN debe tener al menos 4 números.', 'error'); return; }
    const b = await pinPad('Repite el PIN', null);
    if (b == null) return;
    if (a !== b) { toast('Los PIN no coinciden.', 'error'); return; }
    S.savePinHash(await hashPin(a));
    toast('PIN guardado' + (LL.cloud.signedIn() ? '. Se usará en todos tus dispositivos.' : '.'), 'success');
  }

  LL.auth = { needsLogin, localMode, setLocalMode, enterGuest, exitGuest, guestRemembered, isAdmin, refreshAdmin, renderLogin, renderSetPassword, afterSignIn, signOut, checkPin, setPinFlow, friendly };
})();
