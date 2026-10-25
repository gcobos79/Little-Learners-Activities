/* App shell: screens, top bar, student picker, teacher entry, Sonidos iniciales. */
window.LL = window.LL || {};
(function () {
  const { el, $, $$, toast } = LL.ui;
  const S = LL.store;

  const state = { screen: 'students', mode: null, student: null };
  const SCREENS = ['students', 'library', 'editor', 'students-admin', 'backup', 'sonidos-admin', 'sonidos', 'result', 'info'];
  let infoReturn = 'students';
  const TEACHER_TABS = [
    { id: 'library', icon: '📚', label: 'Actividades' },
    { id: 'students-admin', icon: '👧', label: 'Estudiantes' },
    { id: 'sonidos-admin', icon: '🔤', label: 'Sonidos iniciales' },
    { id: 'backup', icon: '💾', label: 'Respaldo' },
  ];

  async function go(screen) {
    if (state.screen === 'editor' && screen !== 'editor' && LL.editor && !(await LL.editor.canLeave())) return;
    state.screen = screen;
    for (const s of SCREENS) $('#screen-' + s).hidden = s !== screen;
    document.body.classList.toggle('mode-student', state.mode === 'student');
    document.body.classList.toggle('mode-teacher', state.mode === 'teacher');
    document.body.classList.toggle('mode-home', !state.mode);
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
      right.append(el('button.icon-btn', { type: 'button', 'aria-label': 'Información, privacidad y términos', title: 'Información', onclick: () => openInfo('acerca') }, 'ℹ️'));
      right.append(el('button.btn.ghost', { type: 'button', onclick: goHome }, 'Salir ↩'));
    } else if (state.screen === 'info') {
      right.append(el('button.btn.ghost', { type: 'button', onclick: () => go(infoReturn) }, '⬅️ Volver'));
    } else {
      right.append(teacherGate());
    }
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

  function enterTeacher() {
    state.mode = 'teacher'; state.student = null;
    LL.library.resetToRoot();
    go('library');
  }

  async function goHome() {
    if (state.screen === 'editor' && !(await LL.editor.canLeave())) return;
    if (LL.player.isOpen()) LL.player.close();
    stopSonidos();
    state.mode = null; state.student = null; state.screen = 'editor-left';
    go('students');
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
    go('students');
  });

  LL.app = { state, go, goHome, openSonidos, openInfo };
})();
