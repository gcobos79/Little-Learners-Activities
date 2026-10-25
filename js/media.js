/* Pictures and audio stored in Supabase Storage (bucket "quiz-media").
 *
 * In the app, a stored file is written as a reference:  sb:quiz-media/<teacher>/<hash>.jpg
 * Pictures added while offline or without an account stay as data: URLs until
 * they can be uploaded. Files are named by a hash of their content, so the same
 * picture is only stored once. Downloaded files are kept in the browser's cache
 * so tablets can show them again without internet. */
window.LL = window.LL || {};
(function () {
  const BUCKET = 'quiz-media';
  const PREFIX = 'sb:' + BUCKET + '/';
  const urls = new Map(); // ref -> object URL
  const pending = new Map();

  const isRef = (v) => typeof v === 'string' && v.startsWith(PREFIX);
  const isImage = (v) => typeof v === 'string' && (v.startsWith('data:image/') || (isRef(v) && /\.(jpe?g|png|webp|gif)$/i.test(v)));
  const isAudio = (v) => typeof v === 'string' && (v.startsWith('data:audio/') || (isRef(v) && /\.(mp3|m4a|mp4|aac|wav|webm|ogg)$/i.test(v)));
  const toRef = (path) => (path ? PREFIX + path : '');
  const toPath = (ref) => (isRef(ref) ? ref.slice(PREFIX.length) : null);

  async function cacheGet(ref) {
    try { if (!('caches' in window)) return null; const c = await caches.open('ll-media-v1'); const r = await c.match('https://ll-media.local/' + ref); return r ? r.blob() : null; } catch { return null; }
  }
  async function cachePut(ref, blob) {
    try { if ('caches' in window) { const c = await caches.open('ll-media-v1'); await c.put('https://ll-media.local/' + ref, new Response(blob)); } } catch { /* ignore */ }
  }

  /** A URL the browser can show/play for a reference (or the value itself if it's already a URL). */
  async function resolve(ref) {
    if (!isRef(ref)) return ref;
    if (urls.has(ref)) return urls.get(ref);
    if (pending.has(ref)) return pending.get(ref);
    const p = (async () => {
      let blob = await cacheGet(ref);
      if (!blob) { blob = await LL.cloud.download(BUCKET, toPath(ref)); cachePut(ref, blob); }
      const u = URL.createObjectURL(blob);
      urls.set(ref, u);
      return u;
    })().finally(() => pending.delete(ref));
    pending.set(ref, p);
    return p;
  }

  /** Point an <img>/<audio> at a reference; it fills in when the file arrives. */
  function attach(node, ref) {
    node.dataset.ref = ref;
    node.classList.add('loading-media');
    resolve(ref).then((u) => { if (node.dataset.ref === ref) { node.src = u; node.classList.remove('loading-media'); } })
      .catch(() => { node.classList.remove('loading-media'); node.classList.add('missing-media'); });
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const type = (/data:([^;]+)/.exec(head) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

  async function hashOf(text) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      let h = 0x811c9dc5; for (let i = 0; i < text.length; i += 7) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h.toString(16) + '-' + text.length.toString(16);
    }
  }

  /** Upload a data: URL (picture or audio) and return its reference. Refs pass through unchanged. */
  async function upload(value, folder) {
    if (!value || isRef(value) || !String(value).startsWith('data:')) return value;
    const me = LL.cloud.user();
    if (!me) return value;
    const blob = dataUrlToBlob(value);
    const ext = EXT[blob.type] || (blob.type.startsWith('image/') ? 'jpg' : 'mp3');
    const path = me.id + '/' + folder + '/' + (await hashOf(value)) + '.' + ext;
    await LL.cloud.uploadFile(BUCKET, path, blob);
    const ref = toRef(path);
    urls.set(ref, URL.createObjectURL(blob));
    cachePut(ref, blob);
    return ref;
  }

  /** Turn a reference back into a data: URL (used when downloading a backup file). */
  async function toDataUrl(value) {
    if (!isRef(value)) return value;
    try {
      const u = await resolve(value);
      let blob = await (await fetch(u)).blob();
      // Make sure the file type is right even if the server sent a generic one.
      if (!/^(image|audio)\//.test(blob.type)) {
        const ext = (/\.([a-z0-9]+)$/i.exec(value) || [])[1] || '';
        const type = Object.keys(EXT).find((k) => EXT[k] === ext.toLowerCase()) || (ext === 'jpg' ? 'image/jpeg' : '');
        if (type) blob = new Blob([blob], { type });
      }
      return await LL.ui.readFileAsDataURL(blob);
    } catch { return ''; }
  }

  /** Copy of a backup with every stored file put back inside it, so the file works anywhere. */
  async function inlineBackup(b) {
    const out = JSON.parse(JSON.stringify(b));
    const d = out.data || {};
    const fix = async (obj, key) => { if (obj && isRef(obj[key])) obj[key] = await toDataUrl(obj[key]); };
    for (const e of d[LL.store.KEYS.library] || []) {
      const c = e.config || {};
      await fix(c, 'coverImage');
      for (const q of c.questions || []) {
        await fix(q, 'image'); await fix(q, 'audio'); delete q.tts;
        for (const o of q.options || []) { await fix(o, 'image'); await fix(o, 'audio'); delete o.tts; }
      }
    }
    for (const s of d[LL.store.KEYS.roster] || []) { await fix(s, 'avatar'); delete s.id; }
    return out;
  }

  LL.media = { BUCKET, isRef, isImage, isAudio, toRef, toPath, resolve, attach, upload, toDataUrl, inlineBackup };
})();
