/* Quiz results (V124).
 *
 * Rule from the teacher: ONE result per student, per quiz, per month. When a
 * child does the same quiz again in the same month, the newest attempt replaces
 * the older one (both the total and the question-by-question detail).
 *
 * A finished quiz is first stored on the device (so nothing is lost without
 * internet) and then uploaded with save_quiz_result(), which keeps only the
 * newest attempt of each month. The teacher sees a ranking per quiz and month. */
window.LL = window.LL || {};
(function () {
  const { el, $, toast, dialog } = LL.ui;
  const S = LL.store;
  const KEY = 'll-v124-results';
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** 'YYYY-MM-01' of a date, in the school's time zone (Chicago). */
  function monthOf(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-01`;
  }
  const shiftMonth = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 8) + '01'; };
  const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return MONTHS[mo - 1] + ' ' + y; };

  function readAll() { return S.readJSON(KEY, {}) || {}; }
  function writeAll(x) { try { localStorage.setItem(KEY, JSON.stringify(x)); } catch (e) { console.warn('results not saved', e); } }
  const keyOf = (r) => (r.student_id != null ? 'id:' + r.student_id : 'n:' + String(r.student_name).toLowerCase()) + '|' + r.quiz_id + '|' + r.month;

  /** Called by the player when a child finishes a quiz. */
  function record({ quiz, student, answers, total, startedAt, finishedAt }) {
    const score = answers.filter((a) => a.correct).length;
    const r = {
      student_id: typeof student.id === 'number' || /^\d+$/.test(String(student.id || '')) ? Number(student.id) : null,
      student_name: student.name, student_animal: student.animal || '', student_avatar: student.avatar || '',
      quiz_id: quiz.id, quiz_name: quiz.name, month: monthOf(new Date(finishedAt)),
      score, total, started_at: startedAt, finished_at: finishedAt,
      duration_seconds: Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)),
      answers: answers.slice().sort((a, b) => a.position - b.position), uploaded: false,
    };
    const all = readAll();
    const k = keyOf(r);
    if (all[k] && Date.parse(all[k].finished_at) > Date.parse(r.finished_at)) return;
    all[k] = r;
    writeAll(all);
    flush();
  }

  let flushing = null;
  /** Upload results that are waiting on this device. */
  function flush() {
    if (!LL.cloud.signedIn()) return Promise.resolve(0);
    if (flushing) return flushing;
    flushing = (async () => {
      const all = readAll();
      let sent = 0;
      for (const [k, r] of Object.entries(all)) {
        if (r.uploaded || r.student_id == null) continue;
        try {
          await LL.cloud.rpc('save_quiz_result', {
            p_result: { student_id: r.student_id, quiz_id: r.quiz_id, month: r.month, score: r.score, total: r.total, started_at: r.started_at, finished_at: r.finished_at, duration_seconds: r.duration_seconds },
            p_answers: r.answers,
          });
          delete all[k]; // safely in the database now
          sent++;
        } catch (e) {
          if (e.code === 'offline' || e.status === 0) break; // try again when back online
          // e.g. the quiz isn't uploaded yet: keep it and try on the next sync
          console.warn('result upload postponed', e.message);
        }
      }
      writeAll(all);
      return sent;
    })().finally(() => { flushing = null; });
    return flushing;
  }
  window.addEventListener('online', () => flush());

  /* ---------- Teacher view ---------- */
  /** 'YYYY-MM-DD' of a date in the school's time zone. */
  function dayOf(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  const shiftDay = (day, d) => { const t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  const dayLabel = (day) => {
    const t = new Date(day + 'T12:00:00Z');
    const txt = t.toLocaleDateString('es-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    return (day === dayOf() ? 'Hoy · ' : day === shiftDay(dayOf(), -1) ? 'Ayer · ' : '') + txt;
  };
  const VIEW_KEY = 'll-v124-results-view';
  const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'day'; } catch { return 'day'; } };

  // view 'day': only children who did the activity that day (default, for day-to-day work); 'month': the whole month.
  let current = { quiz: null, month: monthOf(), day: dayOf(), view: 'day' };

  function open(quiz, month, view, day) {
    const d = day || (month && month !== monthOf() ? month : dayOf());
    current = { quiz, view: view || (month ? 'month' : savedView()), day: d, month: month || monthOf(new Date(d + 'T12:00:00Z')) };
    LL.app.go('results');
  }
  function setView(v) { current.view = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } render(); LL.app.replaceRoute(); }
  function setDay(day) { current.day = day; current.month = monthOf(new Date(day + 'T12:00:00Z')); render(); LL.app.replaceRoute(); }

  async function load(quiz, month) {
    const local = Object.values(readAll()).filter((r) => r.quiz_id === quiz.id && r.month === month);
    let rows = [], offline = false;
    if (LL.cloud.signedIn()) {
      try {
        const data = await LL.cloud.select('quiz_results', 'select=id,student_id,score,total,started_at,finished_at,duration_seconds,students(name,animal,avatar_path),quiz_result_answers(position,prompt,chosen_text,correct,response_ms)&quiz_id=eq.' + encodeURIComponent(quiz.id) + '&month=eq.' + month);
        rows = (data || []).map((r) => ({
          student_id: r.student_id, student_name: r.students ? r.students.name : '¿?', student_animal: r.students ? r.students.animal : '', student_avatar: r.students ? LL.media.toRef(r.students.avatar_path) : '',
          score: r.score, total: r.total, finished_at: r.finished_at, duration_seconds: r.duration_seconds,
          answers: (r.quiz_result_answers || []).sort((a, b) => a.position - b.position),
        }));
      } catch (e) { offline = true; }
    }
    // Results still waiting on this device replace older ones from the database.
    for (const p of local) {
      const i = rows.findIndex((r) => (p.student_id != null ? r.student_id === p.student_id : r.student_name === p.student_name));
      const item = { ...p, pending: !!LL.cloud.signedIn() && !p.uploaded };
      if (i < 0) rows.push(item);
      else if (Date.parse(p.finished_at) > Date.parse(rows[i].finished_at)) rows[i] = item;
    }
    return { rows, offline };
  }

  /** Best score first; with the same score, the one who finished faster goes first.
   *  Only the same score AND the same time share a place (1, 2, 2, 4…). */
  function rank(rows) {
    rows.sort((a, b) => (b.score / Math.max(1, b.total)) - (a.score / Math.max(1, a.total)) || b.score - a.score || (a.duration_seconds ?? 1e9) - (b.duration_seconds ?? 1e9) || a.student_name.localeCompare(b.student_name, 'es'));
    let place = 0, prev = null;
    rows.forEach((r, i) => { const key = r.score + '/' + r.total + '/' + (r.duration_seconds ?? ''); if (key !== prev) { place = i + 1; prev = key; } r.place = place; });
    return rows;
  }

  const fmtTime = (s) => (s == null ? '—' : s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s');
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-US', { day: 'numeric', month: 'short', timeZone: 'America/Chicago' }) + ' · ' + new Date(iso).toLocaleTimeString('es-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  /** Short time for the children's board: 45 s → 0:45, 125 s → 2:05. */
  const clock = (s) => (s == null ? '—' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
  const medal = (p) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : '');

  async function render() {
    const page = $('#screen-results');
    const { quiz, month, view, day } = current;
    if (!quiz) { LL.app.go('library'); return; }
    const isThisMonth = month === monthOf();
    const isDay = view === 'day';
    const isToday = day === dayOf();
    const periodLabel = isDay ? dayLabel(day) : monthLabel(month);
    const toggle = el('div.segmented.view-toggle', { role: 'group', 'aria-label': 'Ver resultados por' },
      el('button', { type: 'button', 'aria-pressed': String(isDay), onclick: () => setView('day') }, '📅 Por día'),
      el('button', { type: 'button', 'aria-pressed': String(!isDay), onclick: () => setView('month') }, '🗓️ Por mes'));
    const nav = isDay
      ? el('div.month-nav',
        el('button.btn.soft', { type: 'button', 'aria-label': 'Día anterior', onclick: () => setDay(shiftDay(day, -1)) }, '‹'),
        el('div.nav-center', el('h2', periodLabel), isToday ? null : el('button.link-btn', { type: 'button', onclick: () => setDay(dayOf()) }, 'Ir a hoy')),
        el('button.btn.soft', { type: 'button', 'aria-label': 'Día siguiente', disabled: isToday, onclick: () => setDay(shiftDay(day, 1)) }, '›'))
      : el('div.month-nav',
        el('button.btn.soft', { type: 'button', 'aria-label': 'Mes anterior', onclick: () => { current.month = shiftMonth(month, -1); render(); LL.app.replaceRoute(); } }, '‹'),
        el('h2', periodLabel),
        el('button.btn.soft', { type: 'button', 'aria-label': 'Mes siguiente', disabled: isThisMonth, onclick: () => { current.month = shiftMonth(month, 1); render(); LL.app.replaceRoute(); } }, '›'));
    page.replaceChildren(el('div.tool-page.results-page',
      el('div.results-head',
        el('button.btn.ghost', { type: 'button', onclick: () => LL.app.go('library') }, '⬅️ Mis actividades'),
        el('div', el('h1', '📊 ' + quiz.name), el('p.lead', isDay ? 'Quiénes trabajaron este día y quiénes faltan.' : 'Un resultado por estudiante cada mes: queda el último intento.'))),
      toggle, nav,
      el('div.panel', el('p.muted', 'Cargando resultados…'))));

    let { rows, offline } = await load(quiz, month);
    if (current.quiz !== quiz || current.month !== month || current.view !== view || current.day !== day) return; // the teacher moved on
    if (isDay) rows = rows.filter((r) => dayOf(r.finished_at) === day);
    rank(rows);
    const panel = page.querySelector('.panel');
    panel.replaceChildren();
    if (offline) panel.append(el('p.problem-box', '📴 Sin conexión: se muestran solo los resultados guardados en este dispositivo.'));

    if (!rows.length) {
      panel.append(el('div.empty', el('div.big-emoji', isDay ? '📅' : '🗓️'), el('div', isDay ? (isToday ? 'Nadie ha hecho esta actividad hoy.' : 'Nadie hizo esta actividad ese día.') : 'Nadie ha hecho esta actividad en ' + monthLabel(month) + '.')));
    } else {
      const avg = Math.round(rows.reduce((s, r) => s + r.score / Math.max(1, r.total), 0) / rows.length * 100);
      panel.append(el('p.small.muted', rows.length + (rows.length === 1 ? ' estudiante' : ' estudiantes') + ' · promedio de la clase: ' + avg + ' %'));
      const table = el('div.results-table', { role: 'table', 'aria-label': 'Resultados: ' + periodLabel },
        el('div.rt-row.rt-head', { role: 'row' }, el('span', { role: 'columnheader' }, 'Puesto'), el('span', { role: 'columnheader' }, 'Estudiante'), el('span', { role: 'columnheader' }, 'Puntaje'), el('span.rt-date', { role: 'columnheader' }, 'Fecha'), el('span', { role: 'columnheader' }, 'Tiempo')));
      for (const r of rows) {
        const pct = Math.round(r.score / Math.max(1, r.total) * 100);
        const row = el('button.rt-row', { type: 'button', role: 'row', onclick: () => detail(r), 'aria-label': r.student_name + ': ' + r.score + ' de ' + r.total + '. Ver detalle' },
          el('span.rt-place', medal(r.place) + ' ' + r.place),
          el('span.rt-student', LL.teacher.avatar({ animal: r.student_animal, avatar: r.student_avatar }), el('span', r.student_name), r.pending ? el('span.badge.hidden', { title: 'Se subirá cuando haya internet' }, '⏳') : null),
          el('span.rt-score', el('strong', r.score + ' / ' + r.total), el('span.rt-bar', el('span', { style: { width: pct + '%' } }))),
          el('span.rt-date', fmtDate(r.finished_at)),
          el('span.rt-time', fmtTime(r.duration_seconds)));
        table.append(row);
      }
      panel.append(table, el('p.small.muted', current.quiz && current.quiz.type === 'sort' ? 'Toca un estudiante para ver dónde llevó cada tarjeta.' : 'Toca un estudiante para ver cada pregunta.'));
    }
    // Who hasn't done it this month
    const done = new Set(rows.map((r) => (r.student_id != null ? 'id:' + r.student_id : 'n:' + r.student_name)));
    const missing = S.roster().filter((s) => !done.has(s.id != null ? 'id:' + s.id : 'n:' + s.name));
    if (missing.length) {
      const title = isDay ? (isToday ? 'Todavía no lo hacen hoy (' + missing.length + '):' : 'No lo hicieron ese día (' + missing.length + '):')
        : (isThisMonth ? 'Todavía no lo hacen este mes (' + missing.length + '):' : 'No lo hicieron en ' + monthLabel(month) + ' (' + missing.length + '):');
      panel.append(el('div.missing', el('strong', title),
        el('div.missing-list', missing.map((s) => el('span.missing-chip', LL.teacher.avatar(s), s.name)))));
    } else if (S.roster().length) {
      panel.append(el('div.missing', el('strong', isDay ? '🎉 ¡Todos lo hicieron ' + (isToday ? 'hoy' : 'ese día') + '!' : '🎉 ¡Todos lo hicieron este mes!')));
    }
    if (isDay) panel.append(el('p.small.muted', 'Cada mes se guarda solo el último intento de cada niño. Si alguien la repitió otro día de este mes, aparece en el día de su último intento.'));
  }

  function detail(r) {
    const sorting = !!(current.quiz && current.quiz.type === 'sort');
    const list = el('ol.answer-list');
    for (const a of r.answers || []) {
      list.append(el('li.' + (a.correct ? 'good' : 'bad'),
        el('span.mark', a.correct ? '✓' : '✗'),
        el('span.q', a.prompt || '(pregunta sin texto)'),
        el('span.a', (sorting ? 'Lo llevó a: ' : 'Respondió: ') + (a.chosen_text || '—'))));
    }
    dialog({
      title: r.student_name + ' · ' + r.score + ' / ' + r.total,
      body: el('div', { style: { display: 'grid', gap: '10px' } },
        el('p.small.muted', fmtDate(r.finished_at) + ' · ' + fmtTime(r.duration_seconds)),
        (r.answers || []).length ? list : el('p.muted', 'No hay detalle para este resultado.')),
      actions: [{ label: 'Cerrar', kind: 'primary', value: true }],
      wide: true,
    });
  }

    /** Today's board for the end-of-quiz screen: ranked results + students still pending. */
  async function dayBoard(quiz, day = dayOf()) {
    const { rows } = await load(quiz, monthOf(new Date(day + 'T12:00:00Z')));
    const today = rank(rows.filter((r) => dayOf(r.finished_at) === day));
    const done = new Set(today.map((r) => (r.student_id != null ? 'id:' + r.student_id : 'n:' + r.student_name)));
    const missing = S.roster().filter((s) => !done.has(s.id != null ? 'id:' + s.id : 'n:' + s.name));
    return { rows: today, missing };
  }

  LL.results = { record, flush, open, render, monthOf, dayOf, dayBoard, clock, current: () => current };
})();
