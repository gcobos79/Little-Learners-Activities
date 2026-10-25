/* App shell: screens, top bar, student picker, teacher entry, Sonidos iniciales. */
window.LL = window.LL || {};
(function () {
  const { el, $, $$, toast } = LL.ui;
  const S = LL.store;

  const state = { screen: 'students', mode: null, student: null };
  const SCREENS = ['login', 'set-password', 'students', 'library', 'editor', 'students-admin', 'backup', 'sonidos-admin', 'sonidos', 'result', 'info'];
  let infoReturn = 'students';
  const TEACHER_TABS = [
    { id: 'library', icon: '📚', label: 'Actividades' },
    { id: 'students-admin', icon: '👧', label: 'Estudiantes' },
    { id: 'sonidos-admin', icon: '🔤', label: 'Sonidos iniciales' },
    { id: 'backup', icon: '⚙️', label: 'Ajustes' },
  ];

  async function go(screen) {
    if (state.screen === 'editor' && screen !== 'editor' && LL.editor && !(await LL.editor.canLeave())) return;
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
    if (screen === 'sonidos-admin') LL.teacher.renderSonidos();
    if (screen === 'info') LL.info.render(state.infoSection);
    renderAppbar();
    window.scrollTo(0, 0);
    const h = $('#screen-' + screen + ' h1');
    if (h && document.activeElement && document.activeElement !== document.body && !$('#screen-' + screen).contains(document.activeElement)) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  function renderAppbar() {
    const center = $('#appbarCenter'), right = $('#appbarRight');
    center.replaceChildren(); right.replaceChildren();
    if (state.mode === 'student' && state.student) {
      center.append(el('div.student-chip', el('span.animal', state.student.animal), el('span', state.student.name)));
      right.append(el('button.icon-btn.big', { type: 'button', 'aria-label': 'Volver a ¿Quién eres?', title: 'Volver a ¿Quién eres?', onclick: goHome }, '🏠'));
    } else if (state.mode === 'teacher') {
      const tabs = el('div.tabs', { role: 'tablist' });
      for (const t of TEACHER_TABS) {
        const active = state.screen === t.id || (t.id === 'library' && state.screen === 'editor');
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
    state.mode = 'teacher'; state.student = null;
    LL.sync.run();
    LL.library.resetToRoot();
    go('library');
  }

  async function goHome() {
    if (state.screen === 'editor' && !(await LL.editor.canLeave())) return;
    if (LL.player.isOpen()) LL.player.close();
    stopSonidos();
    state.mode = null; state.student = null; state.screen = 'editor-left';
    if (LL.auth.needsLogin()) { go('login'); return; }
    go('students');
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
      const card = el('button.student-card', { type: 'button' }, el('span.animal', s.animal), el('span', s.name));
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

  /* ---------- Sonidos iniciales (original activity) ---------- */
  let sonidosConfig = null;
  function openSonidos() {
    sonidosConfig = S.sonidos();
    if (!sonidosConfig.letters.length) { toast('Elige al menos una letra en «Sonidos iniciales».', 'error'); return; }
    go('sonidos');
    $('#sonidosTitle').textContent = '🔤 Sonidos iniciales' + (state.student ? ' · ' + state.student.name : ' · prueba del maestro');
    const f = $('#sonidosFrame');
    const cfg = { lang: sonidosConfig.lang, per: sonidosConfig.per, speed: sonidosConfig.speed, mode: sonidosConfig.mode, letters: sonidosConfig.letters, fixedImages: sonidosConfig.fixedImages || null };
    f.onload = () => f.contentWindow.postMessage({ type: 'll-start', config: cfg }, '*');
    f.srcdoc = LL.sonidosActivityHTML;
  }
  function stopSonidos() { const f = $('#sonidosFrame'); if (f) { f.onload = null; f.removeAttribute('srcdoc'); f.src = 'about:blank'; } }

  function sonidosFinished(result) {
    stopSonidos();
    const c = sonidosConfig;
    if (!state.student) {
      toast('Prueba terminada: ' + result.ok + ' de ' + result.total + ' correctas.', 'success');
      go('library');
      return;
    }
    const me = state.student;
    const scores = S.sonidosScores(c);
    const prev = scores[me.name];
    if (!prev || result.ok > prev.ok) scores[me.name] = { ok: result.ok, total: result.total, animal: me.animal };
    S.saveSonidosScores(c, scores);
    $('#resultName').textContent = me.name;
    $('#resultScore').textContent = result.ok + ' / ' + result.total;
    const ranking = Object.entries(scores).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.ok - a.ok || a.name.localeCompare(b.name));
    $('#resultPlace').textContent = 'Puesto ' + (ranking.findIndex((x) => x.name === me.name) + 1) + ' de ' + ranking.length;
    $('#resultDate').textContent = 'Resultados de hoy (' + S.todayChicago() + ') con esta misma configuración';
    const list = $('#resultRanks');
    list.replaceChildren();
    ranking.forEach((r, i) => list.append(el('div.rank' + (r.name === me.name ? '.mine' : ''), el('span', (i + 1) + '.' + (i < 5 ? ' ⭐' : '')), el('span', r.animal || '🐾'), el('span', r.name), el('span', r.ok + '/' + r.total))));
    go('result');
  }

  window.addEventListener('message', (e) => {
    const f = $('#sonidosFrame');
    if (!f || e.source !== f.contentWindow || !e.data || e.data.type !== 'll-finished') return;
    sonidosFinished(e.data);
  });

  document.addEventListener('DOMContentLoaded', () => {
    $('#sonidosExit').addEventListener('click', () => { stopSonidos(); go('library'); });
    $('#resultOk').addEventListener('click', () => go('library'));
    document.querySelectorAll('[data-info]').forEach((b) => b.addEventListener('click', () => openInfo(b.dataset.info)));
    start();
  });

  async function start() {
    S.mergeDuplicateFolders();
    // Links from invitation / password-reset emails arrive with a token in the address.
    const r = LL.cloud.enabled() ? await LL.cloud.handleRedirect() : null;
    if (r && r.error) { state.loginMessage = null; go('login'); toast('El enlace no es válido o ya caducó. Pide uno nuevo.', 'error'); return; }
    if (r && (r.type === 'invite' || r.type === 'recovery')) { state.passwordKind = r.type; go('set-password'); return; }
    if (r) { LL.auth.afterSignIn(); return; }
    if (LL.auth.needsLogin()) { go('login'); return; }
    go('students');
    if (LL.cloud.signedIn()) LL.sync.run();
  }

  // Refresh what's on screen when new activities arrive from the cloud.
  document.addEventListener('ll-synced', () => {
    if (LL.player.isOpen()) return;
    if (state.screen === 'students') renderStudents();
    else if (state.screen === 'library') LL.library.render();
    else if (state.screen === 'students-admin') LL.teacher.renderRoster();
    else if (state.screen === 'sonidos-admin') LL.teacher.renderSonidos();
  });
  document.addEventListener('ll-signed-out', () => {
    if (LL.cloud.signedIn()) return;
    toast('Tu sesión terminó. Vuelve a entrar para seguir sincronizando.', 'error');
    if (!LL.player.isOpen() && state.screen !== 'editor' && !state.mode) go('login');
  });

  LL.app = { state, go, goHome, openSonidos, openInfo };
})();
