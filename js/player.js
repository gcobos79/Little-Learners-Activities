/* Quiz player. Same answer rules and timing as V121:
 *  - Correct: magic sound, the answer blinks green, next question after 2 s.
 *  - Wrong: buzzer, blinks red, then the correct answer blinks green, next after 2 s more.
 * (V124: the "Evaluación" mode was removed; every quiz works this way.)
 */
window.LL = window.LL || {};
(function () {
  const { el, $, toast, speak, playAudio, stopSound, feedbackTone, shuffle, confetti } = LL.ui;
  const PASTELS = ['#F8DDE3', '#FBE4D0', '#FFF1BD', '#DDF2D7', '#D8F0EC', '#DCE8FC'];

  let quiz = null, questions = [], index = 0, opts = {}, timer = null, run = 0, answered = false, selected = new Set();
  // What the child answered in this attempt (first answer of each question), for the results.
  let attempt = null, shownAt = 0;
  const newAttempt = () => { attempt = { startedAt: new Date().toISOString(), answers: [] }; };

  const root = () => $('#player');
  const body = () => $('#playerBody');

  // «Clasificación rápida» (type 'sort') runs the conveyor-belt game in the same player.
  let sortTotal = 0, sortDone = 0;
  const isSort = () => !!quiz && quiz.type === 'sort';

  function open(entry, options = {}) {
    quiz = entry;
    opts = options;
    questions = entry.type === 'sort' ? [] : LL.store.clone(entry.config?.questions || []);
    if (entry.config?.questionOrder === 'random' && !options.preview) questions = shuffle(questions);
    index = Math.max(0, Math.min(options.startIndex || 0, questions.length - 1));
    newAttempt();
    root().hidden = false;
    root().classList.toggle('is-preview', !!options.preview);
    // Show who is playing, so the teacher can check at a glance that each child is on their own name.
    const who = LL.app.state.student, chip = $('#playerStudent');
    chip.hidden = !who || !!options.preview;
    chip.replaceChildren();
    if (who && !options.preview) chip.append(LL.teacher.avatar(who), el('span', who.name));
    chip.setAttribute('aria-label', who ? 'Estudiante: ' + who.name : '');
    document.body.style.overflow = 'hidden';
    render();
    document.dispatchEvent(new CustomEvent('ll-player-open', { detail: { quizId: entry.id || null, preview: !!options.preview } }));
  }

  /** fromHistory: closed by the browser's Back button (the page history already moved). */
  function close(how) {
    if (root().hidden) return;
    clearTimer();
    stopSound();
    if (LL.sortGame) LL.sortGame.stop();
    root().hidden = true;
    document.body.style.overflow = '';
    const cb = opts.onClose;
    const id = quiz && quiz.id;
    quiz = null;
    cb && cb();
    document.dispatchEvent(new CustomEvent('ll-player-close', { detail: { quizId: id, fromHistory: !!(how && how.fromHistory) } }));
  }

  function clearTimer() { if (timer) clearTimeout(timer); timer = null; run++; }

  function promptSpeech(q) { return q.readTextEnabled && q.readText ? q.readText : q.text; }
  function hasPromptSound(q) {
    return (q.audioMode === 'file' && q.audio) || (q.audioMode === 'voice' && String(promptSpeech(q) || '').trim());
  }
  /** Natural ElevenLabs voice when it was prepared, otherwise the device voice. */
  async function sayItem(item, fallbackText) {
    const gender = (quiz && quiz.config?.voiceGender) || 'female';
    if (LL.tts && (await LL.tts.play(item, gender))) return;
    speak(fallbackText, quiz && quiz.config?.lang, gender);
  }
  function playPrompt(q) {
    if (q.audioMode === 'file' && q.audio) playAudio(q.audio);
    else if (q.audioMode === 'voice') sayItem(q, promptSpeech(q));
  }

  function renderProgress() {
    const p = $('#playerProgress');
    p.replaceChildren();
    if (opts.preview) p.append(el('span.preview-banner', 'Vista previa del maestro'));
    if (isSort()) return; // the belt game shows its own time and count
    if (questions.length <= 20) {
      questions.forEach((_, i) => p.append(el('span.dot' + (i < index ? '.done' : i === index ? '.now' : ''))));
    } else {
      p.append(el('span.progress-text', `${index + 1} / ${questions.length}`));
    }
  }

  function renderSort() {
    clearTimer();
    stopSound();
    sortDone = 0;
    const info = LL.sortGame.start(body(), quiz, {
      say: (item, text) => sayItem(item, text),
      onProgress: (done, total) => { sortDone = done; sortTotal = total; }, // the game updates its own counter
      onFinish: (r) => { attempt.answers = r.answers; sortTotal = r.total; finish(); },
    });
    sortTotal = info.total;
    renderProgress();
    $('#playerProgress').append(info.status); // ⏱️ time · count · ✓ right, in the top bar
    const speakBtn = $('#playerSpeak');
    speakBtn.disabled = !info.instruction;
    speakBtn.onclick = () => speak(info.instruction, quiz.config?.lang, quiz.config?.voiceGender || 'female');
    if (info.instruction) { const myRun = run; timer = setTimeout(() => { if (myRun === run && !root().hidden) speak(info.instruction, quiz.config?.lang, quiz.config?.voiceGender || 'female'); }, 300); }
    if (!info.total) body().replaceChildren(el('div.finish', el('div.stars', '🤔'), el('h1', 'Esta actividad todavía no tiene tarjetas.')));
  }

  function render() {
    if (isSort()) { renderSort(); return; }
    clearTimer();
    stopSound();
    answered = false;
    selected = new Set();
    const q = questions[index];
    const b = body();
    b.replaceChildren();
    if (!q) {
      renderProgress();
      b.append(el('div.finish', el('div.stars', '🤔'), el('h1', 'Esta actividad todavía no tiene preguntas.')));
      $('#playerSpeak').disabled = true;
      return;
    }
    renderProgress();
    shownAt = Date.now();

    // Question
    const hasImg = LL.media.isImage(q.image);
    const qa = el('div.question.enter' + (hasImg ? '.has-image' : ''));
    if (q.text) qa.append(el('div.question-text', q.text));
    if (hasImg) {
      const img = el('img.question-image', { src: q.image, alt: 'Imagen de la pregunta' });
      // Tapping the picture also reads the question (same as the 🔊 button).
      if (hasPromptSound(q)) {
        Object.assign(img, { tabIndex: 0, title: 'Toca para escuchar' });
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', 'Escuchar la pregunta');
        img.classList.add('tap-speak');
        const say = () => {
          playPrompt(q);
          img.classList.remove('pop'); void img.offsetWidth; img.classList.add('pop');
        };
        img.addEventListener('click', say);
        img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(); } });
      }
      qa.append(img);
    }
    if (!q.text && !hasImg && q.emoji) qa.append(el('div.question-text', q.emoji));
    b.append(qa);

    const speakBtn = $('#playerSpeak');
    speakBtn.disabled = !hasPromptSound(q);
    speakBtn.onclick = () => playPrompt(q);

    // Answers
    let list = (q.options || []).map((o, i) => ({ ...o, _i: i }));
    if (quiz.config?.answerOrder === 'random') list = shuffle(list);
    const n = list.length;
    const grid = el('div.options.enter');
    if (n === 5) grid.classList.add('five');
    if (n === 2) grid.classList.add('two');
    grid.style.setProperty('--cols', String(n <= 4 ? n : 3));
    grid.style.setProperty('--rows', String(n <= 4 ? 1 : 2));
    grid.style.setProperty('--rows-portrait', String(Math.ceil(n / 2)));
    const correctNeeded = Math.max(1, q.options.filter((o) => o.correct).length || Number(q.correctCount) || 1);

    list.forEach((o, i) => {
      const img = LL.media.isImage(o.image);
      const btn = el('button.option' + (img ? '.has-image' : ''), { type: 'button', dataset: { index: String(o._i) }, 'aria-label': o.text || 'Respuesta ' + (i + 1) });
      btn.style.setProperty('--pastel', PASTELS[i % PASTELS.length]);
      btn.style.setProperty('--i', String(i));
      if (img) btn.append(el('img', { src: o.image, alt: o.text || '' }));
      if (o.text) btn.append(el('span.label', o.text));
      if ((o.audioMode === 'file' && o.audio) || (o.audioMode === 'voice' && (o.text || o.readText))) {
        const s = el('span.icon-btn.answer-sound', { role: 'button', tabindex: '0', 'aria-label': 'Escuchar esta respuesta' }, '🔊');
        const play = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (answered) return;
          if (o.audioMode === 'file' && o.audio) playAudio(o.audio);
          else sayItem(o, o.readTextEnabled && o.readText ? o.readText : o.text);
        };
        s.addEventListener('click', play);
        s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') play(e); });
        btn.append(s);
      }
      btn.addEventListener('click', () => choose(o._i, btn, q, grid, correctNeeded));
      grid.append(btn);
    });
    b.append(grid);
    setTimeout(() => { qa.classList.remove('enter'); grid.classList.remove('enter'); }, 120 + n * 70 + 450);
    requestAnimationFrame(() => { fitLabels(grid); requestAnimationFrame(() => fitLabels(grid)); });

    if (LL.tts) LL.tts.prefetch([q, ...(q.options || [])], quiz.config?.voiceGender || 'female');
    // Read the question aloud automatically (needs a tap first, which the child just did).
    const myRun = run;
    timer = setTimeout(() => { if (myRun === run && !root().hidden) playPrompt(q); }, 250);
  }

  /** Shrink only the answer texts that don't fit their box. */
  function fitLabels(grid) {
    grid.querySelectorAll('.option .label').forEach((tx) => {
      tx.style.fontSize = '';
      const box = tx.parentElement;
      let size = parseFloat(getComputedStyle(tx).fontSize) || 32;
      let guard = 0;
      while (size > 12 && guard++ < 120 && (tx.scrollWidth > box.clientWidth - 8 || box.scrollHeight > box.clientHeight + 1)) {
        size -= 2; tx.style.fontSize = size + 'px';
      }
    });
  }

  function choose(i, btn, q, grid, correctNeeded) {
    if (answered) return;
    if (selected.has(i)) return;
    selected.add(i);
    btn.classList.add('selected');
    if (selected.size < correctNeeded) return;

    answered = true;
    clearTimer();
    stopSound();
    const myRun = run;
    const buttons = [...grid.querySelectorAll('.option')];
    buttons.forEach((b) => { b.disabled = true; });
    const chosen = buttons.filter((b) => selected.has(Number(b.dataset.index)));
    const correctIdx = q.options.map((o, k) => (o.correct ? k : -1)).filter((k) => k >= 0);
    const isCorrect = selected.size === correctIdx.length && [...selected].every((k) => q.options[k] && q.options[k].correct);
    if (attempt && !attempt.answers.some((a) => a.question_id === q.id)) {
      const picked = [...selected].map((k) => q.options[k]).filter(Boolean);
      const original = (quiz.config?.questions || []).findIndex((x) => x.id === q.id);
      attempt.answers.push({
        position: original >= 0 ? original : index, question_id: q.id,
        prompt: String(q.text || q.readText || q.emoji || '').slice(0, 300),
        chosen_option_ids: picked.map((o) => o.id), chosen_text: picked.map((o) => o.text || '🖼️').join(', ').slice(0, 200),
        correct: isCorrect, response_ms: Date.now() - shownAt,
      });
    }
    const flash = (b, good) => { b.classList.remove('selected'); b.classList.add(good ? 'flash-correct' : 'flash-incorrect'); };

    if (isCorrect) {
      feedbackTone(true);
      chosen.forEach((b) => flash(b, true));
      const r = chosen[0].getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2);
      next(2000, myRun);
      return;
    }
    feedbackTone(false);
    chosen.forEach((b) => flash(b, !!q.options[Number(b.dataset.index)].correct));
    timer = setTimeout(() => {
      if (myRun !== run || root().hidden) return;
      buttons.filter((b) => q.options[Number(b.dataset.index)].correct).forEach((b) => { b.classList.remove('flash-correct', 'flash-incorrect'); void b.offsetWidth; flash(b, true); });
      next(2000, myRun);
    }, 2000);
  }

  function next(ms, myRun) {
    timer = setTimeout(() => {
      if (myRun !== run || root().hidden) return;
      if (index < questions.length - 1) { index++; render(); } else finish();
    }, ms);
  }

  function finish() {
    clearTimer();
    index = questions.length;
    renderProgress();
    $('#playerSpeak').disabled = true;
    feedbackTone(true);
    setTimeout(() => confetti(null, innerHeight * 0.35, 40), 150);
    const who = LL.app.state.student;
    // Save the result (one per student, quiz and month; the newest replaces older ones).
    if (!opts.preview && who && quiz.id && attempt && LL.results) {
      LL.results.record({ quiz, student: who, answers: attempt.answers, total: isSort() ? sortTotal : questions.length, startedAt: attempt.startedAt, finishedAt: new Date().toISOString() });
    }
    const showBoard = !opts.preview && who && quiz.id && LL.results;
    const board = showBoard ? el('div.board', { 'aria-live': 'polite' }, el('p.muted', 'Cargando los resultados de hoy…')) : null;
    body().replaceChildren(el('div.finish' + (showBoard ? '.with-board' : ''),
      el('div.stars', '⭐🌟⭐'),
      el('h1', who ? `¡Muy bien, ${who.name}!` : '¡Muy bien!'),
      el('p.lead', 'Terminaste «' + quiz.name + '».'),
      board,
      el('div.finish-buttons',
        el('button.btn.ghost.big', { type: 'button', onclick: () => { index = 0; newAttempt(); render(); } }, '🔁 Otra vez'),
        // Students: «Salir» goes back to «¿Quién eres?» so the next child can pick their animal.
        opts.preview
          ? el('button.btn.primary.big', { type: 'button', onclick: () => close() }, 'Cerrar vista previa')
          : el('button.btn.primary.big', { type: 'button', onclick: () => LL.app.goHome() }, '👋 Salir')),
    ));
    if (showBoard) fillBoard(board, quiz, who);
  }

  /** Today's results of this quiz for the whole class: best first, then who is still pending. */
  async function fillBoard(board, q, who) {
    let data;
    try { data = await LL.results.dayBoard(q); } catch { data = null; }
    if (!board.isConnected) return;
    if (!data) { board.replaceChildren(el('p.muted', 'No se pudieron cargar los resultados de hoy.')); return; }
    const me = (r) => (who.id != null ? r.student_id === who.id || r.id === who.id : (r.student_name || r.name) === who.name);
    const list = el('ol.board-list');
    const clock = LL.results.clock;
    for (const r of data.rows) {
      list.append(el('li' + (me(r) ? '.me' : ''),
        el('span.b-place', r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : String(r.place)),
        LL.teacher.avatar({ animal: r.student_animal, avatar: r.student_avatar }),
        el('span.b-name', r.student_name),
        el('span.b-score', r.score + ' / ' + r.total),
        el('span.b-time', { 'aria-label': 'Tiempo ' + clock(r.duration_seconds) }, clock(r.duration_seconds))));
    }
    for (const s of data.missing) {
      list.append(el('li.pending' + (me(s) ? '.me' : ''),
        el('span.b-place', '·'),
        LL.teacher.avatar(s),
        el('span.b-name', s.name),
        el('span.b-score.b-pending', '⏳ Pendiente'),
        el('span.b-time')));
    }
    const head = el('div.board-head', { 'aria-hidden': 'true' },
      el('span', 'Puesto'), el('span'), el('span', 'Nombre'), el('span', 'Puntos'), el('span', 'Tiempo'));
    board.replaceChildren(el('h2', '🏆 Resultados de hoy'), head, list);
    const mine = list.querySelector('li.me');
    if (mine) setTimeout(() => mine.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
  }

  // Wire fixed controls once.
  document.addEventListener('DOMContentLoaded', () => {
    // Exit: students must hold the button for 3 seconds (a ring fills up), so a stray tap
    // doesn't end the activity. In the teacher's preview a normal click is enough.
    const exitBtn = $('#playerExit');
    const HOLD_MS = 3000;
    let holdTimer = null, held = false;
    const studentMode = () => !opts.preview;
    const hint = () => {
      exitBtn.classList.remove('nudge'); void exitBtn.offsetWidth; exitBtn.classList.add('nudge');
      toast('Para salir, deja el dedo sobre ↩️ hasta que se llene el círculo.');
    };
    const stopHold = (showHint) => {
      if (!holdTimer) return;
      clearTimeout(holdTimer); holdTimer = null;
      exitBtn.classList.remove('holding');
      if (showHint) hint();
    };
    exitBtn.addEventListener('pointerdown', (e) => {
      if (!studentMode() || e.button > 0) return;
      e.preventDefault();
      held = false;
      exitBtn.classList.add('holding');
      holdTimer = setTimeout(() => {
        holdTimer = null; held = true; exitBtn.classList.remove('holding');
        // When the finger lifts, the browser "taps" whatever is now under it (e.g. the logo). Ignore that tap.
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener('click', swallow, true);
        const release = () => setTimeout(() => document.removeEventListener('click', swallow, true), 300);
        window.addEventListener('pointerup', release, { once: true });
        setTimeout(() => document.removeEventListener('click', swallow, true), 8000); // safety net
        close();
      }, HOLD_MS);
    });
    exitBtn.addEventListener('pointerup', () => stopHold(true));
    exitBtn.addEventListener('pointerleave', () => stopHold(true));
    exitBtn.addEventListener('pointercancel', () => stopHold(false));
    exitBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    exitBtn.addEventListener('click', (e) => {
      if (!studentMode()) { close(); return; }
      e.preventDefault();
      // Keyboard (Enter/Space) or a click that didn't come from a hold: just explain.
      if (!held && e.detail === 0) hint();
      held = false;
    });
    document.addEventListener('keydown', (e) => {
      if (root().hidden) return;
      if (e.key === 'Escape') { if (opts.preview) close(); return; } // students exit only by holding ↩️
      if (!opts.preview) return; // arrow-key navigation is for the teacher's preview only
      if (['ArrowRight', 'ArrowDown'].includes(e.key) && index < questions.length - 1) { e.preventDefault(); index++; render(); }
      if (['ArrowLeft', 'ArrowUp'].includes(e.key) && index > 0) { e.preventDefault(); index--; render(); }
    });
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { const g = $('#playerBody .options'); if (g && !root().hidden) fitLabels(g); }, 120);
    });
  });

  LL.player = { open, close, isOpen: () => !root().hidden, quizId: () => (quiz && quiz.id) || null };
})();
