/* Activity library. One library, two views:
 *  - Teacher: everything, plus tools to create, edit, move, duplicate and delete.
 *  - Student: only quizzes marked "Visible" that have questions; folders with nothing
 *    ready are hidden; tapping a quiz opens it straight away; nothing can be changed.
 */
window.LL = window.LL || {};
(function () {
  const { el, $, toast, dialog, confirmDialog, download } = LL.ui;
  const S = LL.store;
  let currentFolder = null;

  const isStudent = () => LL.app.state.mode === 'student';

  function setFolder(id) { currentFolder = id || null; render(); LL.app.pushRoute(); }
  function setFolderQuiet(id) { currentFolder = id || null; }
  function resetToRoot() { currentFolder = null; }

  function render() {
    const student = isStudent();
    const folders = S.folders();
    const all = S.quizzes();
    const entries = student ? all.filter(S.isReady) : all;
    if (currentFolder && !folders.some((f) => f.id === currentFolder)) currentFolder = null;

    renderCrumbs(folders);

    const grid = $('#cardGrid');
    grid.replaceChildren();
    const here = (x) => (x || null) === currentFolder;

    const subFolders = folders
      .filter((f) => here(f.parentId) && (!student || S.folderHas(f.id, folders, entries)))
      .sort(S.byName);
    const items = entries.filter((t) => here(t.folderId));

    if (currentFolder) grid.append(upCard(folders));
    for (const f of subFolders) grid.append(folderCard(f, folders, entries, student));
    for (const t of items) grid.append(quizCard(t, student));


    LL.ui.stagger(grid);
    const empty = $('#libraryEmpty');
    const nothing = !subFolders.length && !items.length;
    empty.hidden = !nothing;
    if (nothing) {
      empty.replaceChildren(
        el('div.big-emoji', student ? '🌱' : '📂'),
        el('div', student ? 'Todavía no hay actividades aquí.' : currentFolder ? 'Esta carpeta está vacía.' : 'Todavía no tienes actividades.'),
        student ? null : el('div.muted.small', 'Usa «＋ Nueva actividad» o «📁 Nueva carpeta» para agregar algo aquí.'),
      );
    }
  }

  function renderCrumbs(folders) {
    const c = $('#crumbs');
    c.replaceChildren();
    const trail = S.folderTrail(currentFolder);
    if (currentFolder) {
      const parent = trail.length > 1 ? trail[trail.length - 2].id : null;
      c.append(el('button.icon-btn.back-btn' + (isStudent() ? '.big' : ''), { type: 'button', 'aria-label': 'Volver a la carpeta anterior', dataset: { drop: parent || '' }, onclick: () => setFolder(parent) }, '⬅️'));
    }
    const rootLabel = isStudent() ? '📚 Actividades' : '📚 Mis actividades';
    if (!trail.length) { c.append(el('span.here', rootLabel)); return; }
    c.append(el('button', { type: 'button', dataset: { drop: '' }, onclick: () => setFolder(null) }, rootLabel));
    trail.forEach((f, i) => {
      c.append(el('span.sep', '›'));
      if (i === trail.length - 1) c.append(el('span.here', f.name));
      else c.append(el('button', { type: 'button', dataset: { drop: f.id }, onclick: () => setFolder(f.id) }, f.name));
    });
  }

  function upCard(folders) {
    const f = folders.find((x) => x.id === currentFolder);
    return el('div.card.up', { dataset: { drop: (f && f.parentId) || '' } },
      el('button.card-main', { type: 'button', onclick: () => setFolder(f ? f.parentId : null), 'aria-label': 'Carpeta anterior' },
        el('span.folder-icon', '⬆️'),
        el('span.name', 'Carpeta anterior'),
        el('span.meta', 'Volver a la carpeta superior')));
  }

  function folderCard(f, folders, entries, student) {
    const subCount = folders.filter((x) => x.parentId === f.id && (!student || S.folderHas(x.id, folders, entries))).length;
    const actCount = entries.filter((t) => t.folderId === f.id).length;
    const meta = [subCount ? subCount + (subCount === 1 ? ' carpeta' : ' carpetas') : '', actCount + (actCount === 1 ? ' actividad' : ' actividades')].filter(Boolean).join(' · ');
    const card = el('div.card.folder',
      el('button.card-main', { type: 'button', onclick: (e) => { const c = e.currentTarget.closest('.card'); c.classList.add('opening'); setTimeout(() => setFolder(f.id), 180); } },
        el('span.folder-icon', '📁'),
        el('span.name', f.name),
        el('span.meta', meta)));
    card.style.setProperty('--folder', f.color || '#F8EDB8');
    if (!student) {
      card.dataset.drop = f.id;
      card.append(el('div.card-tools',
        el('button.btn.sm.ghost', { type: 'button', onclick: () => editFolder(f) }, '✏️ Editar'),
        el('button.icon-btn', { type: 'button', 'aria-label': 'Más opciones de la carpeta', onclick: (e) => folderMenu(e, f) }, '⋯')));
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); folderMenu(e, f); });
    }
    return card;
  }

  /** «＋ Nueva actividad»: choose the kind first. */
  async function chooseNewActivity() {
    const pick = (kind) => () => { document.querySelector('.modal-back')?.click(); setTimeout(() => LL.editor.open(null, currentFolder, kind), 0); };
    await dialog({
      title: '¿Qué tipo de actividad?',
      body: el('div.kind-choices',
        el('button.kind-choice', { type: 'button', onclick: pick('quiz') },
          el('span.kind-icon', '❓'), el('span.kind-name', 'Quiz'), el('span.kind-desc', 'Preguntas con respuestas para elegir.')),
        el('button.kind-choice', { type: 'button', onclick: pick('sort') },
          el('span.kind-icon', '🧺'), el('span.kind-name', 'Clasificación rápida'), el('span.kind-desc', 'Las tarjetas pasan por una banda y el niño lleva cada una a su grupo.'))),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }],
    });
  }

  function cardMeta(t) {
    const qs = t.config?.questions || [];
    if (t.type === 'sort') {
      const cards = qs.reduce((s, g) => s + (g.options || []).filter(S.itemFilled).length, 0);
      return 'Clasificación rápida · ' + qs.length + ' grupos · ' + cards + (cards === 1 ? ' tarjeta' : ' tarjetas');
    }
    return 'Quiz · ' + qs.length + (qs.length === 1 ? ' pregunta' : ' preguntas');
  }

  function quizCard(t, student) {
    const cover = t.config?.coverImage || '';
    const main = el('button.card-main', { type: 'button', onclick: () => play(t) },
      LL.media.isImage(cover) ? el('img.cover', { src: cover, alt: '' }) : el('span.cover-placeholder', { 'aria-hidden': 'true' }, t.type === 'sort' ? '🧺' : '❓'),
      el('span.name', t.name),
      el('span.meta', cardMeta(t)));
    const card = el('div.card.quiz', { dataset: { quizId: t.id } }, main);
    if (!student) {
      card.classList.add('draggable');
      card.title = 'Arrastra la tarjeta a una carpeta para moverla';
      const ready = S.isReady(t);
      main.append(el('span.badge.' + (ready ? 'visible' : 'hidden'), ready ? '👀 Visible para estudiantes' : '🛠️ En preparación'));
      card.append(el('div.card-tools',
        el('button.btn.sm.soft', { type: 'button', onclick: () => LL.editor.open(t.id) }, '✏️ Editar'),
        el('button.icon-btn', { type: 'button', 'aria-label': 'Ver resultados de ' + t.name, title: 'Ver resultados', onclick: () => LL.results.open(t) }, '📊'),
        el('button.icon-btn', { type: 'button', 'aria-label': 'Más opciones del quiz', onclick: (e) => quizMenu(e, t) }, '⋯')));
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); quizMenu(e, t); });
    }
    return card;
  }

  /* ---------- Drag an activity onto a folder (teacher only) ----------
   * Drop targets: folder cards, «Carpeta anterior», and the folder names at the top.
   * Mouse: drag the card. Touch: press and hold the card, then move the finger
   * (holding without moving still opens the ⋯ menu). */
  let drag = null, dragJustEnded = false;
  const DRAG_PX = 8, HOLD_MS = 420;

  function folderLabel(id) {
    if (!id) return 'Mis actividades';
    const f = S.folders().find((x) => x.id === id);
    return f ? f.name : 'la carpeta';
  }
  function dragStart() {
    const d = drag;
    d.on = true;
    clearTimeout(d.hold);
    const t = S.getQuiz(d.id);
    const cover = t && t.config && t.config.coverImage;
    d.ghost = el('div.drag-chip',
      LL.media.isImage(cover) ? el('img', { src: d.card.querySelector('img.cover') ? d.card.querySelector('img.cover').src : cover, alt: '' }) : el('span.chip-emoji', '❓'),
      el('span', t ? t.name : ''));
    document.body.append(d.ghost);
    d.card.classList.add('dragging');
    document.body.classList.add('card-sorting');
    document.querySelectorAll('[data-drop]').forEach((x) => x.classList.add('drop-ok'));
    d.timer = setInterval(autoScroll, 30);
    if (d.touch && navigator.vibrate) try { navigator.vibrate(15); } catch { /* ignore */ }
    dragMove();
  }
  function dragMove() {
    const d = drag;
    d.ghost.style.transform = 'translate(' + (d.x + 12) + 'px,' + (d.y + 12) + 'px)';
    const under = document.elementFromPoint(d.x, d.y);
    const target = under && under.closest('[data-drop]');
    if (target !== d.target) {
      if (d.target) d.target.classList.remove('drop-target');
      d.target = target || null;
      if (d.target) d.target.classList.add('drop-target');
    }
  }
  function autoScroll() {
    if (!drag || !drag.on) return;
    const edge = 60, top = (LL.ui && document.querySelector('.appbar') ? document.querySelector('.appbar').getBoundingClientRect().bottom : 0);
    if (drag.y < top + edge) window.scrollBy(0, -14);
    else if (drag.y > innerHeight - edge) window.scrollBy(0, 14);
    else return;
    dragMove();
  }
  function dragEnd(commit) {
    const d = drag;
    if (!d) return;
    drag = null;
    clearTimeout(d.hold);
    if (!d.on) {
      // Touch: held without moving -> the usual options menu.
      if (d.held) { const t = S.getQuiz(d.id); if (t) { dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 350); quizMenu({ clientX: d.x, clientY: d.y, target: d.card }, t); } }
      return;
    }
    clearInterval(d.timer);
    d.ghost.remove();
    d.card.classList.remove('dragging');
    document.body.classList.remove('card-sorting');
    document.querySelectorAll('.drop-ok, .drop-target').forEach((x) => x.classList.remove('drop-ok', 'drop-target'));
    // Swallow only the click that comes with this release (touch browsers may send it a little later).
    dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, d.touch ? 400 : 0);
    if (!commit || !d.target) return;
    const dest = d.target.dataset.drop || null;
    const t = S.getQuiz(d.id);
    if (!t || (t.folderId || null) === dest) return;
    if (S.moveQuiz(d.id, dest)) {
      toast('«' + t.name + '» se movió a «' + folderLabel(dest) + '».', 'success');
      render();
    }
  }
  function initDrag() {
    const grid = $('#cardGrid');
    grid.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.card.quiz.draggable');
      if (!card || isStudent() || e.button > 0 || e.target.closest('.card-tools')) return;
      const touch = e.pointerType !== 'mouse';
      drag = { card, id: card.dataset.quizId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pid: e.pointerId, touch, on: false, held: false, target: null };
      if (touch) drag.hold = setTimeout(() => { if (drag && !drag.on) { drag.held = true; drag.card.classList.add('armed'); if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* ignore */ } } }, HOLD_MS);
    });
    window.addEventListener('pointermove', (e) => {
      const d = drag;
      if (!d || e.pointerId !== d.pid) return;
      d.x = e.clientX; d.y = e.clientY;
      if (!d.on) {
        const far = Math.hypot(d.x - d.sx, d.y - d.sy) > DRAG_PX;
        if (!far) return;
        if (d.touch && !d.held) { clearTimeout(d.hold); drag = null; return; } // the finger is scrolling the page
        d.card.classList.remove('armed');
        dragStart();
        return;
      }
      e.preventDefault();
      dragMove();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (drag && (drag.on || drag.held)) e.preventDefault(); }, { passive: false });
    window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) { drag.card.classList.remove('armed'); dragEnd(true); } });
    window.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pid) { drag.card.classList.remove('armed'); dragEnd(false); } });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag && drag.on) dragEnd(false); });
    // A click right after a drag must not open the quiz; a touch long-press must not open the menu twice.
    grid.addEventListener('click', (e) => { if (dragJustEnded) { e.stopPropagation(); e.preventDefault(); } }, true);
    grid.addEventListener('dragstart', (e) => { if (!isStudent()) e.preventDefault(); }); // no browser image drag
    grid.addEventListener('contextmenu', (e) => { if (drag || dragJustEnded) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  function play(t) {
    if (isStudent()) LL.player.open(t, { onClose: render });
    else LL.player.open(t, { preview: true, onClose: render });
  }

  /* ---------- Teacher menus ---------- */
  function popMenu(e, items) {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const menu = el('div.menu', { role: 'menu' });
    for (const it of items) {
      menu.append(el('button' + (it.danger ? '.danger' : ''), { type: 'button', role: 'menuitem', onclick: () => { menu.remove(); it.run(); } }, it.label));
    }
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    const x = e.clientX || (e.target.getBoundingClientRect().left), y = e.clientY || (e.target.getBoundingClientRect().bottom);
    menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    setTimeout(() => {
      const off = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } };
      document.addEventListener('pointerdown', off);
    }, 0);
    const opener = document.activeElement;
    menu.addEventListener('keydown', (ev) => {
      const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (ev.key === 'Escape' || ev.key === 'Tab') { ev.preventDefault(); menu.remove(); opener && opener.focus(); }
    });
    menu.firstChild && menu.firstChild.focus();
  }

  function quizMenu(e, t) {
    popMenu(e, [
      { label: '▶️ Probar como estudiante', run: () => play(t) },
      { label: '📊 Ver resultados', run: () => LL.results.open(t) },
      { label: '✏️ Editar', run: () => LL.editor.open(t.id) },
      { label: '📂 Mover a otra carpeta', run: () => moveDialog(t) },
      { label: '📄 Duplicar', run: () => { const id = S.duplicateQuiz(t.id); if (id) { toast('Copia creada (queda «En preparación»).', 'success'); render(); } } },
      { label: '🗑️ Eliminar', danger: true, run: async () => {
        if (await confirmDialog('¿Eliminar este quiz?', '«' + t.name + '» se borrará de este navegador. Esto no se puede deshacer. (Consejo: haz un respaldo antes.)', 'Eliminar', true)) {
          S.deleteQuiz(t.id); toast('Quiz eliminado.'); render();
        }
      } },
    ]);
  }

  function folderMenu(e, f) {
    popMenu(e, [
      { label: '📂 Abrir', run: () => setFolder(f.id) },
      { label: '✏️ Cambiar nombre o color', run: () => editFolder(f) },
      { label: '📂 Mover a otra carpeta', run: () => moveFolderDialog(f) },
      { label: '📤 Compartir (descargar archivo)', run: () => {
        LL.media.inlineBackup(S.exportBackup(f.id)).then((b) => download('little-learners-' + slug(f.name) + '.json', JSON.stringify(b)));
        toast('Archivo descargado. Otro maestro puede abrirlo en «Respaldo» → «Importar».', 'success');
      } },
      { label: '🗑️ Eliminar carpeta', danger: true, run: async () => {
        if (await confirmDialog('¿Eliminar la carpeta «' + f.name + '»?', 'Lo que haya dentro no se borra: se moverá a la carpeta superior.', 'Eliminar carpeta', true)) {
          S.deleteFolder(f.id); toast('Carpeta eliminada.'); render();
        }
      } },
    ]);
  }

  const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carpeta';

  function folderOptions(excludeId) {
    const sel = el('select');
    sel.append(new Option('📚 Mis actividades (sin carpeta)', ''));
    const all = S.folders();
    const isInside = (id) => { let p = id; while (p) { if (p === excludeId) return true; p = (all.find((x) => x.id === p) || {}).parentId; } return false; };
    all.filter((f) => !excludeId || !isInside(f.id))
      .map((f) => ({ f, label: S.folderPathLabel(f) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
      .forEach(({ f, label }) => sel.append(new Option('📁 ' + label, f.id)));
    return sel;
  }

  async function moveDialog(t) {
    const sel = folderOptions();
    sel.value = t.folderId || '';
    const ok = await dialog({ title: 'Mover «' + t.name + '»', body: el('label.field', 'Carpeta de destino', sel), actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: 'Mover', kind: 'primary', value: true }] });
    if (ok) { S.moveQuiz(t.id, sel.value || null); toast('Quiz movido.', 'success'); render(); }
  }

  async function moveFolderDialog(f) {
    const sel = folderOptions(f.id);
    sel.value = f.parentId || '';
    const ok = await dialog({ title: 'Mover la carpeta «' + f.name + '»', body: el('label.field', 'Mover dentro de', sel), actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: 'Mover', kind: 'primary', value: true }] });
    if (ok) { if (S.moveFolder(f.id, sel.value || null)) { toast('Carpeta movida.', 'success'); render(); } }
  }

  async function editFolder(f) {
    const isNew = !f;
    let color = f ? f.color : S.FOLDER_COLORS[0][1];
    const name = el('input', { type: 'text', maxlength: '90', placeholder: 'Ej. Español', value: f ? f.name : '' });
    const pal = el('div.palette');
    for (const [label, c] of S.FOLDER_COLORS) {
      const b = el('button.swatch', { type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(c === color), style: { background: c } });
      b.addEventListener('click', () => { color = c; pal.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      pal.append(b);
    }
    const ok = await dialog({
      title: isNew ? 'Nueva carpeta' : 'Editar carpeta',
      body: el('div', { style: { display: 'grid', gap: '14px' } }, el('label.field', 'Nombre', name), el('div.field', 'Color', pal)),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: isNew ? 'Crear carpeta' : 'Guardar', kind: 'primary', value: () => (name.value.trim() ? true : (name.focus(), undefined)) }],
    });
    if (!ok) return;
    const parent = f ? (f.parentId || null) : currentFolder;
    if (S.folderNameTaken(name.value, parent, f && f.id)) { toast('Ya hay una carpeta llamada «' + name.value.trim() + '» aquí. Usa otro nombre.', 'error'); return; }
    S.saveFolder({ id: f && f.id, name: name.value.trim(), color, parentId: currentFolder });
    toast(isNew ? 'Carpeta creada.' : 'Carpeta guardada.', 'success');
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#newFolderBtn').addEventListener('click', () => editFolder(null));
    $('#newQuizBtn').addEventListener('click', chooseNewActivity);
    initDrag();
  });

  LL.library = { render, setFolder, setFolderQuiet, resetToRoot, play, current: () => currentFolder };
})();
