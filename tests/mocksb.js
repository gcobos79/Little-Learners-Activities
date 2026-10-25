// In-memory fake of the Supabase endpoints the app uses (auth, PostgREST, storage, functions).
module.exports = function makeMock() {
  const users = { 'teacher@test.org': { id: 'u-1111', password: 'secreto123' }, 'other@test.org': { id: 'u-2222', password: 'otro12345' } };
  const db = { ll_quizzes: [], ll_folders: [], ll_settings: [] };
  const files = new Set();
  let clock = Date.now(), n = 0, ttsCalls = 0;
  const tick = () => new Date(++clock).toISOString();
  const tokens = {};
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (route, body, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) });
  const who = (req) => tokens[(req.headers()['authorization'] || '').replace('Bearer ', '')];
  const keyOf = { ll_quizzes: ['owner_id', 'id'], ll_folders: ['owner_id', 'id'], ll_settings: ['owner_id'] };
  async function handler(route) {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    if (p === '/auth/v1/token') {
      const b = JSON.parse(req.postData() || '{}');
      let u;
      if (url.searchParams.get('grant_type') === 'password') { u = users[b.email]; if (!u || u.password !== b.password) return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400); u = { ...u, email: b.email }; }
      else { u = tokens[b.refresh_token]; if (!u) return json(route, { error: 'invalid_grant' }, 400); }
      const at = 'at-' + (++n), rt = 'rt-' + n; tokens[at] = u; tokens[rt] = u;
      return json(route, { access_token: at, refresh_token: rt, expires_in: 3600, user: { id: u.id, email: u.email } });
    }
    if (p === '/auth/v1/user') { const u = who(req); return u ? json(route, { id: u.id, email: u.email }) : json(route, { msg: 'no' }, 401); }
    if (p === '/auth/v1/logout') return json(route, null, 204);
    const u = who(req);
    if (!u) return json(route, { message: 'JWT required' }, 401);
    if (p.startsWith('/rest/v1/')) {
      const t = p.slice(9); const rows = db[t];
      const mine = rows.filter((r) => r.owner_id === u.id);
      if (m === 'GET') {
        const gt = (url.searchParams.get('server_updated_at') || '').replace('gt.', '');
        return json(route, mine.filter((r) => !gt || r.server_updated_at > gt).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)));
      }
      if (m === 'POST') {
        for (const r of JSON.parse(req.postData())) {
          if (r.owner_id !== u.id) return json(route, { message: 'RLS violation' }, 403);
          const k = keyOf[t]; const i = rows.findIndex((x) => k.every((f) => x[f] === r[f]));
          const row = { ...(i >= 0 ? rows[i] : {}), ...r, server_updated_at: tick() };
          if (i >= 0) rows[i] = row; else rows.push(row);
        }
        return json(route, null, 201);
      }
      if (m === 'PATCH') { const b = JSON.parse(req.postData()); mine.forEach((r) => Object.assign(r, b, { server_updated_at: tick() })); return json(route, null, 204); }
    }
    if (p === '/functions/v1/ll-tts') {
      const b = JSON.parse(req.postData());
      if (b.action === 'voices') return json(route, { voices: [{ id: 'VoiceAAAAAAAAAA', name: 'Sarah', gender: 'female', accent: 'american' }], defaultVoice: 'VoiceAAAAAAAAAA' });
      if (b.action === 'usage') return json(route, { used: 1234, limit: 10000, resetsAt: Math.floor(Date.now() / 1000) + 86400 });
      ttsCalls++;
      const path = u.id + '/' + Buffer.from(b.text).toString('hex').slice(0, 20) + '.mp3'; files.add(path);
      return json(route, { path });
    }
    if (p.startsWith('/storage/v1/object/authenticated/ll-tts/')) {
      const path = decodeURIComponent(p.replace('/storage/v1/object/authenticated/ll-tts/', ''));
      if (!path.startsWith(u.id + '/') || !files.has(path)) return json(route, { message: 'not found' }, 404);
      return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'audio/mpeg' }, body: Buffer.alloc(200) });
    }
    if (p === '/storage/v1/object/list/ll-tts') return json(route, [...files].filter((f) => f.startsWith(u.id + '/')).map((f) => ({ name: f.split('/')[1] })));
    if (p === '/storage/v1/object/ll-tts' && m === 'DELETE') { JSON.parse(req.postData()).prefixes.forEach((f) => files.delete(f)); return json(route, []); }
    return json(route, { message: 'unhandled ' + m + ' ' + p }, 404);
  }
  return { handler, db, files, stats: () => ({ ttsCalls }) };
};
