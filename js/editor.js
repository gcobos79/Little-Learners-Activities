/* Quiz editor (teacher). One page: settings on the left, questions in the middle.
 * Saves in the same format as V121. Unsaved work is also kept as a draft so it can
 * be recovered if the page is closed by accident. */
window.LL = window.LL || {};
(function () {
  const { el, $, toast, dialog, confirmDialog, imageFileToDataURL, audioFileToDataURL, pickFile, speak, playAudio, stopSound } = LL.ui;
  const S = LL.store;
  // Dark enough for white letters (WCAG AA contrast).
  const LETTER_COLORS = ['#B83250', '#B5531A', '#8A6A00', '#2C7A47', '#1D7268', '#2F5BD3'];

  let quiz = null, snapshot = '', qIndex = 0;

  const root = () => $('#screen-editor');
  const isDirty = () => quiz && JSON.stringify(quiz) !== snapshot;

  /** Signed in: send a picture/audio to the cloud right away and keep only its short reference,
   *  so the browser's limited storage (about 5 MB) doesn't fill up with pictures. */
  async function store(dataUrl, folder) {
    if (!LL.cloud.signedIn() || !String(dataUrl).startsWith('data:')) return dataUrl;
    try { return await LL.media.upload(dataUrl, folder); } catch { return dataUrl; } // offline: upload later
  }

  async function open(id, folderId) {
    if (id) {
      const q = S.getQuiz(id);
      if (!q) { toast('No se encontró ese quiz.', 'error'); return; }
      quiz = { id: q.id, name: q.name, folderId: q.folderId || null, config: S.clone(q.config) };
      if (!Array.isArray(quiz.config.questions)) quiz.config.questions = [];
      quiz.config = { lang: 'es', voiceGender: 'female', mode: 'practice', questionOrder: 'fixed', answerOrder: 'fixed', visibility: 'hidden', coverImage: '', ...quiz.config };
    } else {
      quiz = S.newQuiz(folderId);
    }
    snapshot = JSON.stringify(quiz);
    qIndex = 0;

    const draft = S.readDraft();
    if (draft && draft.quizId === (id || 'new') && draft.quiz && JSON.stringify(draft.quiz) !== snapshot) {
      const when = draft.at ? new Date(draft.at).toLocaleString('es-US') : '';
      if (await confirmDialog('¿Recuperar cambios sin guardar?', 'Encontramos cambios de este quiz que no se guardaron' + (when ? ' (' + when + ')' : '') + '. ¿Quieres recuperarlos?', 'Recuperar')) {
        quiz = draft.quiz;
      } else S.clearDraft();
    }
    if (!quiz.config.questions.length) quiz.config.questions.push(S.newQuestion());
    await LL.app.go('editor');
    renderAll();
    if (!id) setTimeout(() => $('#edName') && $('#edName').focus(), 50);
  }

  function changed() {
    if (isDirty()) S.writeDraft({ quizId: quiz.id || 'new', quiz, at: new Date().toISOString() });
    const st = $('#edState');
    if (st) {
      st.textContent = isDirty() ? '● Cambios sin guardar' : '✓ Guardado';
      st.style.color = isDirty() ? '#8A5B08' : '#13753A';
    }
    renderQList();
  }

  /* ---------- Layout ---------- */
  function renderAll() {
    const r = root();
    r.replaceChildren();
    const name = el('input.name-input#edName', { type: 'text', maxlength: '90', placeholder: 'Nombre del quiz (ej. Animales)', value: quiz.name, 'aria-label': 'Nombre del quiz' });
    name.addEventListener('input', () => { quiz.name = name.value; changed(); });

    r.append(el('div.editor-top',
      el('button.btn.ghost', { type: 'button', onclick: () => LL.app.go('library') }, '⬅️ Mis actividades'),
      name,
      el('button.btn.soft', { type: 'button', onclick: preview }, '▶️ Probar'),
      el('button.btn.primary', { type: 'button', onclick: save }, '💾 Guardar')));
    r.append(el('p.small#edState', { style: { margin: '-8px 0 12px', fontWeight: '800' } }));

    const side = el('aside.editor-side', settingsPanel(), el('div.panel', { style: { display: 'grid', gap: '10px' } },
      el('h3#edQCount'),
      el('div.q-list#edQList'),
      el('button.btn.soft#edAddQ', { type: 'button', onclick: addQuestion }, '＋ Nueva pregunta')));
    r.append(el('div.editor-layout', side, el('div.panel.q-editor#edQuestion')));
    renderQuestion();
    changed();
  }

  function settingsPanel() {
    const c = quiz.config;
    const p = el('div.panel.settings-grid');
    p.append(el('h3', '⚙️ Ajustes'));

    const vis = el('input', { type: 'checkbox', checked: c.visibility === 'visible' });
    vis.addEventListener('change', () => { c.visibility = vis.checked ? 'visible' : 'hidden'; changed(); });
    p.append(el('div.field', el('label.switch', vis, 'Visible para estudiantes'), el('span.hint', 'Déjalo apagado mientras lo preparas. Los estudiantes solo ven los quizzes visibles.')));

    p.append(el('div.field', 'Idioma de la voz', segmented([['es', 'Español'], ['en', 'English']], c.lang, (v) => { c.lang = v; changed(); })));
    p.append(el('div.field', 'Tipo de voz', segmented([['female', '👩 Mujer'], ['male', '👨 Hombre']], c.voiceGender || 'female', (v) => { c.voiceGender = v; changed(); }),
      el('span.hint', 'Es una preferencia: si un aparato no tiene ese tipo de voz, se usa otra para que siempre se escuche.')));

    const qr = el('input', { type: 'checkbox', checked: c.questionOrder === 'random' });
    qr.addEventListener('change', () => { c.questionOrder = qr.checked ? 'random' : 'fixed'; changed(); });
    const ar = el('input', { type: 'checkbox', checked: c.answerOrder === 'random' });
    ar.addEventListener('change', () => { c.answerOrder = ar.checked ? 'random' : 'fixed'; changed(); });
    p.append(el('div.field', 'Orden', el('label.switch', qr, 'Mezclar preguntas'), el('label.switch', ar, 'Mezclar respuestas')));

    const coverBox = el('div.media-row');
    const drawCover = () => {
      coverBox.replaceChildren();
      if (c.coverImage) coverBox.append(el('img.thumb', { src: c.coverImage, alt: 'Portada' }));
      coverBox.append(el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { c.coverImage = await store(await imageFileToDataURL(f, 480, 0.76), 'covers'); drawCover(); changed(); } catch (e) { toast(e.message, 'error'); }
      } }, c.coverImage ? '🖼️ Cambiar' : '🖼️ Elegir imagen'));
      if (c.coverImage) coverBox.append(el('button.btn.sm.danger-ghost', { type: 'button', onclick: () => { c.coverImage = ''; drawCover(); changed(); } }, 'Quitar'));
    };
    drawCover();
    p.append(el('div.field', 'Imagen de la tarjeta', el('span.hint', 'Opcional. Se ve en la tarjeta de la actividad.'), coverBox));
    return p;
  }

  function segmented(options, value, onChange) {
    const wrap = el('div.segmented', { role: 'group' });
    for (const [v, label] of options) {
      const b = el('button', { type: 'button', 'aria-pressed': String(v === value) }, label);
      b.addEventListener('click', () => { wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onChange(v); });
      wrap.append(b);
    }
    return wrap;
  }

  function questionLabel(q) {
    return String(q.text || '').trim() || (q.image ? '🖼️ (imagen)' : q.readText ? '🔊 ' + q.readText : q.audio ? '🔊 (audio)' : 'Pregunta sin texto');
  }

  function renderQList() {
    const list = $('#edQList');
    if (!list) return;
    const qs = quiz.config.questions;
    $('#edQCount').textContent = '❓ Preguntas (' + qs.length + ' / 50)';
    $('#edAddQ').disabled = qs.length >= 50;
    list.replaceChildren();
    qs.forEach((q, i) => {
      const bad = !!S.questionProblem(q);
      list.append(el('button.q-item' + (bad ? '.problem' : ''), { type: 'button', 'aria-current': String(i === qIndex), title: bad ? S.questionProblem(q) : '', onclick: () => { qIndex = i; renderQuestion(); renderQList(); } },
        el('span.num', String(i + 1)), el('span.txt', questionLabel(q))));
    });
  }

  /* ---------- One question ---------- */
  function renderQuestion() {
    const box = $('#edQuestion');
    const qs = quiz.config.questions;
    qIndex = Math.max(0, Math.min(qIndex, qs.length - 1));
    const q = qs[qIndex];
    box.replaceChildren();

    const problem = el('div');
    const refreshProblem = () => {
      const msg = S.questionProblem(q);
      problem.className = msg ? 'problem-box' : 'ok-box';
      problem.textContent = msg ? '⚠️ ' + msg : '✓ Pregunta lista';
    };

    // Navigation (go to another question) is kept clearly apart from changing the order.
    const go = (d) => { qIndex = Math.max(0, Math.min(qs.length - 1, qIndex + d)); renderQuestion(); renderQList(); };
    box.append(el('div.q-nav',
      el('button.btn.soft', { type: 'button', disabled: qIndex === 0, onclick: () => go(-1), 'aria-label': 'Ir a la pregunta anterior' }, '‹ Anterior'),
      el('h2', 'Pregunta ' + (qIndex + 1) + ' de ' + qs.length),
      el('button.btn.soft', { type: 'button', disabled: qIndex === qs.length - 1, onclick: () => go(1), 'aria-label': 'Ir a la pregunta siguiente' }, 'Siguiente ›')));
    box.append(el('div.q-tools',
      el('span.small.muted', 'Esta pregunta:'),
      el('button.btn.sm.ghost', { type: 'button', disabled: qs.length >= 50, onclick: duplicateQuestion }, '📄 Duplicar'),
      el('button.btn.sm.ghost', { type: 'button', title: 'Cambia el orden: la pregunta pasa a un lugar antes', disabled: qIndex === 0, onclick: () => moveQuestion(-1) }, '↑ Cambiar de lugar'),
      el('button.btn.sm.ghost', { type: 'button', title: 'Cambia el orden: la pregunta pasa a un lugar después', disabled: qIndex === qs.length - 1, onclick: () => moveQuestion(1) }, '↓ Cambiar de lugar'),
      el('button.btn.sm.danger-ghost', { type: 'button', onclick: deleteQuestion }, '🗑️ Eliminar')));
    box.append(problem);

    const onEdit = () => { refreshProblem(); changed(); };

    // Prompt
    const prompt = el('textarea', { rows: '2', placeholder: 'Ej. ¿Cuál es el perro?' });
    prompt.value = q.text || '';
    prompt.addEventListener('input', () => { q.text = prompt.value; onEdit(); });
    box.append(el('label.field', 'Pregunta', el('span.hint', 'Puede quedar vacía si usas una imagen o un audio.'), prompt));

    // Prompt image
    const imgRow = el('div.media-row');
    const drawImg = () => {
      imgRow.replaceChildren();
      if (q.image) imgRow.append(el('img.thumb', { src: q.image, alt: 'Imagen de la pregunta' }));
      imgRow.append(el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { q.image = await store(await imageFileToDataURL(f, 1000, 0.8), 'images'); drawImg(); onEdit(); } catch (e) { toast(e.message, 'error'); }
      } }, q.image ? '🖼️ Cambiar imagen' : '🖼️ Agregar imagen'));
      if (q.image) imgRow.append(el('button.btn.sm.danger-ghost', { type: 'button', onclick: () => { q.image = ''; drawImg(); onEdit(); } }, 'Quitar'));
    };
    drawImg();
    box.append(el('div.field', 'Imagen (opcional)', imgRow));

    // Prompt sound
    box.append(soundEditor(q, 'pregunta', onEdit, [['none', 'Sin sonido'], ['voice', 'Voz automática'], ['file', 'Archivo de audio']], q.audioMode || 'voice'));

    // Answers
    const correctCount = q.options.filter((o) => o.correct).length;
    box.append(el('div', el('h3', 'Respuestas'), el('p.small.muted', 'Toca «✓ Correcta» en la respuesta buena. Puedes marcar hasta 2 (si hay 3 o más respuestas). Llevas ' + correctCount + ' marcada(s).')));
    const answers = el('div.answers');
    q.options.forEach((o, i) => answers.append(answerEditor(q, o, i, onEdit)));
    box.append(answers);
    const addRow = el('div.media-row');
    if (q.options.length < 6) addRow.append(el('button.btn.soft', { type: 'button', onclick: () => { q.options.push(S.newOption()); renderQuestion(); changed(); } }, '＋ Agregar respuesta'));
    addRow.append(el('span.small.muted', q.options.length + ' de 6 respuestas (mínimo 2)'));
    box.append(addRow);

    refreshProblem();
  }

  function soundEditor(item, what, onEdit, modes, current) {
    const wrap = el('div.field', what === 'pregunta' ? 'Sonido de la pregunta' : 'Sonido');
    const detail = el('div.sub');
    const draw = () => {
      detail.replaceChildren();
      const mode = item.audioMode || current;
      detail.hidden = mode === 'none';
      if (mode === 'voice') {
        const alt = el('input', { type: 'checkbox', checked: !!item.readTextEnabled });
        const altText = el('textarea', { rows: '2', placeholder: 'Lo que debe escuchar el estudiante…' });
        altText.value = item.readText || '';
        altText.hidden = !item.readTextEnabled;
        alt.addEventListener('change', () => { item.readTextEnabled = alt.checked; altText.hidden = !alt.checked; onEdit(); });
        altText.addEventListener('input', () => { item.readText = altText.value; onEdit(); });
        detail.append(
          el('label.check', alt, 'Leer en voz alta un texto diferente'),
          altText,
          el('button.btn.sm.ghost', { type: 'button', style: { justifySelf: 'start' }, onclick: () => {
            const t = item.readTextEnabled && item.readText ? item.readText : item.text;
            if (!String(t || '').trim()) { toast('Escribe primero el texto.', 'error'); return; }
            speak(t, quiz.config.lang, quiz.config.voiceGender);
          } }, '🔊 Escuchar'));
      } else if (mode === 'file') {
        const row = el('div.media-row');
        if (item.audio) row.append(el('audio', { controls: true, src: item.audio, preload: 'metadata', style: { maxWidth: '100%' } }));
        row.append(el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
          const f = await pickFile('audio/*'); if (!f) return;
          try { item.audio = await store(await audioFileToDataURL(f), 'audio'); draw(); onEdit(); } catch (e) { toast(e.message, 'error'); }
        } }, item.audio ? '🎵 Cambiar audio' : '🎵 Elegir archivo de audio'));
        if (item.audio) row.append(el('button.btn.sm.danger-ghost', { type: 'button', onclick: () => { stopSound(); item.audio = ''; draw(); onEdit(); } }, 'Quitar'));
        detail.append(row);
      }
    };
    wrap.append(segmented(modes, item.audioMode || current, (v) => { item.audioMode = v; draw(); onEdit(); }), detail);
    draw();
    return wrap;
  }

  function answerEditor(q, o, i, onEdit) {
    const letter = String.fromCharCode(65 + i);
    const card = el('div.answer' + (o.correct ? '.is-correct' : ''));
    const toggle = el('button.correct-toggle', { type: 'button', 'aria-pressed': String(!!o.correct) }, o.correct ? '✓ Correcta' : 'Marcar correcta');
    toggle.addEventListener('click', () => {
      if (!o.correct) {
        const n = q.options.filter((x) => x.correct).length;
        const max = q.options.length === 2 ? 1 : 2;
        if (n >= max) {
          if (max === 1) q.options.forEach((x) => { x.correct = false; });
          else { toast('Puedes marcar como máximo 2 respuestas correctas.', 'error'); return; }
        }
      }
      o.correct = !o.correct;
      renderQuestion(); changed();
    });
    const remove = el('button.icon-btn', { type: 'button', 'aria-label': 'Quitar respuesta ' + letter, title: 'Quitar respuesta', disabled: q.options.length <= 2, onclick: () => { q.options.splice(i, 1); renderQuestion(); changed(); } }, '✕');
    card.append(el('div.answer-head', el('span.answer-letter', { style: { background: LETTER_COLORS[i % 6] } }, letter), toggle, remove));

    const text = el('input', { type: 'text', placeholder: 'Texto o emoji (ej. 🐶)', value: o.text || '', 'aria-label': 'Texto de la respuesta ' + letter });
    text.addEventListener('input', () => { o.text = text.value; onEdit(); });
    card.append(text);

    const imgRow = el('div.media-row');
    const drawImg = () => {
      imgRow.replaceChildren();
      if (o.image) imgRow.append(el('img.thumb', { src: o.image, alt: '' }));
      imgRow.append(el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { o.image = await store(await imageFileToDataURL(f, 600, 0.8), 'images'); drawImg(); onEdit(); } catch (e) { toast(e.message, 'error'); }
      } }, o.image ? '🖼️ Cambiar' : '🖼️ Imagen'));
      if (o.image) imgRow.append(el('button.btn.sm.danger-ghost', { type: 'button', onclick: () => { o.image = ''; drawImg(); onEdit(); } }, 'Quitar'));
    };
    drawImg();
    card.append(imgRow);
    card.append(soundEditor(o, 'respuesta', onEdit, [['none', 'Sin sonido'], ['voice', 'Voz'], ['file', 'Archivo']], o.audioMode || 'none'));
    return card;
  }

  /* ---------- Question actions ---------- */
  function addQuestion() {
    const qs = quiz.config.questions;
    if (qs.length >= 50) return;
    // New questions copy the sound setting and answer count of the current one.
    const cur = qs[qIndex];
    const nq = S.newQuestion(cur ? cur.options.length : 4);
    if (cur) nq.audioMode = cur.audioMode || 'voice';
    qs.splice(qIndex + 1, 0, nq);
    qIndex++;
    renderQuestion(); changed();
    const t = $('#edQuestion textarea'); t && t.focus();
  }
  function duplicateQuestion() {
    const qs = quiz.config.questions;
    const copy = S.clone(qs[qIndex]);
    copy.id = S.uid('quiz');
    copy.options.forEach((o) => { o.id = S.uid('quiz'); });
    qs.splice(qIndex + 1, 0, copy);
    qIndex++;
    renderQuestion(); changed();
    toast('Copia creada: ahora estás en la pregunta ' + (qIndex + 1) + '. Cada copia se edita por separado.');
  }
  async function deleteQuestion() {
    const qs = quiz.config.questions;
    if (!(await confirmDialog('¿Eliminar la pregunta ' + (qIndex + 1) + '?', 'Se quitará de este quiz cuando pulses «Guardar».', 'Eliminar', true))) return;
    qs.splice(qIndex, 1);
    if (!qs.length) qs.push(S.newQuestion());
    qIndex = Math.min(qIndex, qs.length - 1);
    renderQuestion(); changed();
  }
  function moveQuestion(d) {
    const qs = quiz.config.questions, j = qIndex + d;
    if (j < 0 || j >= qs.length) return;
    [qs[qIndex], qs[j]] = [qs[j], qs[qIndex]];
    qIndex = j;
    renderQuestion(); changed();
    toast('La pregunta se movió al lugar ' + (j + 1) + '. Para ver otra pregunta usa «Anterior» / «Siguiente».');
  }

  /* ---------- Save / preview / leave ---------- */
  function save() {
    quiz.name = (quiz.name || '').trim();
    quiz.config.mode = 'practice'; // only one mode: a wrong answer always shows the right one
    if (!quiz.name) { toast('Escribe un nombre para el quiz.', 'error'); $('#edName').focus(); return false; }
    // A question that was never touched is simply dropped.
    const blank = (q) => !String(q.text || '').trim() && !q.image && !q.audio && !String(q.readText || '').trim() && q.options.every((o) => !String(o.text || '').trim() && !o.image && !o.audio && !o.correct);
    const qs = quiz.config.questions;
    if (qs.length > 1) quiz.config.questions = qs.filter((q) => !blank(q));
    if (!quiz.config.questions.length) quiz.config.questions = [S.newQuestion()];
    quiz.config.questions.forEach((q) => { q.correctCount = Math.max(1, q.options.filter((o) => o.correct).length); });

    const problems = quiz.config.questions.map((q, i) => ({ i, msg: S.questionProblem(q) })).filter((p) => p.msg);
    if (problems.length && quiz.config.visibility === 'visible') {
      qIndex = problems[0].i;
      renderAll();
      toast('Para que los estudiantes lo vean, completa la pregunta ' + (problems[0].i + 1) + ': ' + problems[0].msg, 'error');
      return false;
    }
    let id = S.saveQuiz(quiz, { quiet: true });
    if (!id) {
      // Browser storage full: drop the draft copy (this quiz is still open here) and try again.
      S.clearDraft();
      S.freeSpace();
      id = S.saveQuiz(quiz, { quiet: true });
    }
    if (!id) {
      if (LL.cloud.signedIn()) { saveViaCloud(); return false; }
      toast('El almacenamiento de este navegador está lleno. Quita algunas imágenes o audios, o entra con tu cuenta para guardarlos en la nube.', 'error');
      return false;
    }
    quiz.id = id;
    snapshot = JSON.stringify(quiz);
    S.clearDraft();
    renderAll();
    if (problems.length) toast('Guardado como «En preparación». Faltan ' + problems.length + ' pregunta(s) por completar.', 'success');
    else toast(quiz.config.visibility === 'visible' ? '✓ Guardado. Los estudiantes ya pueden verlo.' : '✓ Guardado (en preparación).', 'success');
    prepareVoices(id);
    return true;
  }

  /** Storage still full: upload this quiz's pictures/audio first (so the device copy only keeps
   *  short references), then save again. */
  async function saveViaCloud() {
    const st = $('#edState');
    if (st) st.textContent = '☁️ Subiendo imágenes y audios para liberar espacio…';
    try {
      await LL.sync.uploadMedia(quiz);
      S.clearDraft();
      if (save()) toast('✓ Guardado. Las imágenes y audios quedaron en la nube.', 'success');
    } catch (e) {
      toast('No se pudo guardar: ' + LL.auth.friendly(e) + '. No cierres esta página e inténtalo de nuevo.', 'error');
      changed();
    }
  }

  /** Copy ElevenLabs file info from `source` into `target`, matching questions/answers by id and text. */
  function applyTts(target, source) {
    const map = new Map();
    for (const q of source.questions || []) for (const it of [q, ...(q.options || [])]) if (it.tts) map.set(it.id, it.tts);
    for (const q of target.questions || []) for (const it of [q, ...(q.options || [])]) {
      const t = map.get(it.id);
      if (t && LL.tts.speechText(it) === t.text) it.tts = t;
    }
  }

  /** After saving: make natural-voice audio for new or changed text (runs in the background). */
  async function prepareVoices(id) {
    if (!LL.tts || !LL.tts.active()) return;
    const stored = S.getQuiz(id);
    if (!stored) return;
    const work = { ...stored, config: S.clone(stored.config) };
    const st = () => (quiz && quiz.id === id ? $('#edState') : null);
    const r = await LL.tts.prepareQuiz(work, (i, n) => { const s = st(); if (s) s.textContent = '🗣️ Preparando voces naturales… ' + i + ' de ' + n; });
    if (r.made) {
      const latest = S.getQuiz(id);
      if (latest) { applyTts(latest.config, work.config); S.saveQuiz({ id, name: latest.name, folderId: latest.folderId, config: latest.config }); }
      if (quiz && quiz.id === id) { const wasClean = !isDirty(); applyTts(quiz.config, work.config); if (wasClean) snapshot = JSON.stringify(quiz); }
      toast('🗣️ Voz natural lista para ' + r.made + (r.made === 1 ? ' texto.' : ' textos.'), 'success');
    }
    if (quiz && quiz.id === id) changed();
  }

  function preview() {
    LL.player.open({ name: quiz.name || 'Vista previa', config: S.clone(quiz.config) }, { preview: true, startIndex: qIndex, onClose: () => {} });
  }

  async function canLeave() {
    if (!isDirty()) return true;
    const v = await dialog({
      title: '¿Guardar los cambios?',
      body: 'Este quiz tiene cambios sin guardar.',
      actions: [{ label: 'Seguir editando', kind: 'ghost', value: 'stay' }, { label: 'Salir sin guardar', kind: 'danger-ghost', value: 'discard' }, { label: 'Guardar y salir', kind: 'primary', value: 'save' }],
    });
    if (v === 'save') return save();
    if (v === 'discard') { S.clearDraft(); quiz = null; snapshot = ''; return true; }
    return false;
  }

  window.addEventListener('beforeunload', (e) => {
    if (LL.app && LL.app.state.screen === 'editor' && isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  LL.editor = { open, canLeave, currentId: () => (quiz ? quiz.id || 'nuevo' : null) };
})();
