/* Cloud sync with the Supabase database (V123).
 *
 * Where things live in the database:
 *   students                      the class list (name, animal, optional picture)
 *   folders                       folders of activities
 *   quizzes / quiz_questions /    each quiz, its questions and its answer options
 *   quiz_options
 *   storage bucket "quiz-media"   pictures and audio files
 *   ll_settings                   PIN, voice and Sonidos iniciales settings
 *
 * The app keeps a copy on the device so it is fast and works offline. When a
 * teacher is signed in, changes are uploaded in the background and changes made
 * on other devices are downloaded. The newest change wins; deletions reach every
 * tablet. Downloads use the server's clock, so a tablet with a wrong clock still
 * gets everything. */
window.LL = window.LL || {};
(function () {
  const S = LL.store;
  const STATE_KEY = 'll-v123-sync';
  const OLD_STATE_KEY = 'll-v122-sync';
  const EPOCH = '1970-01-01T00:00:00Z';
  const ANIMALS = S.ANIMALS;
  let timer = null, running = null, again = false;
  const listeners = new Set();

  const ts = (x) => { const n = Date.parse(x || ''); return Number.isFinite(n) ? n : 0; };
  const iso = (x) => (ts(x) ? new Date(ts(x)).toISOString() : null);
  const newId = (p) => p + '-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function state() {
    const s = S.readJSON(STATE_KEY, null) || {};
    const old = S.readJSON(OLD_STATE_KEY, null) || {};
    return {
      owner: s.owner || old.owner || null, migrated: !!s.migrated,
      pulledQ: s.pulledQ || EPOCH, pulledF: s.pulledF || EPOCH, pulledS: s.pulledS || EPOCH,
      q: s.q || {}, f: s.f || {}, settings: s.settings || null, lastOk: s.lastOk || null, error: s.error || null,
    };
  }
  function saveState(st) { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* ignore */ } }

  function status() {
    const st = state();
    return { signedIn: LL.cloud.signedIn(), lastOk: st.lastOk, error: st.error, busy: !!running, pending: !!timer };
  }
  function emit() { listeners.forEach((fn) => { try { fn(status()); } catch { /* ignore */ } }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /** Called by the store after every local change. */
  function schedule(delay = 1500) {
    if (!LL.cloud.signedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; run(); }, delay);
    emit();
  }

  function run() {
    if (!LL.cloud.signedIn()) return Promise.resolve(false);
    if (running) { again = true; return running; }
    running = (async () => {
      const st = state();
      try {
        if (!LL.cloud.user()) await LL.cloud.refresh();
        st.owner = (LL.cloud.user() || {}).id || st.owner;
        let changed = 0;
        if (!st.migrated) changed += await migrateLegacy(st);
        changed += await pull(st);
        // Folders with the same name in the same place (e.g. old + new copies) become one.
        const merged = S.mergeDuplicateFolders();
        if (merged) { changed += merged; clearTimeout(timer); timer = null; }
        await push(st);
        if (LL.results) await LL.results.flush().catch(() => 0); // results waiting on this device
        st.migrated = true;
        st.lastOk = new Date().toISOString();
        st.error = null;
        saveState(st);
        if (changed) document.dispatchEvent(new CustomEvent('ll-synced', { detail: { changed } }));
        return true;
      } catch (e) {
        st.error = e.code === 'offline' ? 'offline' : (e.message || 'error');
        saveState(st);
        console.warn('sync failed', e);
        if (e.status === 401 && !LL.cloud.signedIn()) document.dispatchEvent(new Event('ll-signed-out'));
        return false;
      }
    })().finally(() => {
      running = null;
      emit();
      if (again) { again = false; run(); }
    });
    emit();
    return running;
  }

  /* ---------- Database rows <-> the app's quiz format ---------- */
  const ref = (p) => LL.media.toRef(p);
  const path = (r) => LL.media.toPath(r) || null;

  function rowToEntry(r) {
    const questions = (r.quiz_questions || []).slice().sort((a, b) => a.position - b.position).map((q) => {
      const options = (q.quiz_options || []).slice().sort((a, b) => a.position - b.position).map((o) => {
        const opt = { id: o.id, text: o.text || '', image: ref(o.image_path), audioMode: o.audio_mode, audio: ref(o.audio_path), readTextEnabled: !!o.read_text_enabled, readText: o.read_text || '', correct: !!o.is_correct };
        if (o.tts) opt.tts = o.tts;
        return opt;
      });
      const item = { id: q.id, text: q.prompt || '', emoji: q.emoji || '', image: ref(q.image_path), audioMode: q.audio_mode, audio: ref(q.audio_path), readTextEnabled: !!q.read_text_enabled, readText: q.read_text || '', correctCount: Math.max(1, options.filter((o) => o.correct).length), options };
      if (q.tts) item.tts = q.tts;
      return item;
    });
    return {
      id: r.id, familyId: r.id, type: S.typeOf(r.activity_type), name: r.name, version: 1, folderId: r.folder_id || null,
      createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
      config: { lang: r.language, voiceGender: r.voice_gender === 'male' ? 'male' : 'female', mode: 'practice', questionOrder: r.question_order, answerOrder: r.answer_order, visibility: r.visible ? 'visible' : 'hidden', coverImage: ref(r.cover_path), questions,
        instructions: r.instructions || (r.settings && r.settings.instruction) || '',
        imageSpeaks: r.image_speaks !== false,
        ...(r.activity_type === 'sort' ? { sort: S.sortSettings({ sort: r.settings || {} }) } : {}),
        ...(r.activity_type === 'typing' ? { typing: S.typingSettings({ typing: r.settings || {} }) } : {}) },
    };
  }

  /** Upload any pictures/audio still stored inside the quiz. Returns true if something changed. */
  async function uploadMedia(entry) {
    let changed = false;
    const up = async (obj, key, folder) => {
      const v = obj[key];
      if (typeof v === 'string' && v.startsWith('data:')) { obj[key] = await LL.media.upload(v, folder); changed = changed || obj[key] !== v; }
    };
    const c = entry.config || {};
    await up(c, 'coverImage', 'covers');
    for (const q of c.questions || []) {
      await up(q, 'image', 'images'); await up(q, 'audio', 'audio');
      for (const o of q.options || []) { await up(o, 'image', 'images'); await up(o, 'audio', 'audio'); }
    }
    return changed;
  }

  function entryToPayload(entry, folderIds) {
    const c = entry.config || {};
    const seenQ = new Set();
    const questions = [], options = [];
    (c.questions || []).forEach((q, qi) => {
      if (!q.id || seenQ.has(q.id)) q.id = newId('q');
      seenQ.add(q.id);
      questions.push({ id: q.id, position: qi, prompt: q.text || '', emoji: q.emoji || '', image_path: path(q.image), audio_mode: q.audioMode || 'voice', audio_path: path(q.audio), read_text_enabled: !!q.readTextEnabled, read_text: q.readText || '', tts: q.tts || null });
      const seenO = new Set();
      (q.options || []).forEach((o, oi) => {
        if (!o.id || seenO.has(o.id)) o.id = newId('o');
        seenO.add(o.id);
        options.push({ question_id: q.id, id: o.id, position: oi, text: o.text || '', image_path: path(o.image), audio_mode: o.audioMode || 'none', audio_path: path(o.audio), read_text_enabled: !!o.readTextEnabled, read_text: o.readText || '', tts: o.tts || null, is_correct: !!o.correct });
      });
    });
    return {
      p_quiz: { id: entry.id, folder_id: entry.folderId && folderIds.has(entry.folderId) ? entry.folderId : null, name: String(entry.name || '').slice(0, 200), language: c.lang, voice_gender: c.voiceGender === 'male' ? 'male' : 'female', mode: 'practice', question_order: c.questionOrder, answer_order: c.answerOrder, visible: c.visibility === 'visible', cover_path: path(c.coverImage), created_at: entry.createdAt || entry.updatedAt, updated_at: entry.updatedAt,
        activity_type: S.typeOf(entry.type), settings: entry.type === 'sort' ? S.sortSettings(c) : entry.type === 'typing' ? S.typingSettings(c) : {},
        instructions: S.instructionsOf(c).slice(0, 300), image_speaks: S.imageSpeaksOf(c) },
      p_questions: questions,
      p_options: options,
    };
  }

  let sortOk = false, sortWarned = false;
  /** Does the database know activity types yet (migration V126)? */
  async function sortSupported() {
    if (sortOk) return true;
    try { await LL.cloud.select('quizzes', 'select=id,activity_type,settings&limit=1'); sortOk = true; }
    catch (e) {
      if (!(e && e.status === 400)) throw e; // offline etc.: the normal retry handles it
      if (!sortWarned) { sortWarned = true; LL.ui.toast('«Clasificación rápida» se guardó en este aparato. Para verla en las tablets falta actualizar la base de datos.', 'error'); }
    }
    return sortOk;
  }

  /* ---------- Download ---------- */
  async function pull(st) {
    let changed = 0;

    // Quizzes with their questions and answers
    for (let page = 0; page < 20; page++) {
      const rows = await LL.cloud.select('quizzes', 'select=*,quiz_questions(*,quiz_options(*))&server_updated_at=gt.' + encodeURIComponent(st.pulledQ) + '&order=server_updated_at.asc&limit=100');
      if (!rows || !rows.length) break;
      const lib = S.readLibrary();
      for (const r of rows) {
        const i = lib.findIndex((x) => x.id === r.id);
        if (r.deleted_at) {
          if (i >= 0 && ts(lib[i].updatedAt) <= ts(r.deleted_at)) { lib.splice(i, 1); changed++; }
          delete st.q[r.id];
        } else if (i < 0 && st.q[r.id] && ts(r.updated_at) <= ts(st.q[r.id])) {
          // Deleted on this device and not changed elsewhere since: the deletion will be uploaded.
        } else if (i < 0 || ts(r.updated_at) > ts(lib[i].updatedAt)) {
          const entry = rowToEntry(r);
          if (i >= 0) lib[i] = entry; else lib.push(entry);
          st.q[r.id] = entry.updatedAt;
          changed++;
        }
        st.pulledQ = r.server_updated_at;
      }
      S.quietly(() => S.writeLibrary(lib));
      saveState(st);
      if (rows.length < 100) break;
    }

    // Folders
    const fs = await LL.cloud.select('folders', 'select=id,name,parent_id,color,updated_at,deleted_at,server_updated_at&server_updated_at=gt.' + encodeURIComponent(st.pulledF) + '&order=server_updated_at.asc&limit=1000');
    if (fs && fs.length) {
      const all = S.folders();
      for (const r of fs) {
        const i = all.findIndex((x) => x.id === r.id);
        if (r.deleted_at) {
          if (i >= 0 && ts(all[i].updatedAt) <= ts(r.deleted_at)) { all.splice(i, 1); changed++; }
          delete st.f[r.id];
        } else if (i < 0 && st.f[r.id] && ts(r.updated_at) <= ts(st.f[r.id])) {
          // Deleted on this device; the deletion will be uploaded.
        } else if (i < 0 || ts(r.updated_at) > ts(all[i].updatedAt)) {
          const f = { id: r.id, name: r.name, parentId: r.parent_id || null, color: r.color, updatedAt: iso(r.updated_at) };
          if (i >= 0) all[i] = f; else all.push(f);
          st.f[r.id] = f.updatedAt;
          changed++;
        }
        st.pulledF = r.server_updated_at;
      }
      S.quietly(() => S.writeFolders(all));
    }

    // Students (small list: always read it whole)
    changed += await refreshStudents();

    // Settings (PIN, voice, Sonidos iniciales)
    const ss = await LL.cloud.select('ll_settings', 'select=sonidos,pin_hash,voice_id,male_voice_id,updated_at,server_updated_at&server_updated_at=gt.' + encodeURIComponent(st.pulledS));
    if (ss && ss.length) {
      const r = ss[0];
      if (ts(r.updated_at) > ts(S.settingsAt())) {
        S.quietly(() => {
          if (r.sonidos && typeof r.sonidos === 'object') S.saveSonidos(r.sonidos);
          S.savePinHash(r.pin_hash || null);
          const v = S.voice();
          if (r.voice_id === 'off') S.saveVoice({ ...v, enabled: false, maleVoiceId: r.male_voice_id || '' });
          else S.saveVoice({ ...v, enabled: true, voiceId: r.voice_id || '', maleVoiceId: r.male_voice_id || '' });
          localStorage.setItem(S.KEYS.settingsAt, JSON.stringify(iso(r.updated_at)));
        });
        st.settings = iso(r.updated_at);
        changed++;
      }
      st.pulledS = r.server_updated_at;
    }
    saveState(st);
    return changed;
  }

  /* ---------- Students ---------- */
  function randomAnimal(taken) {
    const free = ANIMALS.filter((a) => !taken.has(a));
    const list = free.length ? free : ANIMALS;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Read the class list from the database into the device copy. Returns 1 if it changed. */
  async function refreshStudents() {
    const rows = await LL.cloud.select('students', 'select=id,name,animal,avatar_path,sort_order&active=eq.true&order=sort_order.asc.nullslast,name.asc');
    if (!Array.isArray(rows)) return 0;
    const taken = new Set(rows.map((r) => r.animal).filter(Boolean));
    for (const r of rows) {
      if (!r.animal) { // new student added somewhere else without an icon
        r.animal = randomAnimal(taken); taken.add(r.animal);
        LL.cloud.patch('students', 'id=eq.' + r.id, { animal: r.animal }).catch(() => {});
      }
    }
    const roster = rows.map((r) => ({ id: r.id, name: r.name, animal: r.animal, avatar: ref(r.avatar_path) }));
    const before = JSON.stringify(S.roster());
    if (before === JSON.stringify(roster)) return 0;
    S.quietly(() => S.saveRoster(roster));
    return 1;
  }

  const students = {
    async add({ name, animal, avatar }) {
      const list = S.roster();
      const img = avatar && avatar.startsWith('data:') ? await LL.media.upload(avatar, 'students') : avatar;
      const sort = list.length;
      await LL.cloud.insert('students', [{ name, animal: animal || randomAnimal(new Set(list.map((s) => s.animal))), avatar_path: path(img), sort_order: sort, active: true }]);
      await refreshStudents();
    },
    async update(id, { name, animal, avatar }) {
      const img = avatar && avatar.startsWith('data:') ? await LL.media.upload(avatar, 'students') : avatar;
      await LL.cloud.patch('students', 'id=eq.' + id, { name, animal, avatar_path: path(img) });
      await refreshStudents();
    },
    /** Students are never deleted (their past results stay); they are marked inactive. */
    async remove(id) {
      await LL.cloud.patch('students', 'id=eq.' + id, { active: false });
      await refreshStudents();
    },
    /** Save the current order of the list. */
    async reorder(ids) {
      for (let i = 0; i < ids.length; i++) await LL.cloud.patch('students', 'id=eq.' + ids[i], { sort_order: i });
      await refreshStudents();
    },
  };

  /* ---------- Upload ---------- */
  async function push(st) {
    const me = LL.cloud.user();
    if (!me) return;
    const now = new Date().toISOString();

    // Folders first, so quizzes can point to them.
    const fol = S.folders();
    const folderIds = new Set(fol.map((f) => f.id));
    const fRows = [];
    for (const f of fol) {
      const stamp = f.updatedAt || now;
      if (!f.updatedAt) f.updatedAt = stamp;
      if (st.f[f.id] === stamp) continue;
      fRows.push({ id: f.id, teacher_id: me.id, name: String(f.name || '').slice(0, 120), parent_id: f.parentId && folderIds.has(f.parentId) ? f.parentId : null, color: f.color || null, updated_at: stamp, deleted_at: null });
    }
    for (const id of Object.keys(st.f).filter((id) => !folderIds.has(id))) fRows.push({ id, teacher_id: me.id, name: '', updated_at: now, deleted_at: now });
    if (fRows.length) {
      await LL.cloud.upsert('folders', fRows, 'id');
      for (const r of fRows) { if (r.deleted_at) delete st.f[r.id]; else st.f[r.id] = r.updated_at; }
      saveState(st);
    }
    S.quietly(() => S.writeFolders(fol));

    // Quizzes: only the newest version of each one (older V121 versions stay on the device).
    const latest = S.quizzes();
    const latestIds = new Set(latest.map((q) => q.id));
    for (const q of latest) {
      const stamp = q.updatedAt || q.createdAt || now;
      if (st.q[q.id] === stamp) continue;
      // «Clasificación rápida» needs the V126 database columns; until then it stays on this device
      // (otherwise other tablets would receive it as a broken quiz).
      if (q.type === 'sort' && !(await sortSupported())) continue;
      const lib = S.readLibrary();
      const entry = lib.find((x) => x.id === q.id);
      if (!entry) continue;
      if (!entry.updatedAt) entry.updatedAt = stamp;
      if (!entry.folderId && q.folderId) entry.folderId = q.folderId;
      await uploadMedia(entry);
      const payload = entryToPayload(entry, folderIds);
      await LL.cloud.rpc('save_quiz', payload);
      st.q[entry.id] = entry.updatedAt;
      saveState(st);
      // Keep the device copy pointing at the uploaded files (and any repaired ids).
      S.quietly(() => { const l2 = S.readLibrary(); const k = l2.findIndex((x) => x.id === entry.id); if (k >= 0 && l2[k].updatedAt === entry.updatedAt) { l2[k] = entry; S.writeLibrary(l2); } });
    }
    const gone = Object.keys(st.q).filter((id) => !latestIds.has(id));
    for (const id of gone) {
      await LL.cloud.patch('quizzes', 'id=eq.' + encodeURIComponent(id), { deleted_at: now, updated_at: now });
      delete st.q[id];
      saveState(st);
    }

    // Settings
    const sAt = S.settingsAt();
    if (sAt && sAt !== st.settings) {
      const v = S.voice();
      await LL.cloud.upsert('ll_settings', [{ owner_id: me.id, sonidos: S.sonidos(), pin_hash: S.pinHash(), voice_id: v.enabled ? (v.voiceId || null) : 'off', male_voice_id: v.maleVoiceId || null, updated_at: sAt }], 'owner_id');
      st.settings = sAt;
    }
    saveState(st);
  }

  /* ---------- One-time move from the V122 cloud tables (ll_quizzes / ll_folders) ---------- */
  async function migrateLegacy(st) {
    st.q = {}; st.f = {};
    st.pulledQ = EPOCH; st.pulledF = EPOCH;
    const already = await LL.cloud.select('quizzes', 'select=id&limit=1');
    if (already && already.length) return 0; // another device already moved everything
    let changed = 0;
    let rows = [];
    try { rows = await LL.cloud.select('ll_quizzes', 'select=id,family_id,type,name,version,folder_id,config,created_at,updated_at&deleted_at=is.null&type=eq.quiz&limit=1000'); } catch { rows = []; }
    if (rows && rows.length) {
      const lib = S.readLibrary();
      for (const r of rows) {
        const i = lib.findIndex((x) => x.id === r.id);
        if (i < 0 || ts(r.updated_at) > ts(lib[i].updatedAt)) {
          const e = { id: r.id, familyId: r.family_id || r.id, type: 'quiz', name: r.name, version: r.version, folderId: r.folder_id || null, config: r.config || {}, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) };
          if (i >= 0) lib[i] = e; else lib.push(e);
          changed++;
        }
      }
      S.quietly(() => S.writeLibrary(lib));
    }
    let fr = [];
    try { fr = await LL.cloud.select('ll_folders', 'select=id,name,parent_id,color,updated_at&deleted_at=is.null&limit=1000'); } catch { fr = []; }
    if (fr && fr.length) {
      const all = S.folders();
      for (const r of fr) {
        const i = all.findIndex((x) => x.id === r.id);
        if (i < 0 || ts(r.updated_at) > ts(all[i].updatedAt)) {
          const f = { id: r.id, name: r.name, parentId: r.parent_id || null, color: r.color, updatedAt: iso(r.updated_at) };
          if (i >= 0) all[i] = f; else all.push(f);
          changed++;
        }
      }
      S.quietly(() => S.writeFolders(all));
    }
    saveState(st);
    return changed;
  }

  /* ---------- Account switching ---------- */
  function localHasData() { return S.readLibrary().length > 0 || S.folders().length > 0; }
  function owner() { return state().owner; }

  /** Forget which rows were uploaded (used when a different teacher signs in). */
  function reset(ownerId) { saveState({ owner: ownerId || null, migrated: false, q: {}, f: {} }); try { localStorage.removeItem(OLD_STATE_KEY); } catch { /* ignore */ } }

  /** Remove this device's copy of the library (used when another account signs in). */
  function clearLocalLibrary() {
    S.quietly(() => { S.writeLibrary([]); S.writeFolders([]); });
  }

  /** Delete this teacher's activities from the cloud and from this device. Students
   *  are kept (they hold past results); the PIN and voice settings are cleared. */
  async function deleteCloudData() {
    const me = LL.cloud.user();
    if (!me) return;
    const now = new Date().toISOString();
    await LL.cloud.patch('quizzes', 'teacher_id=eq.' + me.id, { deleted_at: now, updated_at: now });
    await LL.cloud.remove('quiz_questions', 'teacher_id=eq.' + me.id);
    await LL.cloud.patch('folders', 'teacher_id=eq.' + me.id, { name: '', parent_id: null, deleted_at: now, updated_at: now });
    await LL.cloud.patch('ll_quizzes', 'owner_id=eq.' + me.id, { name: '', config: {}, folder_id: null, deleted_at: now, updated_at: now }).catch(() => {});
    await LL.cloud.patch('ll_folders', 'owner_id=eq.' + me.id, { name: '', parent_id: null, deleted_at: now, updated_at: now }).catch(() => {});
    await LL.cloud.upsert('ll_settings', [{ owner_id: me.id, roster: [], sonidos: null, pin_hash: null, voice_id: null, updated_at: now }], 'owner_id');
    clearLocalLibrary();
    S.quietly(() => S.savePinHash(null));
    for (const bucket of ['quiz-media', 'll-tts']) {
      try {
        for (const folder of bucket === 'quiz-media' ? ['covers', 'images', 'audio'] : ['']) {
          const prefix = me.id + (folder ? '/' + folder : '');
          const files = await LL.cloud.listFiles(bucket, prefix);
          await LL.cloud.removeFiles(bucket, (files || []).filter((f) => f.name && f.id !== null).map((f) => prefix + '/' + f.name));
        }
      } catch (e) { console.warn('could not remove files', bucket, e); }
    }
    const st = state(); st.q = {}; st.f = {}; st.migrated = true; saveState(st);
  }

  // Keep tablets up to date: when coming back online, when the page becomes visible, and every 2 minutes.
  window.addEventListener('online', () => run());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  setInterval(() => { if (document.visibilityState === 'visible' && !LL.player?.isOpen?.()) run(); }, 120000);

  LL.sync = { uploadMedia, schedule, run, status, onChange, owner, reset, localHasData, clearLocalLibrary, deleteCloudData, students, refreshStudents, _convert: { rowToEntry, entryToPayload } };
})();
