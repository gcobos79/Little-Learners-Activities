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

  const isSort = () => !!quiz && quiz.type === 'sort';
  const isTyping = () => !!quiz && quiz.type === 'typing'; // «Pantalla de Tablet» (V127)
  /** Activities that aren't a classic quiz say «actividad» (feminine) instead of «quiz». */
  const isActivityWord = () => isSort() || isTyping();
  const draftKey = () => quiz.id || (isSort() ? 'new-sort' : isTyping() ? 'new-typing' : 'new');

  /** kind (new activities only): 'quiz' or 'sort' («Clasificación rápida»). */
  async function open(id, folderId, kind) {
    if (id) {
      const q = S.getQuiz(id);
      if (!q) { toast('No se encontró esa actividad.', 'error'); return; }
      quiz = { id: q.id, type: S.typeOf(q.type), name: q.name, folderId: q.folderId || null, config: S.clone(q.config) };
      if (!Array.isArray(quiz.config.questions)) quiz.config.questions = [];
      quiz.config = { lang: 'es', voiceGender: 'female', mode: 'practice', questionOrder: 'fixed', answerOrder: 'fixed', visibility: 'hidden', coverImage: '', ...quiz.config };
      if (quiz.type === 'sort') quiz.config.sort = S.sortSettings(quiz.config);
      if (quiz.type === 'typing') quiz.config.typing = S.typingSettings(quiz.config);
    } else {
      quiz = kind === 'sort' ? S.newSort(folderId) : kind === 'typing' ? S.newTyping(folderId) : S.newQuiz(folderId);
    }
    snapshot = JSON.stringify(quiz);
    qIndex = 0;

    const draft = S.readDraft();
    if (draft && draft.quizId === draftKey() && draft.quiz && JSON.stringify(draft.quiz) !== snapshot) {
      const when = draft.at ? new Date(draft.at).toLocaleString('es-US') : '';
      if (await confirmDialog('¿Recuperar cambios sin guardar?', 'Encontramos cambios de esta actividad que no se guardaron' + (when ? ' (' + when + ')' : '') + '. ¿Quieres recuperarlos?', 'Recuperar')) {
        quiz = draft.quiz;
      } else S.clearDraft();
    }
    if (isSort()) { while (quiz.config.questions.length < 2) quiz.config.questions.push(S.newSortGroup()); }
    else if (isTyping()) { if (!quiz.config.questions.length) quiz.config.questions.push(S.newTypingItem()); }
    else if (!quiz.config.questions.length) quiz.config.questions.push(S.newQuestion());
    await LL.app.go('editor');
    renderAll();
    if (!id) setTimeout(() => $('#edName') && $('#edName').focus(), 50);
  }

  function changed() {
    if (isTyping() && LL.typingEditor) LL.typingEditor.refresh(); // mode / language change what is valid
    if (isDirty()) S.writeDraft({ quizId: draftKey(), quiz, at: new Date().toISOString() });
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
    const name = el('input.name-input#edName', { type: 'text', maxlength: '90', placeholder: isSort() ? 'Nombre de la actividad (ej. Clasificar A, F, K, P)' : isTyping() ? 'Nombre de la actividad (ej. Escribo saludos)' : 'Nombre del quiz (ej. Animales)', value: quiz.name, 'aria-label': isActivityWord() ? 'Nombre de la actividad' : 'Nombre del quiz' });
    name.addEventListener('input', () => { quiz.name = name.value; changed(); });

    r.append(el('div.editor-top',
      el('button.btn.ghost', { type: 'button', onclick: () => LL.app.go('library') }, '⬅️ Mis actividades'),
      name,
      el('button.btn.soft', { type: 'button', onclick: preview }, '▶️ Probar'),
      el('button.btn.primary', { type: 'button', onclick: save }, '💾 Guardar')));
    r.append(el('p.small#edState', { style: { margin: '-8px 0 12px', fontWeight: '800' } }));
    r.append(instructionsField());

    if (isTyping()) {
      const main = el('div.panel.sort-editor.tp-editor#edTyping');
      r.append(el('div.editor-layout.sort-layout', el('aside.editor-side', settingsPanel()), main));
      LL.typingEditor.render(main, quiz, { changed, store });
      changed();
      return;
    }
    if (isSort()) {
      const main = el('div.panel.sort-editor#edSort');
      r.append(el('div.editor-layout.sort-layout', el('aside.editor-side', settingsPanel()), main));
      LL.sortEditor.render(main, quiz, { changed, store });
      changed();
      return;
    }
    const side = el('aside.editor-side', settingsPanel(), el('div.panel', { style: { display: 'grid', gap: '10px' } },
      el('h3#edQCount'),
      el('div.q-list#edQList'),
      el('button.btn.soft#edAddQ', { type: 'button', onclick: addQuestion }, '＋ Nueva pregunta')));
    r.append(el('div.editor-layout', side, el('div.panel.q-editor#edQuestion')));
    renderQuestion();
    changed();
  }

  /** Header: the activity's instructions, read by the 📢 button in the activity. */
  function instructionsField() {
    const c = quiz.config;
    if (!c.instructions && c.sort && c.sort.instruction) c.instructions = c.sort.instruction; // early V126 sort activities
    if (c.sort) delete c.sort.instruction;
    const box = el('textarea', { rows: '2', maxlength: '300', placeholder: isSort() ? 'Ej. Escucha el nombre de cada dibujo y llévalo a la letra con la que empieza.' : isTyping() ? 'Ej. Copia la palabra con el teclado. Al terminar, toca Enter.' : 'Ej. Escucha la pregunta y toca la respuesta correcta.', 'aria-label': 'Instrucciones de la actividad' });
    box.value = c.instructions || '';
    box.addEventListener('input', () => { c.instructions = box.value; changed(); });
    const test = el('button.btn.sm.ghost', { type: 'button', onclick: () => { if (box.value.trim()) speak(box.value, c.lang, c.voiceGender); else { toast('Escribe primero las instrucciones.'); box.focus(); } } }, '🔊 Escuchar');
    return el('div.panel.instructions-field',
      el('div.instructions-head', el('label', { htmlFor: 'edInstructions' }, '📢 Instrucciones de la actividad'), test),
      Object.assign(box, { id: 'edInstructions' }),
      el('span.hint', 'Opcional. Explica a los niños de qué se trata la actividad. En la actividad se leen solas al empezar, y el botón 📢 de arriba las repite.'));
  }

  function settingsPanel() {
    const c = quiz.config;
    const p = el('div.panel.settings-grid');
    p.append(el('h3', '⚙️ Ajustes'));

    const vis = el('input', { type: 'checkbox', checked: c.visibility === 'visible' });
    vis.addEventListener('change', () => { c.visibility = vis.checked ? 'visible' : 'hidden'; changed(); });
    p.append(el('div.field', el('label.switch', vis, 'Visible para estudiantes'), el('span.hint', 'Déjalo apagado mientras lo preparas. Los estudiantes solo ven las actividades visibles.')));
    // V127: guests (people without an account) can try only the activities shared with them.
    const share = el('input', { type: 'checkbox', checked: !!c.sharedGuest });
    share.addEventListener('change', () => { c.sharedGuest = share.checked; changed(); });
    p.append(el('div.field.share-guest', el('label.switch', share, '👋 Compartir con invitados'),
      el('span.hint', 'Quien entra como invitado (sin cuenta) puede hacer esta actividad. No ve estudiantes ni resultados, y no se guarda nada. Solo aparece si también está visible.')));
    if (isSort()) p.append(el('p.type-tag', '🧺 Clasificación rápida'));
    if (isTyping()) p.append(...LL.typingEditor.settingsFields(quiz, { changed }));

    const voiceNote = el('span.hint.voice-note', { 'aria-live': 'polite' });
    const drawVoiceNote = () => {
      const g = c.voiceGender === 'male' ? 'male' : 'female';
      if (LL.tts && LL.tts.active()) { voiceNote.textContent = '✨ Se usa la voz natural (ElevenLabs) de ' + (g === 'male' ? 'hombre' : 'mujer') + ', igual en todos los aparatos.'; return; }
      const plan = LL.ui.voicePlan(c.lang, g);
      if (!plan.voice) { voiceNote.textContent = 'Este aparato no tiene voces; se escuchará en otros aparatos.'; return; }
      const name = plan.voice.name.replace(/^Microsoft /, '').replace(/ - .*$/, '');
      const lang = c.lang === 'en' ? 'inglés' : 'español';
      voiceNote.textContent = plan.exact
        ? '🔊 En este aparato: ' + name + '.'
        : '⚠️ Este aparato no tiene voz de ' + (g === 'male' ? 'hombre' : 'mujer') + ' en ' + lang + '. Se usará «' + name + '» con tono ' + (g === 'male' ? 'más grave' : 'más agudo') + '. Para una voz igual en todos los aparatos, activa la voz natural (Ajustes → Voz natural).';
    };
    drawVoiceNote();
    try { speechSynthesis.addEventListener('voiceschanged', () => { if (voiceNote.isConnected) drawVoiceNote(); }); } catch { /* no voices */ }
    p.append(el('div.field', 'Idioma de la voz', segmented([['es', 'Español'], ['en', 'English']], c.lang, (v) => { c.lang = v; drawVoiceNote(); changed(); })));
    p.append(el('div.field', 'Tipo de voz', segmented([['female', '👩 Mujer'], ['male', '👨 Hombre']], c.voiceGender || 'female', (v) => { c.voiceGender = v; drawVoiceNote(); changed(); speak(c.lang === 'en' ? 'Hello! This is the voice.' : '¡Hola! Así suena la voz.', c.lang, v); }),
      voiceNote));

    if (isSort()) p.append(...LL.sortEditor.settingsFields(quiz, { changed }, segmented));
    const qr = el('input', { type: 'checkbox', checked: c.questionOrder === 'random' });
    qr.addEventListener('change', () => { c.questionOrder = qr.checked ? 'random' : 'fixed'; changed(); });
    const ar = el('input', { type: 'checkbox', checked: c.answerOrder === 'random' });
    ar.addEventListener('change', () => { c.answerOrder = ar.checked ? 'random' : 'fixed'; changed(); });
    if (isTyping()) p.append(el('div.field', 'Orden', el('label.switch', qr, 'Mezclar palabras')));
    else if (!isSort()) p.append(el('div.field', 'Orden', el('label.switch', qr, 'Mezclar preguntas'), el('label.switch', ar, 'Mezclar respuestas')));
    // V127: one choice for the whole quiz: does tapping a question's picture play its sound?
    if (!isActivityWord()) {
      const is = el('input', { type: 'checkbox', checked: S.imageSpeaksOf(c) });
      is.addEventListener('change', () => { c.imageSpeaks = is.checked; changed(); });
      p.append(el('div.field.image-speaks', 'Imagen de las preguntas',
        el('label.switch', is, '🔊 Al tocar la imagen, sonar la voz'),
        el('p.small.muted', 'Vale para todas las preguntas de esta actividad. Suena lo que tenga cada pregunta (la pregunta, el texto de «Leer en voz alta» o el archivo de audio). Sin marcar, las imágenes no hacen nada al tocarlas.')));
    }

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
      list.append(el('button.q-item' + (bad ? '.problem' : ''), { type: 'button', 'data-i': String(i), 'aria-current': String(i === qIndex), title: bad ? S.questionProblem(q) : 'Arrastra para cambiar el orden', onclick: () => { if (dragJustEnded) return; qIndex = i; renderQuestion(); renderQList(); } },
        el('span.num', String(i + 1)), el('span.txt', questionLabel(q)), el('span.grip', { 'aria-hidden': 'true', title: 'Arrastra para cambiar el orden' }, '⠿')));
    });
    if (!list.dataset.drag) { list.dataset.drag = '1'; enableQuestionDrag(list); }
  }

  /* ---------- Drag a question in the list to change the order ----------
   * Mouse: press anywhere on a question and move. Touch: drag the ⠿ handle
   * (or press and hold a question), so the list can still be scrolled with a finger. */
  let dragJustEnded = false;
  function enableQuestionDrag(list) {
    let d = null;
    const horizontal = () => getComputedStyle(list).gridAutoFlow.includes('column');
    const items = () => [...list.querySelectorAll('.q-item')];

    function begin() {
      d.on = true;
      const r = d.item.getBoundingClientRect();
      d.dx = d.x - r.left; d.dy = d.y - r.top;
      d.ghost = d.item.cloneNode(true);
      d.ghost.classList.add('q-ghost');
      Object.assign(d.ghost.style, { width: r.width + 'px', height: r.height + 'px' });
      document.body.append(d.ghost);
      d.item.classList.add('dragging');
      list.classList.add('sorting');
      document.body.classList.add('q-sorting');
      d.timer = setInterval(autoScroll, 30);
      if (navigator.vibrate && d.touch) try { navigator.vibrate(15); } catch { /* ignore */ }
      move();
    }
    function move() {
      d.ghost.style.transform = 'translate(' + (d.x - d.dx) + 'px,' + (d.y - d.dy) + 'px) rotate(-1.5deg)';
      const hz = horizontal();
      const all = items();
      let target = all.length;
      for (let i = 0; i < all.length; i++) {
        const r = all[i].getBoundingClientRect();
        if ((hz ? d.x < r.left + r.width / 2 : d.y < r.top + r.height / 2)) { target = i; break; }
      }
      d.target = target;
      // Show where it will land: a line before the target question (or after the last one).
      list.classList.toggle('h', hz);
      all.forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      if (target < all.length) all[target].classList.add('drop-before'); else all[all.length - 1].classList.add('drop-after');
    }
    function autoScroll() {
      if (!d || !d.on) return;
      const edge = 48, step = 14;
      if (horizontal()) {
        const r = list.getBoundingClientRect();
        if (d.x < r.left + edge) list.scrollLeft -= step; else if (d.x > r.right - edge) list.scrollLeft += step; else return;
      } else {
        const side = list.closest('.editor-side');
        const sr = side && side.scrollHeight > side.clientHeight ? side.getBoundingClientRect() : null;
        if (sr && d.y < sr.top + edge && side.scrollTop > 0) side.scrollTop -= step;
        else if (sr && d.y > sr.bottom - edge && side.scrollTop < side.scrollHeight - side.clientHeight) side.scrollTop += step;
        else if (d.y < edge + 70) window.scrollBy(0, -step);
        else if (d.y > window.innerHeight - edge) window.scrollBy(0, step);
        else return;
      }
      move();
    }
    function end(commit) {
      if (!d) return;
      const s = d; d = null;
      clearTimeout(s.hold);
      if (!s.on) return;
      clearInterval(s.timer);
      s.ghost.remove();
      items().forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      s.item.classList.remove('dragging');
      list.classList.remove('sorting');
      document.body.classList.remove('q-sorting');
      dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 0);
      if (!commit) return;
      const from = s.from;
      const to = s.target > from ? s.target - 1 : s.target;
      if (to === from) return;
      const qs = quiz.config.questions;
      const [moved] = qs.splice(from, 1);
      qs.splice(to, 0, moved);
      qIndex = to; // show the question that was moved
      renderQuestion(); changed();
      toast('La pregunta ' + (from + 1) + ' ahora es la ' + (to + 1) + '.');
    }

    list.addEventListener('pointerdown', (e) => {
      const item = e.target.closest('.q-item');
      if (!item || e.button > 0 || quiz.config.questions.length < 2) return;
      const touch = e.pointerType !== 'mouse';
      const onGrip = !!e.target.closest('.grip');
      d = { item, from: Number(item.dataset.i), x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false, id: e.pointerId, touch, grip: onGrip };
      if (touch && onGrip) { e.preventDefault(); begin(); }
      else if (touch) d.hold = setTimeout(() => { if (d && !d.on) begin(); }, 450); // press and hold
    });
    window.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      d.x = e.clientX; d.y = e.clientY;
      if (!d.on) {
        const far = Math.hypot(d.x - d.sx, d.y - d.sy) > 8;
        if (d.touch) { if (far) { clearTimeout(d.hold); d = null; } return; } // finger is scrolling
        if (far) begin();
        return;
      }
      e.preventDefault();
      move();
    }, { passive: false });
    // While dragging with a finger, stop the page from scrolling.
    window.addEventListener('touchmove', (e) => { if (d && d.on) e.preventDefault(); }, { passive: false });
    window.addEventListener('pointerup', (e) => { if (d && e.pointerId === d.id) end(true); });
    window.addEventListener('pointercancel', (e) => { if (d && e.pointerId === d.id) end(false); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d && d.on) end(false); });
    list.addEventListener('contextmenu', (e) => { if (d) e.preventDefault(); });
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
    if (!quiz.name) { toast(isActivityWord() ? 'Escribe un nombre para la actividad.' : 'Escribe un nombre para el quiz.', 'error'); $('#edName').focus(); return false; }
    if (isSort()) return saveSort();
    if (isTyping()) return saveTyping();
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

  /** «Clasificación rápida»: empty cards are dropped; it can be visible only when playable. */
  function saveSort() {
    const c = quiz.config;
    S.sortSettingsOf(c);
    for (const g of c.questions) {
      const filled = g.options.filter(S.itemFilled);
      g.options = filled.length ? filled : g.options.slice(0, 1);
      g.options.forEach((o) => { o.correct = true; o.audioMode = 'voice'; });
      g.audioMode = 'voice';
      g.correctCount = 1;
    }
    const problem = S.sortProblem(c);
    if (problem && c.visibility === 'visible') {
      renderAll();
      toast('Para que los estudiantes la vean: ' + problem, 'error');
      return false;
    }
    return writeAndRefresh(problem ? 'Guardada como «En preparación». ' + problem : (c.visibility === 'visible' ? '✓ Guardada. Los estudiantes ya pueden verla.' : '✓ Guardada (en preparación).'));
  }

  /** «Pantalla de Tablet»: empty rows are dropped; it can be visible only when playable. */
  function saveTyping() {
    const c = quiz.config;
    S.typingSettingsOf(c);
    c.answerOrder = 'fixed';
    const filled = c.questions.filter((q) => String(q.text || '').trim() || q.image);
    c.questions = filled.length ? filled : [S.newTypingItem()];
    c.questions.forEach((q) => {
      q.text = LL.typingGame.normalize(q.text);
      q.options = []; q.correctCount = 1;
      if (q.audioMode !== 'file') q.audioMode = 'voice';
    });
    const problem = S.typingProblem(c);
    if (problem && c.visibility === 'visible') {
      renderAll();
      toast('Para que los estudiantes la vean: ' + problem, 'error');
      return false;
    }
    return writeAndRefresh(problem ? 'Guardada como «En preparación». ' + problem : (c.visibility === 'visible' ? '✓ Guardada. Los estudiantes ya pueden verla.' : '✓ Guardada (en preparación).'));
  }

  /** Write to the browser (freeing space if needed), then refresh the editor. */
  function writeAndRefresh(okMessage) {
    let id = S.saveQuiz(quiz, { quiet: true });
    if (!id) { S.clearDraft(); S.freeSpace(); id = S.saveQuiz(quiz, { quiet: true }); }
    if (!id) {
      if (LL.cloud.signedIn()) { saveViaCloud(); return false; }
      toast('El almacenamiento de este navegador está lleno. Quita algunas imágenes, o entra con tu cuenta para guardarlas en la nube.', 'error');
      return false;
    }
    quiz.id = id;
    snapshot = JSON.stringify(quiz);
    S.clearDraft();
    renderAll();
    toast(okMessage, 'success');
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
      if (latest) { applyTts(latest.config, work.config); S.saveQuiz({ id, type: latest.type, name: latest.name, folderId: latest.folderId, config: latest.config }); }
      if (quiz && quiz.id === id) { const wasClean = !isDirty(); applyTts(quiz.config, work.config); if (wasClean) snapshot = JSON.stringify(quiz); }
      toast('🗣️ Voz natural lista para ' + r.made + (r.made === 1 ? ' texto.' : ' textos.'), 'success');
    }
    if (quiz && quiz.id === id) changed();
  }

  function preview() {
    LL.player.open({ type: quiz.type || 'quiz', name: quiz.name || 'Vista previa', config: S.clone(quiz.config) }, { preview: true, startIndex: qIndex, onClose: () => {} });
  }

  async function canLeave() {
    if (!isDirty()) return true;
    const v = await dialog({
      title: '¿Guardar los cambios?',
      body: isActivityWord() ? 'Esta actividad tiene cambios sin guardar.' : 'Este quiz tiene cambios sin guardar.',
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
