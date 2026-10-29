/* Editor for «Pantalla de Tablet» (activity type 'typing', V127).
 * A numbered list of words or phrases, each with an optional picture (needed in Mode 3). Each word is
 * stored as a quiz "question" without answers (see store.js), so saving, pictures, voices and sync are
 * shared with quizzes. The mode (1, 2 or 3) is one choice for the whole activity. */
window.LL = window.LL || {};
(function () {
  const { el, toast, imageFileToDataURL, pickFile, speak } = LL.ui;
  const S = LL.store;
  const MAX_ITEMS = 30;
  const MODES = [
    [1, '🟨 Modo 1', 'Se marca la letra que toca escribir.'],
    [2, '⬜ Modo 2', 'Se ve la palabra, sin marcar la letra.'],
    [3, '🖼️ Modo 3', 'Solo la imagen: al tocarla se oye la palabra y el niño la escribe de memoria.'],
  ];

  function pickFiles(accept) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
      input.addEventListener('change', () => { resolve([...(input.files || [])]); input.remove(); });
      document.body.append(input);
      input.click();
    });
  }
  /** "gato.png" → "gato"; "02_casa-roja.jpg" → "casa roja". */
  let refreshFn = null;
  const wordFromFile = (name) => String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/^[\d\s._-]+/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60);

  /** container: element to fill. api: { changed(), store(dataUrl, folder) → Promise<ref> } */
  function render(container, quiz, api) {
    const c = quiz.config;
    const items = c.questions;
    container.replaceChildren();

    const status = el('div');
    const refreshStatus = () => {
      const msg = S.typingProblem(c);
      const n = items.filter((q) => String(q.text || '').trim()).length;
      status.className = msg ? 'problem-box' : 'ok-box';
      status.textContent = msg ? '⚠️ ' + msg : '✓ Lista: ' + n + (n === 1 ? ' palabra o frase.' : ' palabras o frases.');
    };
    const changed = () => { refreshStatus(); api.changed(); };
    refreshFn = () => { if (status.isConnected) { refreshStatus(); list.querySelectorAll('.tp-item-text').forEach((t) => t.dispatchEvent(new Event('recheck'))); } };

    const list = el('ol.tp-items');
    const drawItems = () => {
      list.replaceChildren(...items.map((q, i) => itemRow(q, i)));
      addItem.disabled = addMany.disabled = items.length >= MAX_ITEMS;
      count.textContent = items.length + ' / ' + MAX_ITEMS;
      refreshStatus();
    };

    function itemRow(q, i) {
      const thumb = el('button.sort-thumb', { type: 'button', 'aria-label': q.image ? 'Cambiar la imagen de la palabra ' + (i + 1) : 'Elegir una imagen para la palabra ' + (i + 1), title: q.image ? 'Cambiar imagen' : 'Elegir imagen (opcional; necesaria en el Modo 3)' },
        q.image ? el('img', { src: q.image, alt: '' }) : el('span', '🖼️'));
      thumb.addEventListener('click', async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { q.image = await api.store(await imageFileToDataURL(f, 800, 0.8), 'images'); if (!q.text) q.text = wordFromFile(f.name); delete q.tts; drawItems(); changed(); } catch (e) { toast(e.message, 'error'); }
      });
      const text = el('input.tp-item-text', { type: 'text', maxlength: '60', placeholder: 'Palabra o frase (ej. Welcome back!)', value: q.text || '', 'aria-label': 'Palabra o frase ' + (i + 1), autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
      const warn = el('span.tp-item-warn');
      const check = () => {
        const bad = LL.typingGame.unsupported(text.value, c.lang);
        warn.textContent = bad.length ? '⚠️ No está en el teclado: ' + bad.join(' ') : '';
        row.classList.toggle('empty', !String(text.value).trim());
      };
      text.addEventListener('recheck', check);
      text.addEventListener('input', () => { q.text = text.value; q.audioMode = 'voice'; delete q.tts; check(); changed(); });
      const mv = (d) => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; drawItems(); changed(); };
      const row = el('li.sort-item.tp-item',
        el('span.sort-item-num', String(i + 1) + '.'),
        thumb,
        el('div.tp-item-main', text, warn),
        el('div.sort-item-tools',
          q.image ? el('button.icon-btn', { type: 'button', 'aria-label': 'Quitar la imagen de la palabra ' + (i + 1), title: 'Quitar imagen', onclick: () => { q.image = ''; drawItems(); changed(); } }, '✕') : null,
          el('button.icon-btn', { type: 'button', 'aria-label': 'Escuchar', title: 'Escuchar', onclick: () => { if (String(q.text || '').trim()) speak(q.text, c.lang, c.voiceGender); else toast('Escribe la palabra para que se pueda escuchar.'); } }, '🔊'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Subir la palabra ' + (i + 1), title: 'Subir', disabled: i === 0, onclick: () => mv(-1) }, '↑'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Bajar la palabra ' + (i + 1), title: 'Bajar', disabled: i === items.length - 1, onclick: () => mv(1) }, '↓'),
          el('button.icon-btn.danger', { type: 'button', 'aria-label': 'Eliminar la palabra ' + (i + 1), title: 'Eliminar', disabled: items.length <= 1, onclick: () => { items.splice(i, 1); drawItems(); changed(); } }, '🗑️')));
      check();
      return row;
    }

    const count = el('span.small.muted');
    const addItem = el('button.btn.soft', { type: 'button', onclick: () => {
      if (items.length >= MAX_ITEMS) return;
      items.push(S.newTypingItem()); drawItems(); changed();
      const rows = list.querySelectorAll('.tp-item-text'); rows[rows.length - 1] && rows[rows.length - 1].focus();
    } }, '＋ Agregar palabra');
    const addMany = el('button.btn.ghost', { type: 'button', title: 'Elige varias imágenes a la vez: se crea una palabra por imagen (la palabra sale del nombre del archivo).', onclick: async () => {
      const files = await pickFiles('image/*'); if (!files.length) return;
      let added = 0;
      for (const f of files) {
        let target = items.find((q) => !String(q.text || '').trim() && !q.image);
        if (!target) { if (items.length >= MAX_ITEMS) { toast('Puedes tener hasta ' + MAX_ITEMS + ' palabras.', 'error'); break; } target = S.newTypingItem(); items.push(target); }
        try { target.image = await api.store(await imageFileToDataURL(f, 800, 0.8), 'images'); if (!target.text) target.text = wordFromFile(f.name); added++; } catch (e) { toast(e.message, 'error'); }
        drawItems();
      }
      if (added) { changed(); toast(added + (added === 1 ? ' palabra agregada.' : ' palabras agregadas.'), 'success'); }
    } }, '🖼️ Varias imágenes');

    container.append(
      el('div.sort-editor-head', el('h2', '⌨️ Palabras y frases')),
      el('p.small.muted', 'El niño copia cada palabra o frase con el teclado de la tablet, letra por letra, y al final toca Enter. Respeta mayúsculas y minúsculas (con Shift), los espacios, los números y los signos. La imagen es opcional, pero en el Modo 3 es necesaria.'),
      status, list,
      el('div.sort-editor-foot', addItem, addMany, count));
    drawItems();
  }

  /** The mode, shown in the editor's ⚙️ Ajustes panel. */
  function settingsFields(quiz, api) {
    const set = S.typingSettingsOf(quiz.config);
    const wrap = el('div.tp-modes', { role: 'radiogroup', 'aria-label': 'Modo de la actividad' });
    const draw = () => {
      wrap.replaceChildren(...MODES.map(([m, name, desc]) => el('button.tp-mode', {
        type: 'button', role: 'radio', 'aria-checked': String(set.mode === m),
        onclick: () => { set.mode = m; draw(); api.changed(); },
      }, el('span.tp-mode-name', name), el('span.tp-mode-desc', desc))));
    };
    draw();
    return [
      el('p.type-tag', '⌨️ Pantalla de Tablet'),
      el('div.field', 'Modo (para toda la actividad)', wrap,
        el('span.hint', 'Puntos por palabra: sin errores 1 · 1–2 errores 0.75 · 3–4 errores 0.5 · 5–6 errores 0.25 · más de 6 errores 0.')),
    ];
  }

  LL.typingEditor = { render, settingsFields, refresh: () => refreshFn && refreshFn() };
})();
