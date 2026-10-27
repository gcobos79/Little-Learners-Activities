/* App shell: screens, top bar, student picker, teacher entry. */
window.LL = window.LL || {};
(function () {
  const { el, $, $$, toast } = LL.ui;
  const S = LL.store;

  const state = { screen: 'students', mode: null, student: null, teacherUnlocked: false };
  const SCREENS = ['login', 'set-password', 'students', 'library', 'editor', 'students-admin', 'backup', 'info', 'results'];
  let infoReturn = 'students';
  const TEACHER_TABS = [
    { id: 'library', icon: '📚', label: 'Actividades' },
    { id: 'students-admin', icon: '👧', label: 'Estudiantes' },
    { id: 'backup', icon: '⚙️', label: 'Ajustes' },
  ];

  async function go(screen) {
    if (state.screen === 'editor' && screen !== 'editor' && LL.editor && !(await LL.editor.canLeave())) return false;
    // Ajustes asks for the PIN again every time (coming back from «Información» opened there doesn't).
    if (screen === 'backup' && state.screen !== 'backup' && !(state.screen === 'info' && infoReturn === 'backup')) {
      if (!(await LL.auth.checkPin({ title: '🔒 PIN para entrar a Ajustes', notice: true }))) return false;
    }
    state.screen = screen;
    for (const s of SCREENS) $('#screen-' + s).hidden = s !== screen;
    document.body.classList.toggle('mode-student', state.mode === 'student');
    document.body.classList.toggle('mode-teacher', state.mode === 'teacher');
    document.body.classList.toggle('mode-home', !state.mode);
    document.body.classList.toggle('mode-login', screen === 'login' || screen === 'set-password');
    if (screen === 'login') LL.auth.renderLogin(state.loginMessage);
    if (screen === 'set-password') LL.auth.renderSetPassword(state.passwordKind);
    if (screen === 'students') renderStudents();
    if (screen === 'library') LL.library.render();
    if (screen === 'students-admin') LL.teacher.renderRoster();
    if (screen === 'backup') LL.teacher.renderBackup();
    if (screen === 'info') LL.info.render(state.infoSection);
    if (screen === 'results') LL.results.render();
    renderAppbar();
    pushRoute();
    window.scrollTo(0, 0);
    const h = $('#screen-' + screen + ' h1');
    if (h && document.activeElement && document.activeElement !== document.body && !$('#screen-' + screen).contains(document.activeElement)) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  function renderAppbar() {
    const center = $('#appbarCenter'), right = $('#appbarRight');
    center.replaceChildren(); right.replaceChildren();
    if (state.mode === 'student' && state.student) {
      center.append(el('div.student-chip', LL.teacher.avatar(state.student), el('span', state.student.name)));
      right.append(el('button.icon-btn.big', { type: 'button', 'aria-label': 'Volver a ¿Quién eres?', title: 'Volver a ¿Quién eres?', onclick: goHome }, '🏠'));
    } else if (state.mode === 'teacher') {
      const tabs = el('div.tabs', { role: 'tablist' });
      for (const t of TEACHER_TABS) {
        const active = state.screen === t.id || (t.id === 'library' && (state.screen === 'editor' || state.screen === 'results'));
        tabs.append(el('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(active), onclick: () => go(t.id) }, t.icon + ' ', el('span.tab-label', t.label)));
      }
      center.append(tabs);
      if (LL.cloud.signedIn()) right.append(syncBadge());
      right.append(el('button.icon-btn', { type: 'button', 'aria-label': 'Información, privacidad y términos', title: 'Información', onclick: () => openInfo('acerca') }, 'ℹ️'));
      right.append(el('button.btn.ghost', { type: 'button', onclick: goHome }, 'Salir ↩'));
    } else if (state.screen === 'login' || state.screen === 'set-password') {
      // nothing in the bar while signing in
    } else if (state.screen === 'info') {
      right.append(el('button.btn.ghost', { type: 'button', onclick: () => go(infoReturn) }, '⬅️ Volver'));
    } else {
      right.append(teacherGate());
    }
  }

  /** Small cloud icon showing whether the teacher's changes are saved online. */
  function syncBadge() {
    const b = el('button.icon-btn.sync-badge', { type: 'button', onclick: () => { LL.sync.run(); } });
    const draw = (st) => {
      const icon = st.busy || st.pending ? '🔄' : st.error === 'offline' ? '📴' : st.error ? '⚠️' : '☁️';
      const label = st.busy || st.pending ? 'Guardando en la nube…' : st.error === 'offline' ? 'Sin internet: los cambios se subirán al volver la conexión' : st.error ? 'No se pudo sincronizar: ' + st.error : 'Todo guardado en la nube' + (st.lastOk ? ' (' + new Date(st.lastOk).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit' }) + ')' : '');
      b.textContent = icon; b.title = label; b.setAttribute('aria-label', label);
      b.classList.toggle('spin', !!(st.busy || st.pending));
    };
    draw(LL.sync.status());
    const off = LL.sync.onChange((st) => { if (!b.isConnected) { off(); return; } draw(st); });
    return b;
  }

  /** "Maestro" button that has to be held for one second, so children don't open it by accident. */
  function teacherGate() {
    const b = el('button.btn.ghost.teacher-gate', { type: 'button', title: 'Mantén presionado para entrar', 'aria-label': 'Maestro: mantén presionado para entrar' }, el('div.fill'), el('span', '🔒 Maestro'));
    let t = null;
    const start = (e) => { e.preventDefault(); b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); enterTeacher(); }, 1000); };
    const cancel = () => { if (t) { clearTimeout(t); t = null; } if (b.classList.contains('holding')) { b.classList.remove('holding'); toast('Para entrar, mantén presionado el botón «Maestro».'); } };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterTeacher(); } });
    return b;
  }

  async function enterTeacher() {
    if (!(await LL.auth.checkPin())) return;
    state.mode = 'teacher'; state.student = null; state.teacherUnlocked = true;
    LL.sync.run();
    LL.library.resetToRoot();
    go('library');
  }

  async function goHome() {
    if (state.screen === 'editor' && !(await LL.editor.canLeave())) return;
    if (LL.player.isOpen()) LL.player.close();
    state.mode = null; state.student = null; state.teacherUnlocked = false; state.screen = 'editor-left';
    if (LL.auth.needsLogin()) { go('login'); return; }
    go('students');
    if (applyUpdate()) return;
    LL.sync.run();
  }

  function openInfo(section) {
    if (state.screen !== 'info') infoReturn = state.screen === 'editor' ? 'library' : state.screen;
    state.infoSection = section;
    go('info');
  }

  function renderStudents() {
    const grid = $('#studentGrid');
    grid.replaceChildren();
    const r = S.roster();
    if (!r.length) {
      grid.append(el('p.lead', { style: { gridColumn: '1 / -1', textAlign: 'center' } }, 'Todavía no hay estudiantes. El maestro puede agregarlos en «Estudiantes».'));
      return;
    }
    for (const s of r) {
      const card = el('button.student-card', { type: 'button' }, LL.teacher.avatar(s), el('span', s.name));
      // Little wiggle, then go: the child sees their animal react to the tap.
      card.addEventListener('click', () => { card.classList.add('tapped'); setTimeout(() => selectStudent(s), 280); });
      grid.append(card);
    }
    LL.ui.stagger(grid);
    const credit = $('#voiceCredit');
    if (credit) credit.hidden = !LL.tts.active();
  }

  /** A student always starts at the top of the library. */
  function selectStudent(s) {
    state.mode = 'student'; state.student = s;
    LL.library.resetToRoot();
    go('library');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-info]').forEach((b) => b.addEventListener('click', () => openInfo(b.dataset.info)));
    start();
  });

  /* ---------- Browser Back / Forward ----------
   * Every screen, folder, quiz being edited and open player gets its own entry
   * in the browser history, so Chrome's ← and → move inside the site instead of
   * leaving it. For safety, Back never re-opens the teacher area after "Salir"
   * (no PIN skipping) and never switches to another child after 🏠. */
  let restoring = false, firstRoute = true, skipNextPop = false;
  const studentKey = (s) => (s ? (s.id != null ? 'id:' + s.id : 'n:' + s.name) : null);

  function routeState() {
    const r = { screen: state.screen, mode: state.mode || null, student: studentKey(state.student) };
    if (state.screen === 'library') r.folder = LL.library.current() || null;
    if (state.screen === 'editor') r.quiz = LL.editor.currentId();
    if (state.screen === 'results') { const c = LL.results.current(); r.quiz = c.quiz && c.quiz.id; r.month = c.month; r.view = c.view; r.day = c.day; }
    if (state.screen === 'info') r.info = state.infoSection || 'acerca';
    if (LL.player.isOpen() && LL.player.quizId()) r.player = LL.player.quizId();
    return r;
  }
  function hashFor(r) {
    const base = r.mode === 'teacher' ? '#/maestro' : r.mode === 'student' ? '#/estudiante' : '#';
    const tail = {
      login: '/entrar', students: '/', library: r.folder ? '/carpeta/' + r.folder : '/actividades', editor: '/editar/' + (r.quiz || 'nuevo'),
      results: '/resultados/' + (r.quiz || '') + '/' + (r.month || ''), 'students-admin': '/estudiantes', backup: '/ajustes',
      info: '/info/' + (r.info || ''),
    }[r.screen] || '/';
    return base + tail + (r.player ? '/quiz/' + r.player : '');
  }
  function sameRoute(a, b) { return !!a && !!b && JSON.stringify(a) === JSON.stringify(b); }

  /** Add a history entry for what is on screen now (unless it's the same as the current one). */
  function pushRoute() {
    if (restoring || ['set-password', 'editor-left'].includes(state.screen)) return;
    const r = routeState();
    if (sameRoute(history.state, r)) return;
    try {
      if (firstRoute || state.screen === 'result') history.replaceState(r, '', hashFor(r));
      else history.pushState(r, '', hashFor(r));
    } catch { /* some file:// setups refuse history changes; the app still works */ }
    firstRoute = false;
  }
  function replaceRoute() {
    if (restoring) return;
    const r = routeState();
    try { history.replaceState(r, '', hashFor(r)); } catch { /* ignore */ }
  }

  document.addEventListener('ll-player-open', () => pushRoute());
  document.addEventListener('ll-player-close', (e) => {
    // Closed with the ↩️ button: also remove its history entry, so Back doesn't reopen it.
    if (!e.detail.fromHistory && !restoring && history.state && history.state.player) { skipNextPop = true; history.back(); }
  });

  window.addEventListener('popstate', async (e) => {
    if (skipNextPop) { skipNextPop = false; return; }
    const target = e.state || { screen: LL.auth.needsLogin() ? 'login' : 'students', mode: null };
    const before = routeState();
    restoring = true;
    try {
      // Unsaved quiz? Ask first; staying puts the history back where it was.
      if (state.screen === 'editor' && target.screen !== 'editor') {
        if (LL.player.isOpen()) LL.player.close({ fromHistory: true });
        if (!(await LL.editor.canLeave())) { history.pushState(before, '', hashFor(before)); return; }
        state.screen = 'editor-left';
      }
      if (LL.player.isOpen() && !target.player) LL.player.close({ fromHistory: true });

      // Safety rules for shared tablets.
      const toHome = () => { state.mode = null; state.student = null; state.teacherUnlocked = false; LL.library.resetToRoot(); return go(LL.auth.needsLogin() ? 'login' : 'students'); };
      if (target.mode === 'teacher' && !state.teacherUnlocked) { await toHome(); restoring = false; replaceRoute(); return; }
      if (target.mode === 'student' && (!state.student || studentKey(state.student) !== target.student)) { await toHome(); restoring = false; replaceRoute(); return; }
      if (!target.mode && state.mode) { state.mode = null; state.student = null; state.teacherUnlocked = false; LL.library.resetToRoot(); }
      state.mode = target.mode || null;

      if (target.screen === 'library') LL.library.setFolderQuiet(target.folder || null);
      if (target.screen === 'editor') {
        await LL.editor.open(target.quiz && target.quiz !== 'nuevo' ? target.quiz : null, LL.library.current());
      } else if (target.screen === 'results') {
        const q = S.getQuiz(target.quiz);
        if (q) LL.results.open(q, target.month, target.view, target.day); else await go('library');
      } else if (target.screen === 'info') {
        state.infoSection = target.info; await go('info');
      } else if (['sonidos', 'sonidos-admin', 'result'].includes(target.screen)) {
        await go(state.mode ? 'library' : 'students'); // old links to the removed Sonidos iniciales prototype
      } else if ((await go(target.screen || 'students')) === false) {
        history.pushState(before, '', hashFor(before)); // stayed where we were (e.g. wrong PIN for Ajustes)
        return;
      }
      if (target.player) {
        const q = S.getQuiz(target.player);
        if (q && (state.mode === 'teacher' || S.isReady(q))) LL.library.play(q);
      }
    } finally {
      restoring = false;
    }
  });

  /** The logo: teachers go to the top of "Mis actividades"; everyone else to "¿Quién eres?". */
  function logoHome() {
    if (state.screen === 'login' || state.screen === 'set-password') return;
    if (LL.player.isOpen()) LL.player.close();
    if (state.mode === 'teacher') { LL.library.setFolderQuiet(null); go('library'); return; }
    goHome();
  }

  async function start() {
    $('#brandHome').addEventListener('click', logoHome);
    S.mergeDuplicateFolders();
    // Links from invitation / password-reset emails arrive with a token in the address.
    const r = LL.cloud.enabled() ? await LL.cloud.handleRedirect() : null;
    if (r && r.error) { state.loginMessage = null; go('login'); toast('El enlace no es válido o ya caducó. Pide uno nuevo.', 'error'); return; }
    if (r && (r.type === 'invite' || r.type === 'recovery')) { state.passwordKind = r.type; go('set-password'); return; }
    if (r) { LL.auth.afterSignIn(); return; }
    if (LL.auth.needsLogin()) { go('login'); return; }
    go('students');
    if (LL.cloud.signedIn()) LL.sync.run();
    checkUpdate();
  }

  /* ---------- Stay up to date ----------
   * Browsers keep a copy of the site for a while. The server has version.json with the newest
   * build number; when it differs from the one running, the page reloads itself — but only at a
   * safe moment (no activity open, not editing), never in the middle of a child's quiz. */
  let updateReady = false;
  const safeToReload = () => !LL.player.isOpen() && !document.querySelector('.modal')
    && ['students', 'login', 'library', 'results', 'info'].includes(state.screen);
  function applyUpdate() {
    if (!updateReady || !safeToReload()) return false;
    const b = updateReady;
    try { if (sessionStorage.getItem('ll-reloaded-for') === b) return false; sessionStorage.setItem('ll-reloaded-for', b); } catch { /* ignore */ }
    location.reload();
    return true;
  }
  async function checkUpdate() {
    if (location.protocol === 'file:' || !LL.config.build || !navigator.onLine) return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { build } = await r.json();
      if (build && build !== LL.config.build && build > LL.config.build) { updateReady = build; applyUpdate(); }
    } catch { /* offline: try later */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
  setInterval(checkUpdate, 5 * 60 * 1000);

  // Refresh what's on screen when new activities arrive from the cloud.
  document.addEventListener('ll-synced', () => {
    if (LL.player.isOpen()) return;
    if (state.screen === 'students') renderStudents();
    else if (state.screen === 'library') LL.library.render();
    else if (state.screen === 'students-admin') LL.teacher.renderRoster();
  });
  document.addEventListener('ll-signed-out', () => {
    if (LL.cloud.signedIn()) return;
    toast('Tu sesión terminó. Vuelve a entrar para seguir sincronizando.', 'error');
    if (!LL.player.isOpen() && state.screen !== 'editor' && !state.mode) go('login');
  });

  LL.app = { state, go, goHome, openInfo, pushRoute, replaceRoute, checkUpdate };
})();
