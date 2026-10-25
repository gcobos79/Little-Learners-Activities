/* Cloud sync. The app keeps working from this browser's local copy (fast, works
 * offline); when a teacher is signed in, changes are uploaded in the background
 * and changes made on other devices are downloaded.
 *
 * Rules:
 *  - Each quiz / folder is one row. The newest `updatedAt` wins.
 *  - Deleting marks the row as deleted, so other tablets remove it too.
 *  - Downloads use the server's own clock (server_updated_at), so a tablet
 *    with a wrong clock still gets everything. */
window.LL = window.LL || {};
(function () {
  const S = LL.store;
  const STATE_KEY = 'll-v122-sync';
  const EPOCH = '1970-01-01T00:00:00Z';
  let timer = null, running = null, again = false;
  const listeners = new Set();

  const ts = (x) => { const n = Date.parse(x || ''); return Number.isFinite(n) ? n : 0; };
  const iso = (x) => (ts(x) ? new Date(ts(x)).toISOString() : null);

  function state() {
    const s = S.readJSON(STATE_KEY, null) || {};
    return { owner: s.owner || null, pulledQ: s.pulledQ || EPOCH, pulledF: s.pulledF || EPOCH, pulledS: s.pulledS || EPOCH, q: s.q || {}, f: s.f || {}, settings: s.settings || null, lastOk: s.lastOk || null, error: s.error || null };
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
      const me = LL.cloud.user();
      if (!me) { await LL.cloud.refresh(); }
      st.owner = (LL.cloud.user() || {}).id || st.owner;
      try {
        let changed = await pull(st);
        // Folders with the same name in the same place (e.g. old + new copies) become one.
        const merged = S.mergeDuplicateFolders();
        if (merged) { changed += merged; clearTimeout(timer); timer = null; }
        await push(st);
        st.lastOk = new Date().toISOString();
        st.error = null;
        saveState(st);
        if (changed) document.dispatchEvent(new CustomEvent('ll-synced', { detail: { changed } }));
        return true;
      } catch (e) {
        st.error = e.code === 'offline' ? 'offline' : (e.message || 'error');
        saveState(st);
        console.warn('sync failed', e);
        if (e.status === 401) { /* session expired and could not refresh */ document.dispatchEvent(new Event('ll-signed-out')); }
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

  /* ---------- Download ---------- */
  async function pull(st) {
    let changed = 0;
    // Quizzes
    const qs = await LL.cloud.select('ll_quizzes', 'select=id,family_id,type,name,version,folder_id,config,created_at,updated_at,deleted_at,server_updated_at&server_updated_at=gt.' + encodeURIComponent(st.pulledQ) + '&order=server_updated_at.asc&limit=1000');
    if (qs && qs.length) {
      const lib = S.readLibrary();
      for (const r of qs) {
        const i = lib.findIndex((x) => x.id === r.id);
        if (r.deleted_at) {
          if (i >= 0 && ts(lib[i].updatedAt) <= ts(r.deleted_at)) { lib.splice(i, 1); changed++; }
          delete st.q[r.id];
        } else if (i < 0 || ts(r.updated_at) > ts(lib[i].updatedAt)) {
          const entry = { id: r.id, familyId: r.family_id || r.id, type: r.type, name: r.name, version: r.version, folderId: r.folder_id || null, config: r.config || {}, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) };
          if (i >= 0) lib[i] = entry; else lib.push(entry);
          st.q[r.id] = entry.updatedAt;
          changed++;
        }
        st.pulledQ = r.server_updated_at;
      }
      S.quietly(() => S.writeLibrary(lib));
    }
    // Folders
    const fs = await LL.cloud.select('ll_folders', 'select=id,name,parent_id,color,updated_at,deleted_at,server_updated_at&server_updated_at=gt.' + encodeURIComponent(st.pulledF) + '&order=server_updated_at.asc&limit=1000');
    if (fs && fs.length) {
      const all = S.folders();
      for (const r of fs) {
        const i = all.findIndex((x) => x.id === r.id);
        if (r.deleted_at) {
          if (i >= 0 && ts(all[i].updatedAt) <= ts(r.deleted_at)) { all.splice(i, 1); changed++; }
          delete st.f[r.id];
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
    // Settings (students, Sonidos iniciales, PIN, voice)
    const ss = await LL.cloud.select('ll_settings', 'select=roster,sonidos,pin_hash,voice_id,updated_at,server_updated_at&server_updated_at=gt.' + encodeURIComponent(st.pulledS));
    if (ss && ss.length) {
      const r = ss[0];
      if (ts(r.updated_at) > ts(S.settingsAt())) {
        S.quietly(() => {
          if (Array.isArray(r.roster)) S.saveRoster(r.roster);
          if (r.sonidos && typeof r.sonidos === 'object') S.saveSonidos(r.sonidos);
          S.savePinHash(r.pin_hash || null);
          const v = S.voice();
          if (r.voice_id === 'off') S.saveVoice({ ...v, enabled: false });
          else S.saveVoice({ ...v, enabled: true, voiceId: r.voice_id || '' });
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

  /* ---------- Upload ---------- */
  async function push(st) {
    const me = LL.cloud.user();
    if (!me) return;
    const now = new Date().toISOString();

    const lib = S.readLibrary();
    const qRows = [];
    for (const e of lib) {
      const stamp = e.updatedAt || e.createdAt || now;
      if (!e.updatedAt) e.updatedAt = stamp;
      if (st.q[e.id] === stamp) continue;
      qRows.push({ owner_id: me.id, id: e.id, family_id: e.familyId || e.id, type: e.type || 'quiz', name: String(e.name || ''), version: Number(e.version) || 1, folder_id: e.folderId || null, config: e.config || {}, created_at: e.createdAt || stamp, updated_at: stamp, deleted_at: null });
    }
    const localQ = new Set(lib.map((x) => x.id));
    const goneQ = Object.keys(st.q).filter((id) => !localQ.has(id));
    for (const id of goneQ) qRows.push({ owner_id: me.id, id, name: '', config: {}, updated_at: now, deleted_at: now });
    // Upload in small batches (quizzes can contain pictures).
    for (let i = 0; i < qRows.length; i += 5) {
      const batch = qRows.slice(i, i + 5);
      await LL.cloud.upsert('ll_quizzes', batch, 'owner_id,id');
      for (const r of batch) { if (r.deleted_at) delete st.q[r.id]; else st.q[r.id] = r.updated_at; }
      saveState(st);
    }

    const fol = S.folders();
    const fRows = [];
    for (const f of fol) {
      const stamp = f.updatedAt || now;
      if (!f.updatedAt) f.updatedAt = stamp;
      if (st.f[f.id] === stamp) continue;
      fRows.push({ owner_id: me.id, id: f.id, name: String(f.name || ''), parent_id: f.parentId || null, color: f.color || null, updated_at: stamp, deleted_at: null });
    }
    const localF = new Set(fol.map((x) => x.id));
    for (const id of Object.keys(st.f).filter((id) => !localF.has(id))) fRows.push({ owner_id: me.id, id, name: '', updated_at: now, deleted_at: now });
    if (fRows.length) {
      await LL.cloud.upsert('ll_folders', fRows, 'owner_id,id');
      for (const r of fRows) { if (r.deleted_at) delete st.f[r.id]; else st.f[r.id] = r.updated_at; }
    }
    // Save stamps we filled in for older entries that had none.
    S.quietly(() => { S.writeLibrary(lib); S.writeFolders(fol); });

    const sAt = S.settingsAt();
    if (sAt && sAt !== st.settings) {
      const v = S.voice();
      await LL.cloud.upsert('ll_settings', [{ owner_id: me.id, roster: S.roster(), sonidos: S.sonidos(), pin_hash: S.pinHash(), voice_id: v.enabled ? (v.voiceId || null) : 'off', updated_at: sAt }], 'owner_id');
      st.settings = sAt;
    }
    saveState(st);
  }

  /* ---------- Account switching ---------- */
  function localHasData() { return S.readLibrary().length > 0 || S.folders().length > 0; }
  function owner() { return state().owner; }

  /** Forget which rows were uploaded (used when a different teacher signs in or local data is cleared). */
  function reset(ownerId) { saveState({ owner: ownerId || null, q: {}, f: {} }); }

  /** Remove this device's copy of the library (used when another account signs in). */
  function clearLocalLibrary() {
    S.quietly(() => { S.writeLibrary([]); S.writeFolders([]); });
  }

  /** Delete this teacher's cloud data. Rows are emptied and marked deleted (so the
   * other tablets also remove their copies on their next sync); voice files are
   * removed. This device's copy is cleared too, so it isn't uploaded again. */
  async function deleteCloudData() {
    const me = LL.cloud.user();
    if (!me) return;
    const now = new Date().toISOString();
    await LL.cloud.patch('ll_quizzes', 'owner_id=eq.' + me.id, { name: '', config: {}, folder_id: null, deleted_at: now, updated_at: now });
    await LL.cloud.patch('ll_folders', 'owner_id=eq.' + me.id, { name: '', parent_id: null, deleted_at: now, updated_at: now });
    await LL.cloud.upsert('ll_settings', [{ owner_id: me.id, roster: [], sonidos: null, pin_hash: null, voice_id: null, updated_at: now }], 'owner_id');
    clearLocalLibrary();
    S.quietly(() => { S.saveRoster([]); S.savePinHash(null); });
    try {
      const files = await LL.cloud.listFiles('ll-tts', me.id);
      await LL.cloud.removeFiles('ll-tts', (files || []).filter((f) => f.name).map((f) => me.id + '/' + f.name));
    } catch (e) { console.warn('could not remove voice files', e); }
    reset(me.id);
  }

  // Keep tablets up to date: when coming back online, when the page becomes visible, and every 2 minutes.
  window.addEventListener('online', () => run());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  setInterval(() => { if (document.visibilityState === 'visible' && !LL.player?.isOpen?.()) run(); }, 120000);

  LL.sync = { schedule, run, status, onChange, owner, reset, localHasData, clearLocalLibrary, deleteCloudData };
})();
