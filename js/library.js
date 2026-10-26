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

  function setFolder(id) { currentFolder = id || null; render(); }
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

    // The original "Sonidos iniciales" activity, when the teacher turns it on for students.
    const son = S.sonidos();
    if (!currentFolder && (!student || son.showToStudents)) grid.append(sonidosCard(son, student));

    LL.ui.stagger(grid);
    const empty = $('#libraryEmpty');
    const nothing = !subFolders.length && !items.length;
    empty.hidden = !nothing;
    if (nothing) {
      empty.replaceChildren(
        el('div.big-emoji', student ? '🌱' : '📂'),
        el('div', student ? 'Todavía no hay actividades aquí.' : currentFolder ? 'Esta carpeta está vacía.' : 'Todavía no tienes quizzes.'),
        student ? null : el('div.muted.small', 'Usa «＋ Nuevo quiz» o «📁 Nueva carpeta» para agregar algo aquí.'),
      );
    }
  }

  function renderCrumbs(folders) {
    const c = $('#crumbs');
    c.replaceChildren();
    const trail = S.folderTrail(currentFolder);
    if (currentFolder) {
      const parent = trail.length > 1 ? trail[trail.length - 2].id : null;
      c.append(el('button.icon-btn.back-btn' + (isStudent() ? '.big' : ''), { type: 'button', 'aria-label': 'Volver a la carpeta anterior', onclick: () => setFolder(parent) }, '⬅️'));
    }
    const rootLabel = isStudent() ? '📚 Actividades' : '📚 Mis actividades';
    if (!trail.length) { c.append(el('span.here', rootLabel)); return; }
    c.append(el('button', { type: 'button', onclick: () => setFolder(null) }, rootLabel));
    trail.forEach((f, i) => {
      c.append(el('span.sep', '›'));
      if (i === trail.length - 1) c.append(el('span.here', f.name));
      else c.append(el('button', { type: 'button', onclick: () => setFolder(f.id) }, f.name));
    });
  }

  function upCard(folders) {
    const f = folders.find((x) => x.id === currentFolder);
    return el('div.card.up',
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
      card.append(el('div.card-tools',
        el('button.btn.sm.ghost', { type: 'button', onclick: () => editFolder(f) }, '✏️ Editar'),
        el('button.icon-btn', { type: 'button', 'aria-label': 'Más opciones de la carpeta', onclick: (e) => folderMenu(e, f) }, '⋯')));
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); folderMenu(e, f); });
    }
    return card;
  }

  function quizCard(t, student) {
    const cover = t.config?.coverImage || '';
    const n = t.config?.questions?.length || 0;
    const main = el('button.card-main', { type: 'button', onclick: () => play(t) },
      LL.media.isImage(cover) ? el('img.cover', { src: cover, alt: '' }) : el('span.cover-placeholder', { 'aria-hidden': 'true' }, '❓'),
      el('span.name', t.name),
      el('span.meta', 'Quiz · ' + n + (n === 1 ? ' pregunta' : ' preguntas')));
    const card = el('div.card.quiz', { dataset: { quizId: t.id } }, main);
    if (!student) {
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

  function sonidosCard(son, student) {
    const main = el('button.card-main', { type: 'button', onclick: () => LL.app.openSonidos() },
      el('span.cover-placeholder', { style: { background: '#FFE7EC' }, 'aria-hidden': 'true' }, '🔤'),
      el('span.name', 'Sonidos iniciales'),
      el('span.meta', 'Arrastra cada dibujo a su letra · ' + son.letters.join(', ')));
    if (!student) main.append(el('span.badge.' + (son.showToStudents ? 'visible' : 'hidden'), son.showToStudents ? '👀 Visible para estudiantes' : '🛠️ Solo para el maestro'));
    const card = el('div.card.quiz', main);
    if (!student) card.append(el('div.card-tools', el('button.btn.sm.soft', { type: 'button', onclick: () => LL.app.go('sonidos-admin') }, '⚙️ Configurar')));
    return card;
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
    $('#newQuizBtn').addEventListener('click', () => LL.editor.open(null, currentFolder));
  });

  LL.library = { render, setFolder, resetToRoot, current: () => currentFolder };
})();
