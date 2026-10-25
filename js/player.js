/* Quiz player. Same answer rules and timing as V121:
 *  - Correct: magic sound, the answer blinks green, next question after 2 s.
 *  - Wrong (Práctica): buzzer, blinks red, then the correct answer blinks green, next after 2 s more.
 *  - Wrong (Evaluación): buzzer, blinks red, next question after 2 s (correct answer is not shown).
 */
window.LL = window.LL || {};
(function () {
  const { el, $, speak, playAudio, stopSound, feedbackTone, shuffle, confetti } = LL.ui;
  const PASTELS = ['#F8DDE3', '#FBE4D0', '#FFF1BD', '#DDF2D7', '#D8F0EC', '#DCE8FC'];

  let quiz = null, questions = [], index = 0, opts = {}, timer = null, run = 0, answered = false, selected = new Set();

  const root = () => $('#player');
  const body = () => $('#playerBody');

  function open(entry, options = {}) {
    quiz = entry;
    opts = options;
    questions = LL.store.clone(entry.config?.questions || []);
    if (entry.config?.questionOrder === 'random' && !options.preview) questions = shuffle(questions);
    index = Math.max(0, Math.min(options.startIndex || 0, questions.length - 1));
    root().hidden = false;
    root().classList.toggle('is-preview', !!options.preview);
    document.body.style.overflow = 'hidden';
    render();
  }

  function close() {
    clearTimer();
    stopSound();
    root().hidden = true;
    document.body.style.overflow = '';
    const cb = opts.onClose;
    quiz = null;
    cb && cb();
  }

  function clearTimer() { if (timer) clearTimeout(timer); timer = null; run++; }

  function promptSpeech(q) { return q.readTextEnabled && q.readText ? q.readText : q.text; }
  function hasPromptSound(q) {
    return (q.audioMode === 'file' && q.audio) || (q.audioMode === 'voice' && String(promptSpeech(q) || '').trim());
  }
  /** Natural ElevenLabs voice when it was prepared, otherwise the device voice. */
  async function sayItem(item, fallbackText) {
    if (LL.tts && (await LL.tts.play(item))) return;
    speak(fallbackText, quiz && quiz.config?.lang);
  }
  function playPrompt(q) {
    if (q.audioMode === 'file' && q.audio) playAudio(q.audio);
    else if (q.audioMode === 'voice') sayItem(q, promptSpeech(q));
  }

  function renderProgress() {
    const p = $('#playerProgress');
    p.replaceChildren();
    if (opts.preview) p.append(el('span.preview-banner', 'Vista previa del maestro'));
    if (questions.length <= 20) {
      questions.forEach((_, i) => p.append(el('span.dot' + (i < index ? '.done' : i === index ? '.now' : ''))));
    } else {
      p.append(el('span.progress-text', `${index + 1} / ${questions.length}`));
    }
  }

  function render() {
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

    // Question
    const hasImg = q.image && String(q.image).startsWith('data:image/');
    const qa = el('div.question.enter' + (hasImg ? '.has-image' : ''));
    if (q.text) qa.append(el('div.question-text', q.text));
    if (hasImg) qa.append(el('img.question-image', { src: q.image, alt: 'Imagen de la pregunta' }));
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
      const img = o.image && String(o.image).startsWith('data:image/');
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

    if (LL.tts) LL.tts.prefetch([q, ...(q.options || [])]);
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
    if (quiz.config?.mode === 'assessment') { next(2000, myRun); return; }
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
    body().replaceChildren(el('div.finish',
      el('div.stars', '⭐🌟⭐'),
      el('h1', who ? `¡Muy bien, ${who.name}!` : '¡Muy bien!'),
      el('p.lead', 'Terminaste «' + quiz.name + '».'),
      el('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' } },
        el('button.btn.ghost.big', { type: 'button', onclick: () => { index = 0; render(); } }, '🔁 Otra vez'),
        el('button.btn.primary.big', { type: 'button', onclick: close }, opts.preview ? 'Cerrar vista previa' : '📚 Mis actividades')),
    ));
  }

  // Wire fixed controls once.
  document.addEventListener('DOMContentLoaded', () => {
    $('#playerExit').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (root().hidden) return;
      if (e.key === 'Escape') { close(); return; }
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

  LL.player = { open, close, isOpen: () => !root().hidden };
})();
