/* Teacher tools: students, backup / sharing and settings. */
window.LL = window.LL || {};
(function () {
  const { el, $, toast, dialog, confirmDialog, pickFile, download, formatBytes } = LL.ui;
  const S = LL.store;

  /* ---------- Students ---------- */
  function animalPicker(selected, onPick) {
    const grid = el('div.animal-pick');
    for (const a of S.ANIMALS) {
      const b = el('button', { type: 'button', 'aria-pressed': String(a === selected), 'aria-label': a }, a);
      b.addEventListener('click', () => { grid.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(a); });
      grid.append(b);
    }
    return grid;
  }

  /** Animal (or picture) for a student, used in lists and on the "¿Quién eres?" cards. */
  function avatar(s, cls = 'animal') {
    return s.avatar && LL.media.isImage(s.avatar)
      ? el('img.avatar-img', { src: s.avatar, alt: '' })
      : el('span.' + cls, s.animal || '🐾');
  }

  async function studentDialog(existing) {
    let animal = existing ? existing.animal : S.ANIMALS[Math.floor(Math.random() * S.ANIMALS.length)];
    let pic = existing ? existing.avatar || '' : '';
    const name = el('input', { type: 'text', maxlength: '40', placeholder: 'Nombre', value: existing ? existing.name : '' });
    const picRow = el('div.media-row');
    const drawPic = () => {
      picRow.replaceChildren();
      if (pic) picRow.append(el('img.thumb', { src: pic, alt: 'Foto o dibujo' }));
      picRow.append(el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { pic = await LL.ui.imageFileToDataURL(f, 256, 0.8); drawPic(); } catch (e) { toast(e.message, 'error'); }
      } }, pic ? '🖼️ Cambiar' : '🖼️ Elegir foto o dibujo'));
      if (pic) picRow.append(el('button.btn.sm.danger-ghost', { type: 'button', onclick: () => { pic = ''; drawPic(); } }, 'Quitar'));
    };
    drawPic();
    const ok = await dialog({
      title: existing ? 'Editar estudiante' : 'Agregar estudiante',
      body: el('div', { style: { display: 'grid', gap: '14px' } },
        el('label.field', 'Nombre', name),
        el('div.field', 'Animalito', animalPicker(animal, (a) => { animal = a; })),
        el('div.field', 'Foto o dibujo (opcional)', el('span.hint', 'Si eliges una, se muestra en lugar del animalito.'), picRow)),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: existing ? 'Guardar' : 'Agregar', kind: 'primary', value: () => (name.value.trim() ? true : (name.focus(), undefined)) }],
    });
    return ok ? { name: name.value.trim(), animal, avatar: pic } : null;
  }

  let rosterBusy = false;
  /** Run a change to the class list (database when signed in, this device otherwise). */
  async function rosterChange(fnCloud, fnLocal, okMsg) {
    if (rosterBusy) return;
    rosterBusy = true;
    try {
      if (LL.cloud.signedIn()) await fnCloud(); else fnLocal();
      if (okMsg) toast(okMsg, 'success');
    } catch (e) {
      toast('No se pudo guardar: ' + (LL.auth ? LL.auth.friendly(e) : e.message), 'error');
    } finally { rosterBusy = false; renderRoster(); }
  }

  function renderRoster() {
    const page = $('#screen-students-admin');
    const r = S.roster();
    const cloud = LL.cloud.signedIn();
    const list = el('div.roster-list');
    const dupName = (v, exceptIdx) => r.some((x, k) => k !== exceptIdx && x.name.toLocaleLowerCase('es') === v.name.toLocaleLowerCase('es'));
    r.forEach((s, i) => {
      list.append(el('div.roster-row',
        avatar(s), el('span.nm', s.name),
        el('button.icon-btn', { type: 'button', 'aria-label': 'Subir a ' + s.name, disabled: i === 0, onclick: () => {
          const order = r.slice(); [order[i - 1], order[i]] = [order[i], order[i - 1]];
          rosterChange(() => LL.sync.students.reorder(order.map((x) => x.id)), () => S.saveRoster(order));
        } }, '⬆️'),
        el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
          const v = await studentDialog(s); if (!v) return;
          if (dupName(v, i)) { toast('Ya hay un estudiante con ese nombre.', 'error'); return; }
          rosterChange(() => LL.sync.students.update(s.id, v), () => { r[i] = { ...s, ...v }; S.saveRoster(r); }, 'Cambios guardados.');
        } }, '✏️ Editar'),
        el('button.btn.sm.danger-ghost', { type: 'button', onclick: async () => {
          const msg = cloud ? 'Ya no aparecerá en «¿Quién eres?». Sus resultados anteriores se conservan.' : 'Ya no aparecerá en «¿Quién eres?».';
          if (!(await confirmDialog('¿Quitar a ' + s.name + '?', msg, 'Quitar', true))) return;
          rosterChange(() => LL.sync.students.remove(s.id), () => { r.splice(i, 1); S.saveRoster(r); });
        } }, 'Quitar')));
    });
    page.replaceChildren(el('div.tool-page',
      el('div', el('h1', '👧 Estudiantes'), el('p.lead', 'Ellos aparecen en la pantalla «¿Quién eres?».')),
      el('div.panel', { style: { display: 'grid', gap: '12px' } },
        r.length ? list : el('p.muted', 'Todavía no hay estudiantes.'),
        el('div.media-row',
          el('button.btn.primary', { type: 'button', onclick: async () => {
            const v = await studentDialog(null); if (!v) return;
            if (dupName(v, -1)) { toast('Ya hay un estudiante con ese nombre.', 'error'); return; }
            rosterChange(() => LL.sync.students.add(v), () => { r.push(v); S.saveRoster(r); }, v.name + ' agregado.');
          } }, '＋ Agregar estudiante'),
          cloud ? el('button.btn.ghost', { type: 'button', onclick: async () => { try { await LL.sync.refreshStudents(); renderRoster(); toast('Lista actualizada.'); } catch (e) { toast(LL.auth.friendly(e), 'error'); } } }, '🔄 Actualizar lista') : null)),
      el('p.small.muted', cloud
        ? 'La lista se guarda en tu cuenta (tabla «students») y aparece en todas tus tabletas. Usa solo el primer nombre o un apodo.'
        : 'Usa solo el primer nombre o un apodo. Sin cuenta, la lista se guarda solo en este navegador.')));
  }

  /* ---------- Backup ---------- */
  const box = (...kids) => el('div.panel', { style: { display: 'grid', gap: '12px' } }, ...kids);

  function accountPanel() {
    if (!LL.cloud.enabled()) return null;
    if (!LL.cloud.signedIn()) {
      return box(el('h2', '👤 Cuenta'),
        el('p', 'Estás usando Little Learners sin cuenta: todo se guarda solo en este navegador.'),
        el('p.small.muted', 'Con una cuenta, tus quizzes se guardan en la nube y aparecen en todas tus tabletas.'),
        el('button.btn.primary', { type: 'button', style: { justifySelf: 'start' }, onclick: () => { LL.auth.setLocalMode(false); LL.app.goHome(); } }, 'Iniciar sesión'));
    }
    const u = LL.cloud.user() || {};
    const line = el('p.small');
    const draw = (st) => {
      line.textContent = st.busy || st.pending ? '🔄 Guardando en la nube…'
        : st.error === 'offline' ? '📴 Sin internet. Los cambios se subirán al volver la conexión.'
        : st.error ? '⚠️ No se pudo sincronizar: ' + st.error
        : st.lastOk ? '☁️ Todo guardado en la nube · ' + new Date(st.lastOk).toLocaleString('es-US', { dateStyle: 'short', timeStyle: 'short' }) : '☁️ Conectado';
    };
    draw(LL.sync.status());
    const off = LL.sync.onChange((st) => { if (!line.isConnected) { off(); return; } draw(st); });
    return box(el('h2', '👤 Cuenta'),
      el('p', 'Sesión iniciada como ', el('strong', u.email || '')),
      line,
      el('div.media-row',
        el('button.btn.soft', { type: 'button', onclick: async () => { const ok = await LL.sync.run(); toast(ok ? '✓ Sincronizado.' : 'No se pudo sincronizar ahora.', ok ? 'success' : 'error'); } }, '🔄 Sincronizar ahora'),
        el('button.btn.ghost', { type: 'button', onclick: () => LL.auth.signOut() }, 'Cerrar sesión')),
      el('p.small.muted', 'En cada tableta: abre la página, entra una vez con tu cuenta y la tableta queda lista. Los niños solo tocan su animalito.'));
  }

  function pinPanel() {
    const has = !!S.pinHash();
    return box(el('h2', '🔒 PIN del maestro'),
      el('p', has ? 'Hay un PIN. Se pide al mantener presionado «Maestro».' : 'Para tabletas compartidas: además de mantener presionado «Maestro», pide un PIN de números.'),
      el('div.media-row',
        el('button.btn.soft', { type: 'button', onclick: async () => { await LL.auth.setPinFlow(); renderBackup(); } }, has ? 'Cambiar PIN' : 'Crear PIN'),
        has ? el('button.btn.danger-ghost', { type: 'button', onclick: async () => { if (await confirmDialog('¿Quitar el PIN?', 'Cualquiera que mantenga presionado «Maestro» podrá entrar.', 'Quitar PIN', true)) { S.savePinHash(null); renderBackup(); } } }, 'Quitar PIN') : null),
      el('p.small.muted', 'El PIN se guarda cifrado' + (LL.cloud.signedIn() ? ' y se usa en todos tus dispositivos.' : '.')));
  }

  function voicePanel() {
    if (!LL.cloud.signedIn()) return null;
    const v = S.voice();
    const on = el('input', { type: 'checkbox', checked: v.enabled });
    on.addEventListener('change', () => { S.saveVoice({ ...S.voice(), enabled: on.checked }); renderBackup(); });
    const selF = el('select', { 'aria-label': 'Voz de mujer', disabled: true }, new Option('Cargando voces…', v.voiceId || ''));
    const selM = el('select', { 'aria-label': 'Voz de hombre', disabled: true }, new Option('Cargando voces…', v.maleVoiceId || ''));
    const usage = el('div', { style: { display: 'grid', gap: '6px' } });
    const panel = box(el('h2', '🗣️ Voz natural (ElevenLabs)'),
      el('label.switch', on, 'Usar voz natural en los quizzes'),
      el('p.small.muted', 'Al guardar un quiz, cada texto con «Voz automática» se convierte una vez en audio natural con la voz de mujer o de hombre que elegiste en ese quiz. Si no hay internet o se acaban los créditos, se usa la voz del dispositivo.'),
      el('div.voice-pick',
        el('label.field', '👩 Voz de mujer', selF, el('button.btn.sm.ghost', { type: 'button', disabled: !v.enabled, onclick: () => testVoice('female') }, '🔊 Probar')),
        el('label.field', '👨 Voz de hombre', selM, el('button.btn.sm.ghost', { type: 'button', disabled: !v.enabled, onclick: () => testVoice('male') }, '🔊 Probar'))),
      el('div.media-row',
        el('button.btn.soft', { type: 'button', disabled: !v.enabled, onclick: prepareAll }, '🗣️ Preparar voces de todos los quizzes')),
      usage,
      el('p.small.muted', 'Voces creadas con ElevenLabs (elevenlabs.io). Con el plan gratuito: solo uso no comercial y se debe mencionar a ElevenLabs.'));
    if (v.enabled) {
      LL.tts.voices().then((r) => {
        selF.replaceChildren(); selM.replaceChildren();
        if (!r || !r.voices) {
          const msg = r && r.reason === 'no_api_key' ? 'Falta la clave de ElevenLabs en Supabase' : 'No se pudieron cargar las voces';
          selF.append(new Option(msg, '')); selM.append(new Option(msg, '')); return;
        }
        const label = (x) => x.name + (x.accent ? ' · ' + x.accent : '') + (x.age ? ' · ' + x.age : '');
        const fill = (sel, gender, current) => {
          const list = r.voices.filter((x) => x.gender === gender).sort((a, b) => a.name.localeCompare(b.name));
          const others = r.voices.filter((x) => x.gender !== gender).sort((a, b) => a.name.localeCompare(b.name));
          sel.add(new Option('Automática (' + (gender === 'female' ? 'mujer' : 'hombre') + ')', ''));
          list.forEach((x) => sel.add(new Option(label(x), x.id, false, x.id === current)));
          if (others.length) { const g = document.createElement('optgroup'); g.label = 'Otras voces'; others.forEach((x) => g.append(new Option(label(x), x.id, false, x.id === current))); sel.append(g); }
          sel.value = current || '';
          sel.disabled = false;
        };
        fill(selF, 'female', v.voiceId); fill(selM, 'male', v.maleVoiceId);
      }).catch((e) => { selF.replaceChildren(new Option('Sin conexión', '')); selM.replaceChildren(new Option('Sin conexión', '')); console.warn(e); });
      selF.addEventListener('change', () => { S.saveVoice({ ...S.voice(), voiceId: selF.value }); toast('Voz de mujer cambiada. Usa «Preparar voces» para actualizar los quizzes.'); });
      selM.addEventListener('change', () => { S.saveVoice({ ...S.voice(), maleVoiceId: selM.value }); toast('Voz de hombre cambiada. Usa «Preparar voces» para actualizar los quizzes.'); });
      LL.tts.usage().then((u) => {
        if (!u || u.used == null) return;
        const pct = Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
        usage.replaceChildren(el('div.meter', el('div', { style: { width: pct + '%', background: pct > 85 ? 'var(--bad)' : 'var(--primary)' } })),
          el('p.small.muted', 'Créditos usados este mes: ' + u.used.toLocaleString('es-US') + ' de ' + u.limit.toLocaleString('es-US') + (u.resetsAt ? ' · se renuevan el ' + new Date(u.resetsAt * 1000).toLocaleDateString('es-US') : '')));
      }).catch(() => {});
    }
    return panel;
  }

  async function testVoice(gender) {
    const text = '¡Hola! Vamos a aprender juntos.';
    const voiceId = (gender === 'male' ? S.voice().maleVoiceId : S.voice().voiceId) || '';
    try {
      const r = await LL.cloud.invoke('ll-tts', { action: 'speak', text, voiceId, gender });
      if (r && r.path) { await LL.tts.play({ audioMode: 'voice', text, tts: { path: r.path, text, gender } }, gender); return; }
      toast('Voz natural no disponible (' + (r && r.reason) + '). Se usa la voz del dispositivo.', 'error');
      LL.ui.speak(text, 'es', gender);
    } catch (e) { toast(LL.auth.friendly(e), 'error'); LL.ui.speak(text, 'es', gender); }
  }

  async function prepareAll() {
    const all = S.quizzes();
    let made = 0;
    for (let i = 0; i < all.length; i++) {
      const q = all[i];
      const work = { ...q, config: S.clone(q.config) };
      toast('🗣️ ' + (i + 1) + ' de ' + all.length + ': ' + q.name);
      const r = await LL.tts.prepareQuiz(work);
      if (r.made) { S.saveQuiz({ id: q.id, name: q.name, folderId: q.folderId, config: work.config }); made += r.made; }
      if (r.skipped && !r.made) break;
    }
    toast('Listo: ' + made + ' audio(s) nuevo(s).', 'success');
    renderBackup();
  }

  /* ---------- Settings: account, PIN, voice, backup, delete ---------- */
  function renderBackup() {
    const page = $('#screen-backup');
    const used = S.storageUsed();
    const quota = 5 * 1024 * 1024; // typical localStorage limit
    const pct = Math.min(100, Math.round((used / quota) * 100));
    const nQ = S.quizzes().length, nF = S.folders().length;
    const signed = LL.cloud.signedIn();
    page.replaceChildren(el('div.tool-page',
      el('div', el('h1', '⚙️ Ajustes'), el('p.lead', signed ? 'Tu cuenta, el PIN, la voz y los respaldos.' : 'El PIN, los respaldos y los datos de este dispositivo.')),
      accountPanel(),
      pinPanel(),
      voicePanel(),
      box(el('h2', '📥 Descargar respaldo'),
        el('p', 'Guarda en un archivo todos tus quizzes (' + nQ + '), carpetas (' + nF + ') y estudiantes.'),
        el('button.btn.primary', { type: 'button', style: { justifySelf: 'start' }, onclick: () => {
          toast('Preparando respaldo…');
          LL.media.inlineBackup(S.exportBackup()).then((b) => { download('little-learners-respaldo-' + S.todayChicago() + '.json', JSON.stringify(b)); toast('Respaldo descargado.', 'success'); });
        } }, '📥 Descargar respaldo')),
      box(el('h2', '📤 Importar'),
        el('p', 'Abre un archivo de respaldo, o una carpeta que otro maestro compartió contigo.'),
        el('button.btn.soft', { type: 'button', style: { justifySelf: 'start' }, onclick: importFlow }, '📤 Elegir archivo…'),
        el('p.small.muted', 'Para compartir solo una carpeta: en «Actividades», toca ⋯ en la carpeta → «Compartir».')),
      signed ? null : box(el('h2', '📲 Pasar las actividades a una tableta sin cuenta'),
        el('ol', { style: { margin: 0, paddingLeft: '22px', display: 'grid', gap: '6px', fontWeight: 700 } },
          el('li', 'En tu computadora: «📥 Descargar respaldo».'),
          el('li', 'Copia el archivo a la tableta (Google Drive, correo o memoria USB).'),
          el('li', 'En la tableta: mantén presionado «Maestro» → «Ajustes» → «📤 Elegir archivo».'),
          el('li', 'Elige «Agregar a lo que ya tengo». ¡Listo!'))),
      el('div.panel', { style: { display: 'grid', gap: '8px' } },
        el('h3', 'Espacio usado en este navegador'),
        el('div.meter', el('div', { style: { width: pct + '%', background: pct > 80 ? 'var(--bad)' : 'var(--primary)' } })),
        el('p.small.muted', 'Aproximadamente ' + formatBytes(used) + ' de ~5 MB. Las imágenes y los audios ocupan más espacio; las imágenes nuevas se reducen automáticamente.'),
        el('button.btn.soft', { type: 'button', style: { justifySelf: 'start' }, onclick: freeSpaceFlow }, '🧹 Liberar espacio')),
      el('div.panel', { style: { display: 'grid', gap: '10px', borderColor: '#F3C3C3' } },
        el('h2', '🗑️ Borrar datos'),
        el('p', el('strong', 'Este dispositivo: '), 'borra de este navegador todos los quizzes, carpetas, estudiantes, ajustes y resultados' + (signed ? ', y cierra la sesión. Tu copia en la nube no se toca.' : '. No afecta a otros dispositivos ni a los respaldos descargados.')),
        el('button.btn.danger-ghost', { type: 'button', style: { justifySelf: 'start' }, onclick: deleteAll }, 'Borrar este dispositivo…'),
        signed ? el('p', el('strong', 'La nube: '), 'borra tus quizzes, carpetas, estudiantes y voces guardados en tu cuenta, y también de este dispositivo. Tus otras tabletas los quitarán en su siguiente sincronización.') : null,
        signed ? el('button.btn.danger-ghost', { type: 'button', style: { justifySelf: 'start' }, onclick: deleteCloud }, 'Borrar mis datos de la nube…') : null,
        signed ? el('p.small.muted', 'Para cerrar la cuenta por completo, pídeselo a quien administra esta página.') : null),
      el('p.small', el('button.link-btn', { type: 'button', onclick: () => LL.app.openInfo('privacidad') }, 'Política de privacidad'), ' · ', el('button.link-btn', { type: 'button', onclick: () => LL.app.openInfo('terminos') }, 'Términos de uso'))));
  }

  async function freeSpaceFlow() {
    const ok = await confirmDialog('¿Liberar espacio en este navegador?',
      'Se quitan las versiones antiguas de los quizzes y la copia de respaldo del quiz que se está editando' +
      (LL.cloud.signedIn() ? ', y las imágenes y audios pasan a la nube. ' : '. ') +
      'No se borra ningún quiz. Si tienes un quiz abierto en otra pestaña, no la cierres: después pulsa «Guardar» allí.', 'Liberar espacio');
    if (!ok) return;
    const before = S.storageUsed();
    S.freeSpace({ draft: true });
    if (LL.cloud.signedIn()) { toast('☁️ Pasando imágenes y audios a la nube…'); await LL.sync.run(); }
    const freed = Math.max(0, before - S.storageUsed());
    toast('Listo: se liberaron ' + formatBytes(freed) + '. Ahora usas ' + formatBytes(S.storageUsed()) + '.', 'success');
    renderBackup();
  }

  async function deleteCloud() {
    const typed = el('input', { type: 'text', placeholder: 'BORRAR', autocomplete: 'off', 'aria-label': 'Escribe BORRAR para confirmar' });
    const ok = await dialog({
      title: '¿Borrar tus datos de la nube?',
      body: el('div', { style: { display: 'grid', gap: '10px' } },
        el('p', 'Se borrarán de tu cuenta todos los quizzes, carpetas, estudiantes, ajustes y voces. Tus otras tabletas dejarán de recibirlos. Esto no se puede deshacer.'),
        el('label.field', 'Para confirmar, escribe BORRAR', typed)),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: 'Borrar de la nube', kind: 'danger', value: () => (typed.value.trim().toUpperCase() === 'BORRAR' ? true : (toast('Escribe BORRAR para confirmar.', 'error'), typed.focus(), undefined)) }],
    });
    if (!ok) return;
    try { await LL.sync.deleteCloudData(); toast('Tus datos de la nube se borraron.', 'success'); renderBackup(); }
    catch (e) { toast('No se pudo borrar: ' + LL.auth.friendly(e), 'error'); }
  }

  async function deleteAll() {
    const typed = el('input', { type: 'text', placeholder: 'BORRAR', autocomplete: 'off', 'aria-label': 'Escribe BORRAR para confirmar' });
    const ok = await dialog({
      title: '¿Borrar todo?',
      body: el('div', { style: { display: 'grid', gap: '10px' } },
        el('p', 'Esto no se puede deshacer. Si quieres conservar tus actividades, primero descarga un respaldo.'),
        el('label.field', 'Para confirmar, escribe BORRAR', typed)),
      actions: [
        { label: 'Cancelar', kind: 'ghost', value: false },
        { label: '📥 Descargar respaldo primero', kind: 'soft', value: () => { LL.media.inlineBackup(S.exportBackup()).then((b) => { download('little-learners-respaldo-' + S.todayChicago() + '.json', JSON.stringify(b)); toast('Respaldo descargado.', 'success'); }); } },
        { label: 'Borrar todo', kind: 'danger', value: () => (typed.value.trim().toUpperCase() === 'BORRAR' ? true : (toast('Escribe BORRAR para confirmar.', 'error'), typed.focus(), undefined)) },
      ],
    });
    if (!ok) return;
    S.deleteAllData();
    toast('Se borraron todos los datos de este dispositivo.', 'success');
    LL.app.goHome();
  }

  async function importFlow() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('No se pudo leer ese archivo.', 'error'); return; }
    if (!S.validateBackup(data)) { toast('Este archivo no es un respaldo de Little Learners Activities.', 'error'); return; }
    const lib = data.data[S.KEYS.library] || [], fol = data.data[S.KEYS.folders] || [];
    const nQ = lib.filter(S.isActivity).length;
    const isFolder = data.kind === 'folder';
    const actions = [{ label: 'Cancelar', kind: 'ghost', value: null }];
    if (!isFolder) actions.push({ label: 'Reemplazar todo', kind: 'danger-ghost', value: 'replace' });
    actions.push({ label: 'Agregar a lo que ya tengo', kind: 'primary', value: 'merge' });
    const mode = await dialog({
      title: isFolder ? 'Importar carpeta compartida' : 'Importar respaldo',
      body: el('div', { style: { display: 'grid', gap: '8px' } },
        el('p', 'El archivo tiene ' + nQ + ' quiz(zes) y ' + fol.length + ' carpeta(s).'),
        el('p.small.muted', '«Agregar» conserva todo lo que ya tienes. ' + (isFolder ? '' : '«Reemplazar todo» borra lo de este navegador y deja solo lo del archivo.'))),
      actions,
    });
    if (!mode) return;
    if (mode === 'replace' && !(await confirmDialog('¿Reemplazar todo?', 'Se borrarán los quizzes y carpetas de este navegador que no estén en el archivo.', 'Reemplazar', true))) return;
    try {
      const cloudRoster = LL.cloud.signedIn() ? S.roster() : null;
      const r = S.importBackup(data, mode);
      S.mergeDuplicateFolders();
      // Signed in: students from the file are added to the class list in the database.
      if (cloudRoster) {
        const have = new Set(cloudRoster.map((x) => x.name.toLocaleLowerCase('es')));
        S.quietly(() => S.saveRoster(cloudRoster));
        for (const st of data.data[S.KEYS.roster] || []) {
          if (st && st.name && !have.has(String(st.name).toLocaleLowerCase('es'))) { have.add(String(st.name).toLocaleLowerCase('es')); await LL.sync.students.add({ name: String(st.name).slice(0, 40), animal: st.animal, avatar: st.avatar || '' }); }
        }
        LL.sync.run();
      }
      toast('Importado: ' + r.quizzes + ' quiz(zes) y ' + r.folders + ' carpeta(s).', 'success');
      renderBackup();
    } catch (e) { toast(e.message, 'error'); }
  }

  LL.teacher = { renderRoster, renderBackup, avatar };
})();
