/* Minimal Supabase client (sign-in, database, storage, functions) using plain fetch.
 * No outside script is loaded. The publishable key in config.js is meant to be
 * public; what each teacher can read or change is enforced by the database
 * (row-level security), not by this file. */
window.LL = window.LL || {};
(function () {
  const SESSION_KEY = 'll-v122-session';
  const cfg = () => LL.config || {};
  const enabled = () => !!(cfg().supabaseUrl && cfg().supabaseKey);
  const base = () => String(cfg().supabaseUrl).replace(/\/$/, '');

  function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
  function writeSession(s) { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } }

  class CloudError extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code; } }

  async function call(path, { method = 'GET', body, token, headers = {}, raw = false } = {}) {
    const h = { apikey: cfg().supabaseKey, ...headers };
    if (token) h.Authorization = 'Bearer ' + token;
    if (body !== undefined && !(body instanceof Blob)) h['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(base() + path, { method, headers: h, body: body === undefined ? undefined : (body instanceof Blob ? body : JSON.stringify(body)) });
    } catch (e) {
      throw new CloudError('Sin conexión a internet.', 0, 'offline');
    }
    if (raw) { if (!res.ok) throw new CloudError('Error ' + res.status, res.status); return res; }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) || ('Error ' + res.status);
      throw new CloudError(String(msg), res.status, data && (data.error_code || data.code || data.error));
    }
    return data;
  }

  function storeTokens(d) {
    const s = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600),
      user: d.user ? { id: d.user.id, email: d.user.email } : (readSession() || {}).user,
    };
    writeSession(s);
    return s;
  }

  /* ---------- Auth ---------- */
  async function signIn(email, password) {
    const d = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    return storeTokens(d);
  }

  let refreshing = null;
  async function refresh() {
    const s = readSession();
    if (!s || !s.refresh_token) throw new CloudError('No hay sesión.', 401, 'no_session');
    if (!refreshing) {
      refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } })
        .then(storeTokens)
        .catch((e) => { if (e.status === 400 || e.status === 401) writeSession(null); throw e; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  /** A valid access token, refreshed when it is about to expire. */
  async function token() {
    const s = readSession();
    if (!s) throw new CloudError('No hay sesión.', 401, 'no_session');
    if (s.expires_at - 60 < Date.now() / 1000) return (await refresh()).access_token;
    return s.access_token;
  }

  async function signOut() {
    const s = readSession();
    writeSession(null);
    if (s) { try { await call('/auth/v1/logout', { method: 'POST', token: s.access_token }); } catch { /* already signed out */ } }
  }

  function redirectUrl() {
    if (/^https?:/.test(location.protocol)) return location.origin + location.pathname;
    return cfg().siteUrl || '';
  }

  async function sendPasswordReset(email) {
    const rt = redirectUrl();
    await call('/auth/v1/recover' + (rt ? '?redirect_to=' + encodeURIComponent(rt) : ''), { method: 'POST', body: { email } });
  }

  async function setPassword(password) {
    return call('/auth/v1/user', { method: 'PUT', token: await token(), body: { password } });
  }

  /** Handles links from invitation / password-reset emails (#access_token=…&type=invite). */
  async function handleRedirect() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('error') || h.get('error_description')) {
      history.replaceState(null, '', location.pathname + location.search);
      return { error: h.get('error_description') || h.get('error') };
    }
    if (!h.get('access_token')) return null;
    const s = storeTokens({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in'), expires_at: Number(h.get('expires_at')) || undefined });
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const u = await call('/auth/v1/user', { token: s.access_token });
      s.user = { id: u.id, email: u.email };
      writeSession(s);
    } catch { /* keep tokens; user info fills in later */ }
    return { type: h.get('type') || 'signin' };
  }

  function user() { const s = readSession(); return s && s.user ? s.user : null; }
  function signedIn() { return enabled() && !!readSession(); }

  /* ---------- Database (PostgREST) ---------- */
  async function select(table, query) {
    return call('/rest/v1/' + table + '?' + query, { token: await token() });
  }
  async function upsert(table, rows, onConflict) {
    if (!rows.length) return [];
    return call('/rest/v1/' + table + '?on_conflict=' + onConflict, { method: 'POST', token: await token(), body: rows, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  }
  async function patch(table, query, body) {
    return call('/rest/v1/' + table + '?' + query, { method: 'PATCH', token: await token(), body, headers: { Prefer: 'return=minimal' } });
  }
  async function remove(table, query) {
    return call('/rest/v1/' + table + '?' + query, { method: 'DELETE', token: await token(), headers: { Prefer: 'return=minimal' } });
  }

  /* ---------- Storage & functions ---------- */
  async function download(bucket, path) {
    // Without a session (guest mode) the public key alone is used: the database only lets it read the
    // pictures and audio of activities shared with guests.
    const res = await call('/storage/v1/object/authenticated/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), { token: readSession() ? await token() : undefined, raw: true });
    return res.blob();
  }
  async function listFiles(bucket, prefix) {
    return call('/storage/v1/object/list/' + bucket, { method: 'POST', token: await token(), body: { prefix, limit: 1000, offset: 0 } });
  }
  async function removeFiles(bucket, paths) {
    if (!paths.length) return null;
    return call('/storage/v1/object/' + bucket, { method: 'DELETE', token: await token(), body: { prefixes: paths } });
  }
  async function uploadFile(bucket, path, blob) {
    return call('/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', token: await token(), body: blob, headers: { 'x-upsert': 'true', 'Content-Type': blob.type || 'application/octet-stream' } });
  }
  async function rpc(fn, args) {
    return call('/rest/v1/rpc/' + fn, { method: 'POST', token: await token(), body: args });
  }
  /** A database function anyone may call without an account (only guest_catalog). */
  async function rpcPublic(fn, args) {
    return call('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {} });
  }
  async function insert(table, rows, select) {
    return call('/rest/v1/' + table + (select ? '?select=' + select : ''), { method: 'POST', token: await token(), body: rows, headers: { Prefer: select ? 'return=representation' : 'return=minimal' } });
  }
  async function invoke(name, body) {
    return call('/functions/v1/' + name, { method: 'POST', token: await token(), body });
  }

  LL.cloud = { enabled, signIn, signOut, refresh, token, sendPasswordReset, setPassword, handleRedirect, user, signedIn, select, upsert, patch, remove, download, uploadFile, listFiles, removeFiles, invoke, rpc, rpcPublic, insert, CloudError };
})();
