// Administrator (V127): only the administrator account can share with guests and sees the ElevenLabs panel;
// another teacher doesn't see those options and the (fake) database ignores a forced «shared_guest».
const { chromium } = require('playwright');
const path = require('path');
const makeMock = require('./mocksb.js');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const now = new Date().toISOString();
(async () => {
  const mock = makeMock();
  mock.admins = ['u-1111']; // teacher@test.org is the administrator, other@test.org is not
  for (const [id, t] of [['q-a', 'u-1111'], ['q-o', 'u-2222']]) {
    mock.db.quizzes.push({ id, teacher_id: t, folder_id: null, name: 'Actividad ' + id, language: 'es', question_order: 'fixed', answer_order: 'fixed', visible: true, shared_guest: false, voice_gender: 'female', activity_type: 'quiz', settings: {}, instructions: '', image_speaks: true, created_at: now, updated_at: now, server_updated_at: now });
    mock.db.quiz_questions.push({ quiz_id: id, teacher_id: t, id: 'p', position: 0, prompt: '¿Sí?', audio_mode: 'none' });
    mock.db.quiz_options.push({ quiz_id: id, teacher_id: t, question_id: 'p', id: 'a', position: 0, text: 'Sí', audio_mode: 'none', is_correct: true }, { quiz_id: id, teacher_id: t, question_id: 'p', id: 'b', position: 1, text: 'No', audio_mode: 'none', is_correct: false });
  }
  const b = await chromium.launch();
  const login = async (email, pass) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
    await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto('file://' + path.resolve(process.argv[2]));
    await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', pass);
    await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1500);
    await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    return p;
  };
  // Administrator
  const a = await login('teacher@test.org', 'secreto123');
  assert(await a.evaluate(() => LL.auth.isAdmin()), 'administrator account is recognised');
  await a.click('.card:has-text("Actividad q-a") >> text=Editar'); await a.waitForTimeout(500);
  assert(await a.isVisible('.share-guest'), 'administrator: «Compartir con invitados» is offered');
  await a.check('.share-guest input'); await a.click('button:has-text("Guardar")'); await a.waitForTimeout(2500);
  assert(mock.db.quizzes.find((q) => q.id === 'q-a').shared_guest === true, 'administrator: sharing saved');
  await a.click('button:has-text("Mis actividades")'); await a.waitForTimeout(300);
  await a.click('.tab:has-text("Ajustes")'); await a.waitForTimeout(500);
  assert(await a.isVisible('h2:has-text("Voz natural")') && await a.isVisible('text=Usar voz natural'), 'administrator: ElevenLabs controls in Ajustes');
  assert(!a.errs.length, 'administrator: no page errors ' + a.errs.join(' | '));
  // Another teacher
  const o = await login('other@test.org', 'otro12345');
  assert(!(await o.evaluate(() => LL.auth.isAdmin())), 'other teacher is not administrator');
  await o.click('.card:has-text("Actividad q-o") >> text=Editar'); await o.waitForTimeout(500);
  assert(!(await o.isVisible('.share-guest')), 'other teacher: no «Compartir con invitados»');
  // Even if the app sent it, the database keeps it off
  await o.evaluate(() => { const q = LL.store.getQuiz('q-o'); q.config.sharedGuest = true; LL.store.saveQuiz(q); });
  await o.waitForTimeout(2500);
  assert(mock.db.quizzes.find((q) => q.id === 'q-o').shared_guest === false, 'other teacher: forced sharing is ignored by the database');
  await o.click('button:has-text("Mis actividades")'); await o.waitForTimeout(300);
  await o.click('.tab:has-text("Ajustes")'); await o.waitForTimeout(500);
  assert(await o.isVisible('text=La voz natural la administra') && !(await o.isVisible('text=Usar voz natural')), 'other teacher: no ElevenLabs controls, a short note instead');
  assert(await o.isVisible('button:has-text("Ver como invitado")'), 'other teacher can still use «Ver como invitado»');
  assert(!o.errs.length, 'other teacher: no page errors ' + o.errs.join(' | '));
  await b.close();
})();
