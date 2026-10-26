// In-memory fake of the Supabase endpoints the app uses (auth, PostgREST, RPC, storage, functions).
// Row-level security is imitated: every request only sees the signed-in teacher's rows.
module.exports = function makeMock() {
  const users = { 'teacher@test.org': { id: 'u-1111', password: 'secreto123' }, 'other@test.org': { id: 'u-2222', password: 'otro12345' } };
  const db = { ll_quizzes: [], ll_folders: [], ll_settings: [], students: [], folders: [], quizzes: [], quiz_questions: [], quiz_options: [], quiz_results: [], quiz_result_answers: [] };
  let resultSeq = 0;
  const owner = { ll_quizzes: 'owner_id', ll_folders: 'owner_id', ll_settings: 'owner_id', students: 'teacher_id', folders: 'teacher_id', quizzes: 'teacher_id', quiz_questions: 'teacher_id', quiz_options: 'teacher_id', quiz_results: 'teacher_id', quiz_result_answers: 'teacher_id' };
  const pk = { ll_quizzes: ['owner_id', 'id'], ll_folders: ['owner_id', 'id'], ll_settings: ['owner_id'], students: ['id'], folders: ['id'], quizzes: ['id'] };
  const files = new Map();
  let clock = Date.now(), n = 0, ttsCalls = 0, studentSeq = 100, uploads = 0;
  const tick = () => new Date(++clock).toISOString();
  const tokens = {};
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (route, body, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: body == null ? '' : JSON.stringify(body) });
  const who = (req) => tokens[(req.headers()['authorization'] || '').replace('Bearer ', '')];
  const stamped = new Set(['ll_quizzes', 'll_folders', 'll_settings', 'folders', 'quizzes']);

  function filter(rows, params) {
    let out = rows;
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...rest] = v.split('.'); const val = rest.join('.');
      out = out.filter((r) => {
        const x = r[k];
        if (op === 'eq') return String(x) === val;
        if (op === 'gt') return x != null && String(x) > val;
        if (op === 'is') return val === 'null' ? x == null : true;
        return true;
      });
    }
    return out;
  }
  function embed(rows, select, uid) {
    if (select && select.includes('quiz_result_answers(')) {
      return rows.map((r) => ({ ...r, students: (() => { const s = db.students.find((x) => x.id === r.student_id); return s ? { name: s.name, animal: s.animal, avatar_path: s.avatar_path || null } : null; })(), quiz_result_answers: db.quiz_result_answers.filter((a) => a.result_id === r.id) }));
    }
    if (!select || !select.includes('quiz_questions(')) return rows;
    return rows.map((q) => ({ ...q, quiz_questions: db.quiz_questions.filter((x) => x.quiz_id === q.id && x.teacher_id === uid).map((x) => ({ ...x, quiz_options: db.quiz_options.filter((o) => o.quiz_id === q.id && o.question_id === x.id && o.teacher_id === uid) })) }));
  }

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

    if (p === '/rest/v1/rpc/save_quiz') {
      const { p_quiz, p_questions, p_options } = JSON.parse(req.postData());
      const ex = db.quizzes.find((q) => q.id === p_quiz.id);
      if (ex && ex.teacher_id !== u.id) return json(route, { message: 'new row violates row-level security policy' }, 403);
      const row = { ...(ex || { created_at: p_quiz.created_at || tick() }), ...p_quiz, teacher_id: u.id, deleted_at: null, server_updated_at: tick() };
      if (ex) Object.assign(ex, row); else db.quizzes.push(row);
      db.quiz_questions = db.quiz_questions.filter((x) => x.quiz_id !== p_quiz.id);
      db.quiz_options = db.quiz_options.filter((x) => x.quiz_id !== p_quiz.id);
      const qids = new Set();
      for (const q of p_questions) { if (qids.has(q.id)) return json(route, { message: 'duplicate key quiz_questions' }, 409); qids.add(q.id); db.quiz_questions.push({ ...q, quiz_id: p_quiz.id, teacher_id: u.id }); }
      const oids = new Set();
      for (const o of p_options) { const k = o.question_id + '|' + o.id; if (oids.has(k) || !qids.has(o.question_id)) return json(route, { message: 'bad option' }, 409); oids.add(k); db.quiz_options.push({ ...o, quiz_id: p_quiz.id, teacher_id: u.id }); }
      return json(route, null, 204);
    }
    if (p === '/rest/v1/rpc/save_quiz_result') {
      const { p_result: r, p_answers } = JSON.parse(req.postData());
      const st = db.students.find((x) => x.id === r.student_id && x.teacher_id === u.id);
      const qz = db.quizzes.find((x) => x.id === r.quiz_id && x.teacher_id === u.id);
      if (!st || !qz) return json(route, { message: 'violates row-level security policy / foreign key' }, 409);
      let ex = db.quiz_results.find((x) => x.student_id === r.student_id && x.quiz_id === r.quiz_id && x.month === r.month);
      if (ex && ex.finished_at >= r.finished_at) return json(route, null, 204);
      if (!ex) { ex = { id: ++resultSeq, teacher_id: u.id, student_id: r.student_id, quiz_id: r.quiz_id, month: r.month }; db.quiz_results.push(ex); }
      Object.assign(ex, { score: r.score, total: r.total, started_at: r.started_at, finished_at: r.finished_at, duration_seconds: r.duration_seconds });
      db.quiz_result_answers = db.quiz_result_answers.filter((a) => a.result_id !== ex.id);
      for (const a of p_answers) db.quiz_result_answers.push({ ...a, result_id: ex.id, teacher_id: u.id });
      return json(route, null, 204);
    }
    if (p.startsWith('/rest/v1/')) {
      const t = p.slice(9); const rows = db[t]; if (!rows) return json(route, { message: 'no table ' + t }, 404);
      const col = owner[t];
      const mine = rows.filter((r) => r[col] === u.id);
      const params = [...url.searchParams.entries()];
      if (m === 'GET') {
        let out = filter(mine, params);
        if (stamped.has(t)) out = out.sort((a, b) => String(a.server_updated_at).localeCompare(String(b.server_updated_at)));
        if (t === 'students') out = out.sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.name.localeCompare(b.name));
        const lim = Number(url.searchParams.get('limit') || 0); if (lim) out = out.slice(0, lim);
        return json(route, embed(out, url.searchParams.get('select'), u.id));
      }
      if (m === 'POST') {
        const body = JSON.parse(req.postData());
        const upsert = (req.headers()['prefer'] || '').includes('merge-duplicates');
        const created = [];
        for (const r0 of body) {
          const r = { ...r0 }; if (!r[col]) r[col] = u.id;
          if (r[col] !== u.id) return json(route, { message: 'RLS violation' }, 403);
          if (t === 'students' && r.id == null) r.id = ++studentSeq;
          const k = pk[t]; const i = upsert ? rows.findIndex((x) => k.every((f) => x[f] === r[f])) : -1;
          if (i >= 0 && rows[i][col] !== u.id) return json(route, { message: 'RLS violation' }, 403);
          const row = { ...(i >= 0 ? rows[i] : {}), ...r };
          if (stamped.has(t)) row.server_updated_at = tick();
          if (i >= 0) rows[i] = row; else rows.push(row);
          created.push(row);
        }
        return json(route, (req.headers()['prefer'] || '').includes('representation') ? created : null, 201);
      }
      if (m === 'PATCH') { const b = JSON.parse(req.postData()); filter(mine, params).forEach((r) => Object.assign(r, b, stamped.has(t) ? { server_updated_at: tick() } : {})); return json(route, null, 204); }
      if (m === 'DELETE') { const kill = new Set(filter(mine, params)); db[t] = rows.filter((r) => !kill.has(r)); if (t === 'quiz_questions') db.quiz_options = db.quiz_options.filter((o) => db.quiz_questions.some((q) => q.quiz_id === o.quiz_id && q.id === o.question_id)); return json(route, null, 204); }
    }
    if (p === '/functions/v1/ll-tts') {
      const b = JSON.parse(req.postData());
      if (api.noTtsKey) return json(route, { fallback: true, reason: 'no_api_key' });
      if (b.action === 'voices') return json(route, { voices: [{ id: 'VoiceAAAAAAAAAA', name: 'Sarah', gender: 'female', accent: 'american' }], defaultVoice: 'VoiceAAAAAAAAAA' });
      if (b.action === 'usage') return json(route, { used: 1234, limit: 10000, resetsAt: Math.floor(Date.now() / 1000) + 86400 });
      ttsCalls++;
      const path = u.id + '/' + Buffer.from(b.text).toString('hex').slice(0, 20) + '.mp3'; files.set('ll-tts/' + path, Buffer.alloc(200));
      return json(route, { path });
    }
    let mm;
    if ((mm = /^\/storage\/v1\/object\/authenticated\/([^/]+)\/(.+)$/.exec(p))) {
      const key = mm[1] + '/' + decodeURIComponent(mm[2]);
      if (!decodeURIComponent(mm[2]).startsWith(u.id + '/') || !files.has(key)) return json(route, { message: 'not found' }, 404);
      return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/octet-stream' }, body: files.get(key) });
    }
    if ((mm = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(p))) {
      const prefix = JSON.parse(req.postData()).prefix;
      return json(route, [...files.keys()].filter((f) => f.startsWith(mm[1] + '/' + prefix + '/')).map((f) => ({ id: 'x', name: f.split('/').pop() })));
    }
    if ((mm = /^\/storage\/v1\/object\/([^/]+)$/.exec(p)) && m === 'DELETE') { JSON.parse(req.postData()).prefixes.forEach((f) => files.delete(mm[1] + '/' + f)); return json(route, []); }
    if ((mm = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p)) && m === 'POST') {
      const path = decodeURIComponent(mm[2]);
      if (!path.startsWith(u.id + '/')) return json(route, { message: 'RLS' }, 403);
      files.set(mm[1] + '/' + path, req.postDataBuffer() || Buffer.alloc(0)); uploads++;
      return json(route, { Key: mm[1] + '/' + path });
    }
    return json(route, { message: 'unhandled ' + m + ' ' + p }, 404);
  }
  const api = { handler, db, files, noTtsKey: false, stats: () => ({ ttsCalls, uploads }) };
  return api;
};
