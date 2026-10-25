/* Teacher tools: students, backup / sharing, and Sonidos iniciales settings. */
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

  async function studentDialog(existing) {
    let animal = existing ? existing.animal : S.ANIMALS[0];
    const name = el('input', { type: 'text', maxlength: '22', placeholder: 'Nombre', value: existing ? existing.name : '' });
    const ok = await dialog({
      title: existing ? 'Editar estudiante' : 'Agregar estudiante',
      body: el('div', { style: { display: 'grid', gap: '14px' } }, el('label.field', 'Nombre', name), el('div.field', 'Animalito', animalPicker(animal, (a) => { animal = a; }))),
      actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: existing ? 'Guardar' : 'Agregar', kind: 'primary', value: () => (name.value.trim() ? true : (name.focus(), undefined)) }],
    });
    return ok ? { name: name.value.trim(), animal } : null;
  }

  function renderRoster() {
    const page = $('#screen-students-admin');
    const r = S.roster();
    const list = el('div.roster-list');
    r.forEach((s, i) => {
      list.append(el('div.roster-row',
        el('span.animal', s.animal), el('span.nm', s.name),
        el('button.icon-btn', { type: 'button', 'aria-label': 'Subir', disabled: i === 0, onclick: () => { [r[i - 1], r[i]] = [r[i], r[i - 1]]; S.saveRoster(r); renderRoster(); } }, '⬆️'),
        el('button.btn.sm.ghost', { type: 'button', onclick: async () => {
          const v = await studentDialog(s); if (!v) return;
          if (r.some((x, k) => k !== i && x.name.toLowerCase() === v.name.toLowerCase())) { toast('Ya hay un estudiante con ese nombre.', 'error'); return; }
          r[i] = v; S.saveRoster(r); renderRoster();
        } }, '✏️ Editar'),
        el('button.btn.sm.danger-ghost', { type: 'button', onclick: async () => {
          if (!(await confirmDialog('¿Quitar a ' + s.name + '?', 'Ya no aparecerá en «¿Quién eres?».', 'Quitar', true))) return;
          r.splice(i, 1); S.saveRoster(r); renderRoster();
        } }, 'Quitar')));
    });
    page.replaceChildren(el('div.tool-page',
      el('div', el('h1', '👧 Estudiantes'), el('p.lead', 'Ellos aparecen en la pantalla «¿Quién eres?».')),
      el('div.panel', { style: { display: 'grid', gap: '12px' } },
        r.length ? list : el('p.muted', 'Todavía no hay estudiantes.'),
        el('button.btn.primary', { type: 'button', style: { justifySelf: 'start' }, onclick: async () => {
          const v = await studentDialog(null); if (!v) return;
          if (r.some((x) => x.name.toLowerCase() === v.name.toLowerCase())) { toast('Ya hay un estudiante con ese nombre.', 'error'); return; }
          r.push(v); S.saveRoster(r); renderRoster(); toast(v.name + ' agregado.', 'success');
        } }, '＋ Agregar estudiante')),
      el('p.small.muted', 'Usa solo el primer nombre o un apodo. La lista se guarda solo en este navegador.')));
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
    const sel = el('select', { 'aria-label': 'Voz', disabled: !v.enabled });
    sel.append(new Option('Cargando voces…', v.voiceId || ''));
    const usage = el('div', { style: { display: 'grid', gap: '6px' } });
    const panel = box(el('h2', '🗣️ Voz natural (ElevenLabs)'),
      el('label.switch', on, 'Usar voz natural en los quizzes'),
      el('p.small.muted', 'Al guardar un quiz, cada texto con «Voz automática» se convierte una vez en audio natural. Si no hay internet o se acaban los créditos, se usa la voz del dispositivo.'),
      el('label.field', 'Voz', sel),
      el('div.media-row',
        el('button.btn.ghost', { type: 'button', disabled: !v.enabled, onclick: testVoice }, '🔊 Probar voz'),
        el('button.btn.soft', { type: 'button', disabled: !v.enabled, onclick: prepareAll }, '🗣️ Preparar voces de todos los quizzes')),
      usage,
      el('p.small.muted', 'Voces creadas con ElevenLabs (elevenlabs.io). Con el plan gratuito: solo uso no comercial y se debe mencionar a ElevenLabs.'));
    if (v.enabled) {
      LL.tts.voices().then((r) => {
        sel.replaceChildren();
        if (!r || !r.voices) { sel.append(new Option(r && r.reason === 'no_api_key' ? 'Falta la clave de ElevenLabs en Supabase' : 'No se pudieron cargar las voces', '')); return; }
        const current = v.voiceId || r.defaultVoice;
        r.voices.sort((a, b) => a.name.localeCompare(b.name)).forEach((x) => sel.add(new Option(x.name + (x.gender ? ' · ' + (x.gender === 'female' ? 'mujer' : x.gender === 'male' ? 'hombre' : x.gender) : '') + (x.accent ? ' · ' + x.accent : ''), x.id, false, x.id === current)));
        sel.disabled = false;
      }).catch((e) => { sel.replaceChildren(new Option('Sin conexión', '')); console.warn(e); });
      sel.addEventListener('change', () => { S.saveVoice({ ...S.voice(), voiceId: sel.value }); toast('Voz cambiada. Usa «Preparar voces» para actualizar los quizzes.'); });
      LL.tts.usage().then((u) => {
        if (!u || u.used == null) return;
        const pct = Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
        usage.replaceChildren(el('div.meter', el('div', { style: { width: pct + '%', background: pct > 85 ? 'var(--bad)' : 'var(--primary)' } })),
          el('p.small.muted', 'Créditos usados este mes: ' + u.used.toLocaleString('es-US') + ' de ' + u.limit.toLocaleString('es-US') + (u.resetsAt ? ' · se renuevan el ' + new Date(u.resetsAt * 1000).toLocaleDateString('es-US') : '')));
      }).catch(() => {});
    }
    return panel;
  }

  async function testVoice() {
    const text = S.voice().voiceId ? '¡Hola! Vamos a aprender juntos.' : '¡Hola! Vamos a aprender juntos.';
    try {
      const r = await LL.cloud.invoke('ll-tts', { action: 'speak', text, voiceId: S.voice().voiceId || '' });
      if (r && r.path) { await LL.tts.play({ audioMode: 'voice', text, tts: { path: r.path, text } }); return; }
      toast('Voz natural no disponible (' + (r && r.reason) + '). Se usa la voz del dispositivo.', 'error');
      LL.ui.speak(text, 'es');
    } catch (e) { toast(LL.auth.friendly(e), 'error'); }
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
          download('little-learners-respaldo-' + S.todayChicago() + '.json', JSON.stringify(S.exportBackup()));
          toast('Respaldo descargado.', 'success');
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
        el('p.small.muted', 'Aproximadamente ' + formatBytes(used) + ' de ~5 MB. Las imágenes y los audios ocupan más espacio; las imágenes nuevas se reducen automáticamente.')),
      el('div.panel', { style: { display: 'grid', gap: '10px', borderColor: '#F3C3C3' } },
        el('h2', '🗑️ Borrar datos'),
        el('p', el('strong', 'Este dispositivo: '), 'borra de este navegador todos los quizzes, carpetas, estudiantes, ajustes y resultados' + (signed ? ', y cierra la sesión. Tu copia en la nube no se toca.' : '. No afecta a otros dispositivos ni a los respaldos descargados.')),
        el('button.btn.danger-ghost', { type: 'button', style: { justifySelf: 'start' }, onclick: deleteAll }, 'Borrar este dispositivo…'),
        signed ? el('p', el('strong', 'La nube: '), 'borra tus quizzes, carpetas, estudiantes y voces guardados en tu cuenta, y también de este dispositivo. Tus otras tabletas los quitarán en su siguiente sincronización.') : null,
        signed ? el('button.btn.danger-ghost', { type: 'button', style: { justifySelf: 'start' }, onclick: deleteCloud }, 'Borrar mis datos de la nube…') : null,
        signed ? el('p.small.muted', 'Para cerrar la cuenta por completo, pídeselo a quien administra esta página.') : null),
      el('p.small', el('button.link-btn', { type: 'button', onclick: () => LL.app.openInfo('privacidad') }, 'Política de privacidad'), ' · ', el('button.link-btn', { type: 'button', onclick: () => LL.app.openInfo('terminos') }, 'Términos de uso'))));
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
        { label: '📥 Descargar respaldo primero', kind: 'soft', value: () => { download('little-learners-respaldo-' + S.todayChicago() + '.json', JSON.stringify(S.exportBackup())); toast('Respaldo descargado.', 'success'); } },
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
    const nQ = lib.filter((x) => x.type === 'quiz').length;
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
      const r = S.importBackup(data, mode);
      toast('Importado: ' + r.quizzes + ' quiz(zes) y ' + r.folders + ' carpeta(s).', 'success');
      renderBackup();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------- Sonidos iniciales ---------- */
  function syncImages(c, force) {
    const bank = LL.IMAGE_BANK[c.lang];
    const prev = !force && c.fixedImages && c.fixedImagesLang === c.lang ? c.fixedImages : {};
    const out = {};
    for (const letter of c.letters) {
      const options = bank[letter];
      const keep = [];
      for (const it of prev[letter] || []) if (options.some(([e, w]) => e === it[0] && w === it[1]) && !keep.some((k) => k[1] === it[1])) keep.push(it);
      const free = LL.ui.shuffle(options.filter(([, w]) => !keep.some((k) => k[1] === w)));
      out[letter] = [...keep.slice(0, c.per), ...free.slice(0, Math.max(0, c.per - keep.length))];
    }
    c.fixedImages = out;
    c.fixedImagesLang = c.lang;
  }

  function renderSonidos() {
    const page = $('#screen-sonidos-admin');
    const c = S.sonidos();
    if (!c.fixedImages) { syncImages(c); S.saveSonidos(c); }
    const commit = (redrawImages) => { if (redrawImages) syncImages(c); S.saveSonidos(c); renderSonidos(); };

    const show = el('input', { type: 'checkbox', checked: !!c.showToStudents });
    show.addEventListener('change', () => { c.showToStudents = show.checked; commit(false); toast(show.checked ? 'Los estudiantes ya ven «Sonidos iniciales».' : '«Sonidos iniciales» quedó oculto para los estudiantes.'); });

    const seg = (opts, val, fn) => {
      const w = el('div.segmented');
      for (const [v, label] of opts) w.append(el('button', { type: 'button', 'aria-pressed': String(String(v) === String(val)), onclick: () => fn(v) }, label));
      return w;
    };

    const letters = el('div.letters');
    for (const L of 'MPSLF') {
      const cb = el('input', { type: 'checkbox', checked: c.letters.includes(L) });
      cb.addEventListener('change', () => {
        const next = 'MPSLF'.split('').filter((x) => (x === L ? cb.checked : c.letters.includes(x)));
        if (!next.length) { cb.checked = true; toast('Elige al menos una letra.', 'error'); return; }
        c.letters = next; commit(true);
      });
      letters.append(el('label', cb, L));
    }

    const per = el('select', { style: { maxWidth: '140px' } });
    for (const n of [4, 5, 6, 7, 8]) per.append(new Option(String(n), String(n), false, n === c.per));
    per.addEventListener('change', () => { c.per = Number(per.value); commit(true); });

    const groups = el('div.image-groups');
    for (const L of c.letters) {
      const slots = el('div.image-slots');
      (c.fixedImages[L] || []).forEach(([emoji, word], idx) => {
        const sel = el('select', { 'aria-label': 'Letra ' + L + ', imagen ' + (idx + 1) });
        LL.IMAGE_BANK[c.lang][L].forEach(([e, w], k) => sel.add(new Option(e + ' ' + w, String(k), false, e === emoji && w === word)));
        sel.addEventListener('change', () => {
          const pick = LL.IMAGE_BANK[c.lang][L][Number(sel.value)];
          if (c.fixedImages[L].some((it, j) => j !== idx && it[1] === pick[1])) { toast('Esa imagen ya está elegida para esta letra.', 'error'); renderSonidos(); return; }
          c.fixedImages[L][idx] = [...pick]; commit(false);
        });
        slots.append(sel);
      });
      groups.append(el('div', el('h3', 'Letra ' + L), slots));
    }

    page.replaceChildren(el('div.tool-page',
      el('div', el('h1', '🔤 Sonidos iniciales'), el('p.lead', 'La actividad original de arrastrar dibujos a su letra. Los cambios se guardan solos.')),
      el('div.panel', { style: { display: 'grid', gap: '16px' } },
        el('div.field', el('label.switch', show, 'Mostrar a los estudiantes'), el('span.hint', 'Aparece como una tarjeta más en sus actividades.')),
        el('div.field', 'Letras', letters),
        el('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } },
          el('div.field', 'Idioma', seg([['es', 'Español'], ['en', 'English']], c.lang, (v) => { c.lang = v; commit(true); })),
          el('div.field', 'Modalidad', seg([['practice', 'Práctica'], ['assessment', 'Evaluación']], c.mode, (v) => { c.mode = v; commit(false); })),
          el('div.field', 'Velocidad', seg([[28, 'Lenta'], [45, 'Normal'], [70, 'Rápida']], c.speed, (v) => { c.speed = Number(v); commit(false); })),
          el('label.field', 'Imágenes por letra', per)),
        el('button.btn.primary', { type: 'button', style: { justifySelf: 'start' }, onclick: () => LL.app.openSonidos() }, '▶️ Probar')),
      el('div.panel', { style: { display: 'grid', gap: '12px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          el('h2', '🖼️ Imágenes'),
          el('button.btn.sm.ghost', { type: 'button', onclick: () => { syncImages(c, true); S.saveSonidos(c); renderSonidos(); } }, '🎲 Otra selección')),
        el('p.small.muted', 'Siempre salen estas mismas imágenes, aunque cambie su orden.'),
        groups)));
  }

  LL.teacher = { renderRoster, renderBackup, renderSonidos };
})();
