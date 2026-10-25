/* Little Learners Activities — data layer.
 *
 * Everything is saved in this browser's localStorage, using the SAME keys and
 * the SAME object shapes as V121, so quizzes and folders made in earlier
 * versions open here unchanged.
 *
 *   ll-activities-v10-templates  quizzes (type:'quiz') and older quick_sort templates
 *   ll-activities-v90-folders    folders {id, name, parentId, color}
 *   ll-demo-v2:<date>:red:<cfg>  daily Sonidos iniciales scores (unchanged from V121)
 *
 * New in V122 (new keys only, nothing old is rewritten):
 *   ll-v122-roster               students shown on the "¿Quién eres?" screen
 *   ll-v122-sonidos              Sonidos iniciales settings
 *   ll-v122-editor-draft         unsaved quiz-editor work, for recovery
 */
window.LL = window.LL || {};
(function () {
  const KEYS = {
    library: 'll-activities-v10-templates',
    folders: 'll-activities-v90-folders',
    roster: 'll-v122-roster',
    sonidos: 'll-v122-sonidos',
    draft: 'll-v122-editor-draft',
    pin: 'll-v122-pin',               // hashed teacher PIN for shared tablets
    voice: 'll-v122-voice',           // { enabled, voiceId } for the ElevenLabs voice
    settingsAt: 'll-v122-settings-at',
  };
  // Keys that are copied to the teacher's cloud account when signed in.
  const SYNCED = new Set([KEYS.library, KEYS.folders, KEYS.roster, KEYS.sonidos, KEYS.pin, KEYS.voice]);
  const SETTINGS = new Set([KEYS.roster, KEYS.sonidos, KEYS.pin, KEYS.voice]);
  let applyingRemote = false;
  /** Run fn without telling the sync module (used when applying data downloaded from the cloud). */
  function quietly(fn) { applyingRemote = true; try { return fn(); } finally { applyingRemote = false; } }
  const nowISO = () => new Date().toISOString();

  const DEFAULT_ROSTER = [
    { name: 'Abigail', animal: '🐱' }, { name: 'Daniel', animal: '🦖' },
    { name: 'Camila', animal: '🦋' }, { name: 'Lucas', animal: '🦆' },
    { name: 'Emma', animal: '🐼' }, { name: 'Mateo', animal: '🐸' },
  ];

  const DEFAULT_SONIDOS = {
    lang: 'es', per: 8, speed: 45, mode: 'practice',
    letters: ['M', 'P', 'S', 'L', 'F'], fixedImages: null, showToStudents: false,
  };

  const FOLDER_COLORS = [
    ['Rosa', '#F6D6D6'], ['Melocotón', '#F9DEC9'], ['Amarillo', '#F8EDB8'],
    ['Verde menta', '#CDEBDD'], ['Verde suave', '#DCECCB'], ['Celeste', '#CFE8F7'],
    ['Azul lavanda', '#D9DDF7'], ['Lila', '#E9D5F5'], ['Lavanda rosada', '#F3D8E8'],
    ['Gris claro', '#E7E9ED'],
  ];

  const ANIMALS = ['🐱', '🐶', '🦖', '🦆', '🐸', '🐼', '🦋', '🦁', '🐰', '🐻', '🐨', '🐯', '🐵', '🐧', '🐢', '🐙', '🦄', '🐝', '🐞', '🦊', '🐮', '🐷', '🐳', '🦒'];

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch { return fallback; }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (!applyingRemote && SYNCED.has(key)) {
        if (SETTINGS.has(key)) localStorage.setItem(KEYS.settingsAt, JSON.stringify(nowISO()));
        if (LL.sync) LL.sync.schedule();
      }
      return true;
    } catch (e) {
      LL.ui && LL.ui.toast('No se pudo guardar. El almacenamiento del navegador podría estar lleno.', 'error');
      console.warn('Save failed', key, e);
      return false;
    }
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const uid = (prefix) => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });

  /* ---------- Library (quizzes) ---------- */
  function readLibrary() {
    const a = readJSON(KEYS.library, []);
    return Array.isArray(a) ? a : [];
  }
  function writeLibrary(a) { return writeJSON(KEYS.library, a); }

  /** Latest version of every quiz family (same rule as V121). */
  function quizzes() {
    const latest = new Map();
    for (const t of readLibrary()) {
      if (t.type !== 'quiz') continue;
      const fam = t.familyId || t.id;
      const old = latest.get(fam);
      if (!old || Number(t.version) > Number(old.version)) {
        latest.set(fam, old ? { ...t, folderId: t.folderId || old.folderId || null } : t);
      } else if (!old.folderId && t.folderId) {
        old.folderId = t.folderId;
      }
    }
    return [...latest.values()].sort(byName);
  }

  function getQuiz(id) { return quizzes().find((q) => q.id === id) || null; }

  /** A quiz is shown to students only when it is marked visible and has questions. */
  function isReady(q) {
    return q && q.config && q.config.visibility === 'visible' &&
      Array.isArray(q.config.questions) && q.config.questions.length > 0;
  }

  /** Create or update a quiz in place (V121 behavior: same id, same version). */
  function saveQuiz(quiz) {
    const all = readLibrary();
    const now = new Date().toISOString();
    const idx = quiz.id ? all.findIndex((x) => x.id === quiz.id && x.type === 'quiz') : -1;
    if (idx >= 0) {
      all[idx] = { ...all[idx], name: quiz.name, config: clone(quiz.config), updatedAt: now };
    } else {
      const id = uid('quiz');
      quiz.id = id;
      all.push({ id, familyId: id, type: 'quiz', name: quiz.name, version: 1, folderId: quiz.folderId || null, config: clone(quiz.config), createdAt: now, updatedAt: now });
    }
    return writeLibrary(all) ? quiz.id : null;
  }

  function duplicateQuiz(id) {
    const q = getQuiz(id);
    if (!q) return null;
    const names = new Set(quizzes().map((x) => x.name));
    let name = q.name + ' (copia)', n = 2;
    while (names.has(name)) name = q.name + ' (copia ' + (n++) + ')';
    const copy = { name, folderId: q.folderId || null, config: { ...clone(q.config), visibility: 'hidden' } };
    return saveQuiz(copy);
  }

  /** Deletes every saved version of the quiz, so an older one can't reappear. */
  function deleteQuiz(id) {
    const all = readLibrary();
    const t = all.find((x) => x.id === id);
    if (!t) return false;
    const fam = t.familyId || t.id;
    return writeLibrary(all.filter((x) => (x.familyId || x.id) !== fam));
  }

  function moveQuiz(id, folderId) {
    const all = readLibrary();
    const t = all.find((x) => x.id === id);
    if (!t) return false;
    const fam = t.familyId || t.id;
    const now = nowISO();
    all.forEach((x) => { if ((x.familyId || x.id) === fam) { x.folderId = folderId || null; x.updatedAt = now; } });
    return writeLibrary(all);
  }

  /* ---------- Folders ---------- */
  function folders() {
    const a = readJSON(KEYS.folders, []);
    return Array.isArray(a) ? a : [];
  }
  function writeFolders(a) { return writeJSON(KEYS.folders, a); }
  function getFolder(id) { return folders().find((f) => f.id === id) || null; }

  function saveFolder(folder) {
    const all = folders();
    const f = folder.id && all.find((x) => x.id === folder.id);
    if (f) { f.name = folder.name; f.color = folder.color; f.updatedAt = nowISO(); }
    else all.push({ id: 'folder-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), name: folder.name, parentId: folder.parentId || null, color: folder.color, updatedAt: nowISO() });
    return writeFolders(all);
  }

  const folderKey = (name) => String(name || '').trim().toLocaleLowerCase('es').normalize('NFC');
  /** Creation time encoded in ids like "folder-1792914497974-abcde" (used to pick the original). */
  const folderBorn = (f) => { const m = /(\d{10,})/.exec(f.id || ''); return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER; };

  /** Is there already a folder with this name in the same place? */
  function folderNameTaken(name, parentId, exceptId) {
    const k = folderKey(name);
    return folders().some((f) => f.id !== exceptId && (f.parentId || null) === (parentId || null) && folderKey(f.name) === k);
  }

  /** Join folders that have the same name in the same place (e.g. after bringing in old
   *  activities). The oldest one is kept; everything inside the others moves into it.
   *  Every device picks the same folder, so tablets agree. Returns how many were merged. */
  function mergeDuplicateFolders() {
    let all = folders(), lib = readLibrary(), merged = 0, guard = 0, changed = true;
    const now = nowISO();
    while (changed && guard++ < 20) {
      changed = false;
      const groups = new Map();
      for (const f of all) {
        const k = (f.parentId || '') + '\u0000' + folderKey(f.name);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(f);
      }
      for (const g of groups.values()) {
        if (g.length < 2) continue;
        g.sort((a, b) => folderBorn(a) - folderBorn(b) || String(a.id).localeCompare(String(b.id)));
        const keep = g[0];
        for (const dup of g.slice(1)) {
          all.forEach((x) => { if (x.parentId === dup.id) { x.parentId = keep.id; x.updatedAt = now; } });
          lib.forEach((x) => { if (x.folderId === dup.id) { x.folderId = keep.id; x.updatedAt = now; } });
          all = all.filter((x) => x.id !== dup.id);
          merged++; changed = true;
        }
      }
    }
    if (merged) { writeLibrary(lib); writeFolders(all); }
    return merged;
  }

  /** Delete a folder; anything inside moves up to its parent so nothing is lost. */
  function deleteFolder(id) {
    const all = folders();
    const f = all.find((x) => x.id === id);
    if (!f) return false;
    const parent = f.parentId || null;
    const now = nowISO();
    all.forEach((x) => { if (x.parentId === id) { x.parentId = parent; x.updatedAt = now; } });
    const lib = readLibrary();
    lib.forEach((x) => { if (x.folderId === id) { x.folderId = parent; x.updatedAt = now; } });
    return writeLibrary(lib) && writeFolders(all.filter((x) => x.id !== id));
  }

  function moveFolder(id, parentId) {
    const all = folders();
    const f = all.find((x) => x.id === id);
    if (!f) return false;
    // Prevent moving a folder inside itself or one of its own subfolders.
    let p = parentId;
    while (p) { if (p === id) return false; p = (all.find((x) => x.id === p) || {}).parentId; }
    f.parentId = parentId || null;
    f.updatedAt = nowISO();
    const ok = writeFolders(all);
    mergeDuplicateFolders(); // moving next to a folder with the same name joins them
    return ok;
  }

  /** ["Mis actividades", "Español", "Letras"] style trail for a folder id. */
  function folderTrail(id) {
    const all = folders(), trail = [];
    let cur = id, guard = 0;
    while (cur && guard++ < 50) {
      const f = all.find((x) => x.id === cur);
      if (!f) break;
      trail.unshift(f);
      cur = f.parentId;
    }
    return trail;
  }

  function folderPathLabel(f) { return folderTrail(f.id).map((x) => x.name).join(' / '); }

  /** True when the folder (or any subfolder) contains at least one of `entries`. */
  function folderHas(id, allFolders, entries) {
    return entries.some((t) => (t.folderId || null) === id) ||
      allFolders.some((f) => (f.parentId || null) === id && folderHas(f.id, allFolders, entries));
  }

  /* ---------- Roster ---------- */
  function roster() {
    const r = readJSON(KEYS.roster, null);
    return Array.isArray(r) ? r : clone(DEFAULT_ROSTER);
  }
  function saveRoster(r) { return writeJSON(KEYS.roster, r); }

  /* ---------- Sonidos iniciales ---------- */
  function sonidos() { return { ...DEFAULT_SONIDOS, ...readJSON(KEYS.sonidos, {}) }; }
  function saveSonidos(s) { return writeJSON(KEYS.sonidos, s); }

  function todayChicago() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${v.year}-${v.month}-${v.day}`;
  }
  // Same key format as V121, so today's ranking keeps working.
  function sonidosScoreKey(c) {
    return 'll-demo-v2:' + todayChicago() + ':red:' + JSON.stringify([c.lang, c.per, c.letters.slice().sort(), c.mode]);
  }
  function sonidosScores(c) { return readJSON(sonidosScoreKey(c), {}); }
  function saveSonidosScores(c, data) { return writeJSON(sonidosScoreKey(c), data); }

  /* ---------- Teacher PIN and voice ---------- */
  function pinHash() { return readJSON(KEYS.pin, null); }
  function savePinHash(h) { return writeJSON(KEYS.pin, h || null); }
  function voice() { return { enabled: true, voiceId: '', ...readJSON(KEYS.voice, {}) }; }
  function saveVoice(v) { return writeJSON(KEYS.voice, v); }
  function settingsAt() { return readJSON(KEYS.settingsAt, null); }

  /* ---------- Draft (unsaved editor work) ---------- */
  function readDraft() { return readJSON(KEYS.draft, null); }
  function writeDraft(d) { try { localStorage.setItem(KEYS.draft, JSON.stringify(d)); } catch { /* best effort */ } }
  function clearDraft() { try { localStorage.removeItem(KEYS.draft); } catch { /* ignore */ } }

  /* ---------- Backup ---------- */
  const BACKUP_KEYS = [KEYS.library, KEYS.folders, KEYS.roster, KEYS.sonidos];

  function exportBackup(folderId) {
    let lib = readLibrary(), fol = folders();
    if (folderId) {
      // Export one folder (with its subfolders and quizzes) to share with another teacher.
      const ids = new Set([folderId]);
      let grew = true;
      while (grew) { grew = false; for (const f of fol) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }
      fol = fol.filter((f) => ids.has(f.id)).map((f) => (f.id === folderId ? { ...f, parentId: null } : f));
      lib = lib.filter((t) => t.type === 'quiz' && ids.has(t.folderId));
      return { app: 'little-learners-activities', format: 1, exportedAt: new Date().toISOString(), kind: 'folder', data: { [KEYS.library]: lib, [KEYS.folders]: fol } };
    }
    const data = {};
    for (const k of BACKUP_KEYS) { const v = readJSON(k, null); if (v != null) data[k] = v; }
    return { app: 'little-learners-activities', format: 1, exportedAt: new Date().toISOString(), kind: 'all', data };
  }

  function validateBackup(b) {
    return b && b.app === 'little-learners-activities' && b.data && typeof b.data === 'object';
  }

  /** mode 'merge' adds/updates by id; mode 'replace' overwrites everything in the file. */
  function importBackup(b, mode) {
    if (!validateBackup(b)) throw new Error('Este archivo no es un respaldo de Little Learners Activities.');
    const d = b.data;
    const mergeById = (current, incoming) => {
      const map = new Map(current.map((x) => [x.id, x]));
      for (const x of incoming) {
        const old = map.get(x.id);
        if (!old || !old.updatedAt || !x.updatedAt || x.updatedAt >= old.updatedAt) map.set(x.id, x);
      }
      return [...map.values()];
    };
    const counts = { quizzes: 0, folders: 0 };
    if (Array.isArray(d[KEYS.library])) {
      counts.quizzes = d[KEYS.library].filter((x) => x.type === 'quiz').length;
      writeLibrary(mode === 'replace' ? d[KEYS.library] : mergeById(readLibrary(), d[KEYS.library]));
    }
    if (Array.isArray(d[KEYS.folders])) {
      counts.folders = d[KEYS.folders].length;
      writeFolders(mode === 'replace' ? d[KEYS.folders] : mergeById(folders(), d[KEYS.folders]));
    }
    if (Array.isArray(d[KEYS.roster])) {
      if (mode === 'replace') saveRoster(d[KEYS.roster]);
      else {
        const r = roster();
        for (const s of d[KEYS.roster]) if (!r.some((x) => x.name.toLowerCase() === String(s.name).toLowerCase())) r.push(s);
        saveRoster(r);
      }
    }
    if (d[KEYS.sonidos] && mode === 'replace') saveSonidos(d[KEYS.sonidos]);
    return counts;
  }

  /** Approximate bytes used by this app in localStorage. */
  function storageUsed() {
    let n = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ll-')) n += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
    } catch { /* ignore */ }
    return n;
  }

  /** Removes every Little Learners key (all versions) from this browser. */
  function deleteAllData() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('ll-')) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
    // Keep the student list empty instead of falling back to the demo names.
    quietly(() => writeJSON(KEYS.roster, []));
    return keys.length;
  }

  /* ---------- Quiz helpers ---------- */
  function newOption() {
    return { id: uid('quiz'), text: '', readTextEnabled: false, readText: '', audioMode: 'none', image: '', audio: '', correct: false };
  }
  function newQuestion(optionCount = 4) {
    return { id: uid('quiz'), text: '', readTextEnabled: false, readText: '', audioMode: 'voice', emoji: '', image: '', audio: '', correctCount: 1, options: Array.from({ length: optionCount }, newOption) };
  }
  function newQuiz(folderId) {
    return { id: null, name: '', folderId: folderId || null, config: { lang: 'es', mode: 'practice', questionOrder: 'fixed', answerOrder: 'fixed', visibility: 'hidden', coverImage: '', questions: [newQuestion()] } };
  }

  /** Returns '' when the question is complete, otherwise a short message. Same rules as V121. */
  function questionProblem(q) {
    const visible = String(q.text || '').trim() || String(q.image || '').trim() || String(q.emoji || '').trim();
    const altVoice = q.readTextEnabled && String(q.readText || '').trim() && (q.audioMode || 'voice') === 'voice';
    const fileAudio = q.audioMode === 'file' && String(q.audio || '').startsWith('data:audio/');
    if (!(visible || altVoice || fileAudio)) return 'Escribe la pregunta, agrega una imagen o un audio.';
    if (q.options.length < 2 || q.options.length > 6) return 'Cada pregunta necesita de 2 a 6 respuestas.';
    const empty = q.options.map((o, i) => (!(String(o.text || '').trim() || o.image || o.audio) ? String.fromCharCode(65 + i) : null)).filter(Boolean);
    if (empty.length) return 'Completa la respuesta ' + empty.join(', ') + '.';
    const correct = q.options.filter((o) => o.correct).length;
    if (correct === 0) return 'Marca cuál es la respuesta correcta.';
    if (correct > 2) return 'Marca como máximo 2 respuestas correctas.';
    if (q.options.length === 2 && correct > 1) return 'Con 2 respuestas, solo una puede ser correcta.';
    return '';
  }

  LL.store = {
    KEYS, FOLDER_COLORS, ANIMALS, clone, uid, byName,
    readLibrary, quizzes, getQuiz, isReady, saveQuiz, duplicateQuiz, deleteQuiz, moveQuiz,
    folders, getFolder, saveFolder, deleteFolder, moveFolder, folderNameTaken, mergeDuplicateFolders, folderTrail, folderPathLabel, folderHas,
    roster, saveRoster, sonidos, saveSonidos, pinHash, savePinHash, voice, saveVoice, settingsAt, quietly, readJSON, writeJSON, writeLibrary, writeFolders, sonidosScores, saveSonidosScores, todayChicago,
    readDraft, writeDraft, clearDraft,
    exportBackup, importBackup, validateBackup, storageUsed, deleteAllData,
    newOption, newQuestion, newQuiz, questionProblem,
  };
})();
