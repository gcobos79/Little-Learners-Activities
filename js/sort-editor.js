/* Editor for «Clasificación rápida» (activity type 'sort').
 * Layout like the teacher's reference: one panel per group (its name, optionally a picture) with a
 * numbered list of cards (picture + word). Groups are stored as quiz "questions" and cards as their
 * "answers" (see store.js), so saving, pictures, voices and sync are shared with quizzes. */
window.LL = window.LL || {};
(function () {
  const { el, toast, confirmDialog, imageFileToDataURL, pickFile, speak } = LL.ui;
  const S = LL.store;
  const MAX_GROUPS = 8, MAX_ITEMS = 20;
  const GROUP_COLORS = ['#FDE2E7', '#FFE9CF', '#FFF4BF', '#DFF3D8', '#D9F1EE', '#DDE7FD', '#EBE0FB', '#F6E3D5'];

  /** Pick several pictures at once (one card per picture). */
  function pickFiles(accept) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
      input.addEventListener('change', () => { resolve([...(input.files || [])]); input.remove(); });
      document.body.append(input);
      input.click();
    });
  }
  /** "abeja.png" → "abeja"; "02_Flor-roja.jpg" → "Flor roja". */
  const wordFromFile = (name) => String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/^[\d\s._-]+/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60);

  /**
   * container: element to fill. quiz: the activity being edited (config.questions = groups).
   * api: { changed(), store(dataUrl, folder) → Promise<ref> }
   */
  function render(container, quiz, api) {
    const c = quiz.config;
    const groups = c.questions;
    const set = S.sortSettingsOf(c);
    container.replaceChildren();

    // Optional instruction shown (and read) at the top of the activity.
    const instr = el('textarea', { rows: '2', maxlength: '200', placeholder: 'Ej. Lleva cada dibujo a la letra con la que empieza.' });
    instr.value = set.instruction || '';
    instr.addEventListener('input', () => { set.instruction = instr.value; api.changed(); });
    const instrField = el('label.field.sort-instruction-field', 'Instrucción (opcional)', el('span.hint', 'Se muestra arriba de la banda; el botón 🔊 la lee.'), instr);
    instrField.hidden = !set.instruction;
    const instrBtn = el('button.btn.sm.ghost', { type: 'button', onclick: () => { instrField.hidden = false; instrBtn.hidden = true; instr.focus(); } }, '＋ Instrucción');
    instrBtn.hidden = !instrField.hidden;

    const status = el('div');
    const refreshStatus = () => {
      const msg = S.sortProblem(c);
      const n = groups.reduce((s, g) => s + (g.options || []).filter(S.itemFilled).length, 0);
      status.className = msg ? 'problem-box' : 'ok-box';
      status.textContent = msg ? '⚠️ ' + msg : '✓ Lista: ' + groups.length + ' grupos · ' + n + ' tarjetas.';
    };
    const changed = () => { refreshStatus(); api.changed(); };

    const grid = el('div.sort-groups');
    const drawAll = () => {
      grid.replaceChildren(...groups.map((g, gi) => groupPanel(g, gi)));
      addGroup.disabled = groups.length >= MAX_GROUPS;
      refreshStatus();
    };

    function groupPanel(g, gi) {
      const panel = el('section.sort-group', { dataset: { group: g.id } });
      panel.style.setProperty('--group', GROUP_COLORS[gi % GROUP_COLORS.length]);

      const label = el('input.sort-group-name', { type: 'text', maxlength: '40', placeholder: 'Grupo ' + (gi + 1) + ' (ej. A)', value: g.text || '', 'aria-label': 'Nombre del grupo ' + (gi + 1) });
      label.addEventListener('input', () => { g.text = label.value; changed(); });

      const imgBox = el('div.sort-group-img');
      const drawImg = () => {
        imgBox.replaceChildren();
        if (g.image) {
          imgBox.append(el('img', { src: g.image, alt: '' }),
            el('button.icon-btn.sm-x', { type: 'button', 'aria-label': 'Quitar la imagen del grupo', onclick: () => { g.image = ''; drawImg(); changed(); } }, '✕'));
        } else {
          imgBox.append(el('button.btn.sm.ghost', { type: 'button', title: 'Imagen del grupo (opcional)', onclick: async () => {
            const f = await pickFile('image/*'); if (!f) return;
            try { g.image = await api.store(await imageFileToDataURL(f, 600, 0.8), 'images'); drawImg(); changed(); } catch (e) { toast(e.message, 'error'); }
          } }, '🖼️'));
        }
      };
      drawImg();

      const move = (d) => { const j = gi + d; if (j < 0 || j >= groups.length) return; [groups[gi], groups[j]] = [groups[j], groups[gi]]; drawAll(); changed(); };
      const head = el('div.sort-group-head',
        el('span.sort-group-num', String(gi + 1)), label, imgBox,
        el('div.sort-group-tools',
          el('button.icon-btn', { type: 'button', 'aria-label': 'Mover el grupo antes', title: 'Mover antes', disabled: gi === 0, onclick: () => move(-1) }, '◀'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Mover el grupo después', title: 'Mover después', disabled: gi === groups.length - 1, onclick: () => move(1) }, '▶'),
          el('button.icon-btn.danger', { type: 'button', 'aria-label': 'Eliminar el grupo ' + (gi + 1), title: 'Eliminar grupo', disabled: groups.length <= 2, onclick: async () => {
            if (!(await confirmDialog('¿Eliminar el grupo «' + (g.text || gi + 1) + '»?', 'Se quitarán también sus ' + g.options.length + ' tarjetas cuando pulses «Guardar».', 'Eliminar', true))) return;
            groups.splice(gi, 1); drawAll(); changed();
          } }, '🗑️')));

      const list = el('ol.sort-items');
      const drawItems = () => {
        list.replaceChildren(...g.options.map((o, oi) => itemRow(g, o, oi, drawItems)));
        addItem.disabled = g.options.length >= MAX_ITEMS;
        addMany.disabled = g.options.length >= MAX_ITEMS;
        count.textContent = g.options.length + ' / ' + MAX_ITEMS;
      };
      const count = el('span.small.muted');
      const addItem = el('button.btn.sm.soft', { type: 'button', onclick: () => {
        if (g.options.length >= MAX_ITEMS) return;
        g.options.push(S.newSortItem()); drawItems(); changed();
        const rows = list.querySelectorAll('.sort-item input[type=text]'); rows[rows.length - 1] && rows[rows.length - 1].focus();
      } }, '＋ Agregar tarjeta');
      const addMany = el('button.btn.sm.ghost', { type: 'button', title: 'Elige varias imágenes a la vez: se crea una tarjeta por imagen (la palabra sale del nombre del archivo).', onclick: async () => {
        const files = await pickFiles('image/*'); if (!files.length) return;
        // Fill empty cards first, then add new ones.
        let added = 0;
        for (const f of files) {
          let target = g.options.find((o) => !S.itemFilled(o));
          if (!target) { if (g.options.length >= MAX_ITEMS) { toast('Cada grupo puede tener hasta ' + MAX_ITEMS + ' tarjetas.', 'error'); break; } target = S.newSortItem(); g.options.push(target); }
          try { target.image = await api.store(await imageFileToDataURL(f, 600, 0.8), 'images'); if (!target.text) target.text = wordFromFile(f.name); added++; } catch (e) { toast(e.message, 'error'); }
          drawItems();
        }
        if (added) { changed(); toast(added + (added === 1 ? ' tarjeta agregada.' : ' tarjetas agregadas.'), 'success'); }
      } }, '🖼️ Varias imágenes');
      drawItems();

      panel.append(head, list, el('div.sort-group-foot', addItem, addMany, count));
      return panel;
    }

    function itemRow(g, o, oi, redraw) {
      const thumb = el('button.sort-thumb', { type: 'button', 'aria-label': o.image ? 'Cambiar la imagen de la tarjeta ' + (oi + 1) : 'Elegir una imagen para la tarjeta ' + (oi + 1), title: o.image ? 'Cambiar imagen' : 'Elegir imagen' },
        o.image ? el('img', { src: o.image, alt: '' }) : el('span', '🖼️'));
      thumb.addEventListener('click', async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { o.image = await api.store(await imageFileToDataURL(f, 600, 0.8), 'images'); if (!o.text) o.text = wordFromFile(f.name); redraw(); changed(); } catch (e) { toast(e.message, 'error'); }
      });
      const text = el('input', { type: 'text', maxlength: '60', placeholder: o.image ? 'Palabra (opcional)' : 'Palabra o texto', value: o.text || '', 'aria-label': 'Palabra de la tarjeta ' + (oi + 1) });
      text.addEventListener('input', () => { o.text = text.value; o.audioMode = 'voice'; changed(); });
      const items = g.options;
      const mv = (d) => { const j = oi + d; if (j < 0 || j >= items.length) return; [items[oi], items[j]] = [items[j], items[oi]]; redraw(); changed(); };
      return el('li.sort-item' + (S.itemFilled(o) ? '' : '.empty'),
        el('span.sort-item-num', String(oi + 1) + '.'),
        thumb, text,
        el('div.sort-item-tools',
          el('button.icon-btn', { type: 'button', 'aria-label': 'Escuchar', title: 'Escuchar', onclick: () => { if (String(o.text || '').trim()) speak(o.text, c.lang, c.voiceGender); else toast('Escribe la palabra para que se pueda escuchar.'); } }, '🔊'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Subir la tarjeta ' + (oi + 1), title: 'Subir', disabled: oi === 0, onclick: () => mv(-1) }, '↑'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Bajar la tarjeta ' + (oi + 1), title: 'Bajar', disabled: oi === items.length - 1, onclick: () => mv(1) }, '↓'),
          el('button.icon-btn', { type: 'button', 'aria-label': 'Duplicar la tarjeta ' + (oi + 1), title: 'Duplicar', disabled: items.length >= MAX_ITEMS, onclick: () => { const copy = { ...S.clone(o), id: S.uid('quiz') }; delete copy.tts; items.splice(oi + 1, 0, copy); redraw(); changed(); } }, '📄'),
          el('button.icon-btn.danger', { type: 'button', 'aria-label': 'Eliminar la tarjeta ' + (oi + 1), title: 'Eliminar', disabled: items.length <= 1, onclick: () => { items.splice(oi, 1); redraw(); changed(); } }, '🗑️')));
    }

    const addGroup = el('button.btn.soft', { type: 'button', onclick: () => {
      if (groups.length >= MAX_GROUPS) return;
      groups.push(S.newSortGroup('', 3)); drawAll(); changed();
      const names = grid.querySelectorAll('.sort-group-name'); names[names.length - 1] && names[names.length - 1].focus();
    } }, '＋ Agregar grupo');

    container.append(
      el('div.sort-editor-head', el('h2', '🧺 Grupos y tarjetas'), instrBtn),
      el('p.small.muted', 'Las tarjetas pasan por una banda y el niño lleva cada una a su grupo. Escribe el nombre de cada grupo (por ejemplo una letra) y agrega sus tarjetas con imagen y/o palabra.'),
      instrField, status, grid,
      el('div.sort-editor-foot', addGroup, el('span.small.muted', 'De 2 a ' + MAX_GROUPS + ' grupos · de 1 a ' + MAX_ITEMS + ' tarjetas por grupo.')));
    drawAll();
  }

  /** The belt settings shown in the editor's ⚙️ Ajustes panel. */
  function settingsFields(quiz, api, segmented) {
    const c = quiz.config;
    const set = S.sortSettingsOf(c);
    const per = el('select', { 'aria-label': 'Tarjetas por grupo' });
    per.append(new Option('Todas', '0'));
    for (let n = 2; n <= 12; n++) per.append(new Option(String(n), String(n)));
    per.value = String(set.perGroup || 0);
    per.addEventListener('change', () => { set.perGroup = Number(per.value) || 0; api.changed(); });
    const showText = el('input', { type: 'checkbox', checked: !!set.showText });
    showText.addEventListener('change', () => { set.showText = showText.checked; api.changed(); });
    const say = el('input', { type: 'checkbox', checked: set.speak !== false });
    say.addEventListener('change', () => { set.speak = say.checked; api.changed(); });
    return [
      el('div.field', 'Velocidad de la banda', segmented([['slow', '🐢 Lenta'], ['normal', 'Normal'], ['fast', '🐇 Rápida']], set.speed || 'normal', (v) => { set.speed = v; api.changed(); })),
      el('label.field', 'Tarjetas por grupo en cada juego', per, el('span.hint', '«Todas» usa todas las tarjetas. Con un número, se eligen al azar en cada juego.')),
      el('div.field', 'Tarjetas',
        el('label.switch', say, 'Decir la palabra al tocar la tarjeta'),
        el('label.switch', showText, 'Mostrar la palabra debajo de la imagen'),
        el('span.hint', 'Una tarjeta sin imagen siempre muestra su palabra.')),
    ];
  }

  LL.sortEditor = { render, settingsFields };
})();
