/* Editor for «Anagrama» (activity type 'anagram', V127), like Wordwall's «Anagram» editor:
 * «Sin pistas» / «Con pistas» for the whole activity, then a numbered list of words or phrases.
 * With clues, each word can have a clue text, a picture and a sound (audio file). Each word is stored
 * as a quiz "question" without answers (see store.js), so saving, pictures, voices and sync are
 * shared with the other activity types. */
window.LL = window.LL || {};
(function () {
  const { el, toast, imageFileToDataURL, audioFileToDataURL, pickFile, speak, playAudio, stopSound } = LL.ui;
  const S = LL.store;
  const MAX_ITEMS = 100;
  let refreshFn = null;
  let recording = null; // { q, rec, limit } while the microphone records a clue

  /** Keep the stored sound settings in step with the clue: a sound file plays it; otherwise the
   *  voice reads the clue text; nothing when there is neither. */
  function syncClue(q) {
    const t = S.anagramClueText(q);
    q.readTextEnabled = !!t;
    q.audioMode = q.audio ? 'file' : t ? 'voice' : 'none';
  }

  /** container: element to fill. api: { changed(), store(dataUrl, folder) → Promise<ref> } */
  function render(container, quiz, api) {
    const c = quiz.config;
    const set = S.anagramSettingsOf(c);
    const items = c.questions;
    container.replaceChildren();

    const status = el('div');
    const refreshStatus = () => {
      const msg = S.anagramProblem(c);
      const n = items.filter((q) => String(q.text || '').trim()).length;
      status.className = msg ? 'problem-box' : 'ok-box';
      status.textContent = msg ? '⚠️ ' + msg : '✓ Lista: ' + n + (n === 1 ? ' palabra o frase.' : ' palabras o frases.');
    };
    const changed = () => { refreshStatus(); api.changed(); };
    refreshFn = () => { if (status.isConnected) refreshStatus(); };

    // «Sin pistas» / «Con pistas» (whole activity).
    const clueChoice = el('div.an-clue-choice', { role: 'radiogroup', 'aria-label': 'Pistas' });
    const drawChoice = () => {
      clueChoice.replaceChildren(...[[false, '🚫 Sin pistas', 'Solo las letras.'], [true, '💡 Con pistas', 'Cada palabra lleva una pista: texto, sonido 🎤 y/o imagen 🖼️.']].map(([v, name, desc]) =>
        el('button.tp-mode', { type: 'button', role: 'radio', 'aria-checked': String(set.clues === v), onclick: () => { set.clues = v; drawChoice(); drawItems(); changed(); } },
          el('span.tp-mode-name', name), el('span.tp-mode-desc', desc))));
    };

    const list = el('ol.an-items');
    const head = el('div.an-head');
    const drawHead = () => {
      head.replaceChildren(...[el('span'), el('span.an-col', 'Palabra'),
        set.clues ? el('span.an-col', 'Pista') : null,
        set.clues ? el('button.btn.sm.ghost.an-swap', { type: 'button', title: 'Pasa cada palabra a la pista y cada pista a la palabra', onclick: () => {
          items.forEach((q) => { const w = q.text || ''; q.text = q.readText || ''; q.readText = w; syncClue(q); delete q.tts; });
          drawItems(); changed();
        } }, '⇄ Intercambiar columnas') : null].filter(Boolean));
      head.classList.toggle('with-clues', set.clues);
    };
    const count = el('span.small.muted');
    const drawItems = () => {
      list.classList.toggle('with-clues', set.clues);
      drawHead();
      list.replaceChildren(...items.map((q, i) => itemRow(q, i)));
      addItem.disabled = items.length >= MAX_ITEMS;
      count.textContent = items.length + ' / ' + MAX_ITEMS;
      refreshStatus();
    };

    function itemRow(q, i) {
      const n = i + 1;
      const text = el('input.an-word-input', { type: 'text', maxlength: '60', placeholder: 'Palabra o frase', value: q.text || '', 'aria-label': 'Palabra o frase ' + n, autocomplete: 'off', spellcheck: 'false' });
      const warn = el('span.tp-item-warn');
      const check = () => {
        const letters = [...String(text.value || '').replace(/\s+/g, '')].length;
        warn.textContent = letters > S.ANAGRAM_MAX ? '⚠️ Máximo ' + S.ANAGRAM_MAX + ' letras (tiene ' + letters + ').' : letters === 1 ? '⚠️ Necesita al menos 2 letras.' : '';
        row.classList.toggle('blank', !String(text.value).trim());
      };
      text.addEventListener('input', () => { q.text = text.value; delete q.tts; check(); changed(); });
      const mv = (d) => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; drawItems(); changed(); };

      // Clue column (like Wordwall): the clue text, with 🎤 (record its sound) and 🖼️ (its picture) inside.
      let clueCell = null;
      if (set.clues) {
        const clueText = el('input.an-clue-input', { type: 'text', maxlength: '120', placeholder: 'Pista', value: q.readText || '', 'aria-label': 'Pista de la palabra ' + n });
        clueText.addEventListener('input', () => { q.readText = clueText.value; syncClue(q); delete q.tts; changed(); });
        const tools = el('span.an-clue-tools');
        const drawTools = () => {
          const mic = el('button.an-in-btn' + (recording && recording.q === q ? '.rec' : ''), { type: 'button',
            title: recording && recording.q === q ? 'Detener la grabación' : q.audio ? 'Grabar otra vez el sonido de la pista' : 'Grabar el sonido de la pista (micrófono)',
            'aria-label': (recording && recording.q === q ? 'Detener la grabación de la pista ' : 'Grabar el sonido de la pista ') + n,
            onclick: () => toggleRecord(q, drawTools) }, recording && recording.q === q ? '⏹️' : '🎤');
          const pic = el('button.an-in-btn.pic', { type: 'button', title: q.image ? 'Cambiar la imagen de la pista' : 'Elegir una imagen para la pista', 'aria-label': (q.image ? 'Cambiar la imagen de la pista ' : 'Elegir una imagen para la pista ') + n },
            q.image ? el('img', { src: q.image, alt: '' }) : '🖼️');
          pic.addEventListener('click', async () => {
            const f = await pickFile('image/*'); if (!f) return;
            try { q.image = await api.store(await imageFileToDataURL(f, 800, 0.8), 'images'); drawTools(); changed(); } catch (e) { toast(e.message, 'error'); }
          });
          tools.replaceChildren(...[
            q.audio ? el('button.an-in-btn', { type: 'button', title: 'Escuchar el sonido', 'aria-label': 'Escuchar el sonido de la pista ' + n, onclick: () => playAudio(q.audio) }, '▶️') : null,
            q.audio ? el('button.an-in-btn.x', { type: 'button', title: 'Quitar el sonido', 'aria-label': 'Quitar el sonido de la pista ' + n, onclick: () => { stopSound(); q.audio = ''; syncClue(q); drawTools(); changed(); } }, '✕') : null,
            mic, pic,
            q.image ? el('button.an-in-btn.x', { type: 'button', title: 'Quitar la imagen', 'aria-label': 'Quitar la imagen de la pista ' + n, onclick: () => { q.image = ''; drawTools(); changed(); } }, '✕') : null,
          ].filter(Boolean));
        };
        drawTools();
        clueCell = el('div.an-cell.an-clue-cell', clueText, tools);
      }

      const row = el('li.an-item',
        el('span.an-num', n + '.'),
        el('div.an-cells', el('div.an-cell', text), clueCell),
        el('div.an-row-tools',
          el('button.icon-btn', { type: 'button', 'aria-label': 'Escuchar la palabra ' + n, title: 'Escuchar la palabra', onclick: () => { if (String(q.text || '').trim()) speak(q.text, c.lang, c.voiceGender); else toast('Escribe la palabra para que se pueda escuchar.'); } }, '🔊'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Subir la palabra ' + n, title: 'Subir', disabled: i === 0, onclick: () => mv(-1) }, '↑'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Bajar la palabra ' + n, title: 'Bajar', disabled: i === items.length - 1, onclick: () => mv(1) }, '↓'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Duplicar la palabra ' + n, title: 'Duplicar', disabled: items.length >= MAX_ITEMS, onclick: () => { const copy = { ...S.clone(q), id: S.newAnagramItem().id }; delete copy.tts; items.splice(i + 1, 0, copy); drawItems(); changed(); } }, '⧉'),
          el('button.icon-btn.danger', { type: 'button', 'aria-label': 'Eliminar la palabra ' + n, title: 'Eliminar', disabled: items.length <= 1, onclick: () => { items.splice(i, 1); drawItems(); changed(); } }, '🗑️')),
        warn);
      check();
      return row;
    }

    /** 🎤: record the clue's sound with the microphone; a second tap stops and keeps it. */
    async function toggleRecord(q, redraw) {
      if (recording) {
        const r = recording;
        if (r.q !== q) { toast('Primero detén la otra grabación.'); return; }
        r.rec.stop();
        return;
      }
      if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Este navegador no puede grabar. Prueba en Chrome.', 'error'); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { toast('No se pudo usar el micrófono. Revisa el permiso del navegador.', 'error'); return; }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
      const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      const chunks = [];
      recording = { q, rec };
      rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data); });
      rec.addEventListener('stop', async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimeout(recording && recording.limit);
        recording = null;
        const mime = String(rec.mimeType || type || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) {
          try { q.audio = await api.store(await audioFileToDataURL(new File([blob], 'pista.' + (mime.split('/')[1] || 'webm'), { type: mime })), 'audio'); syncClue(q); changed(); toast('🎤 Sonido grabado.', 'success'); }
          catch (e) { toast(e.message, 'error'); }
        }
        redraw();
      });
      rec.start();
      recording.limit = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 30000); // 30 s at most
      toast('🎤 Grabando… toca ⏹️ para terminar.');
      redraw();
    }

    const addItem = el('button.btn.soft', { type: 'button', onclick: () => {
      if (items.length >= MAX_ITEMS) return;
      items.push(S.newAnagramItem()); drawItems(); changed();
      const rows = list.querySelectorAll('.an-word-input'); rows[rows.length - 1] && rows[rows.length - 1].focus();
    } }, '＋ Agregar palabra');

    drawChoice();
    container.append(
      el('div.sort-editor-head', el('h2', '🔤 Palabras y frases')),
      el('p.small.muted', 'El niño forma cada palabra o frase arrastrando sus letras revueltas a las casillas. Si pone una letra en la casilla equivocada, la letra regresa a su lugar. Los espacios de una frase se ven como separación. Al terminar, la voz dice la palabra.'),
      clueChoice, status, head, list,
      el('div.sort-editor-foot', addItem, el('span.small.muted', 'mín. 1 · máx. ' + MAX_ITEMS), count));
    drawItems();
  }

  /** Shown in the editor's ⚙️ Ajustes panel. */
  function settingsFields() {
    return [
      el('p.type-tag', '🔤 Anagrama'),
      el('div.field', 'Puntos', el('span.hint', 'Por palabra: sin errores 1 · 1–2 errores 0.75 · 3–4 errores 0.5 · 5–6 errores 0.25 · más de 6 errores 0. Un error es soltar una letra en una casilla que no es la suya.')),
    ];
  }

  LL.anagramEditor = { render, settingsFields, syncClue, refresh: () => refreshFn && refreshFn() };
})();
