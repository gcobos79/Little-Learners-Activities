// Guest mode (V127): «Entrar como invitado» on the sign-in page. Guests see only the activities the
// teacher marked «Compartir con invitados» (and visible) with the folders on the way to them, can play
// them (pictures included), see their score, and nothing is saved anywhere. No students, no teacher tools.
const { chromium } = require('playwright');
const path = require('path');
const makeMock = require('./mocksb.js');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const T = 'u-1111';

(async () => {
  const mock = makeMock();
  const now = new Date().toISOString();
  const quiz = (id, name, folder, extra) => ({ id, teacher_id: T, folder_id: folder, name, language: 'es', mode: 'practice', question_order: 'fixed', answer_order: 'fixed', visible: true, shared_guest: true, cover_path: null, voice_gender: 'female', activity_type: 'quiz', settings: {}, instructions: '', image_speaks: true, created_at: now, updated_at: now, deleted_at: null, server_updated_at: now, ...extra });
  mock.db.folders.push(
    { id: 'f-ing', teacher_id: T, parent_id: null, name: 'Inglés', color: '#FDE2E7', updated_at: now, server_updated_at: now },
    { id: 'f-sal', teacher_id: T, parent_id: 'f-ing', name: 'Saludos', color: '#DDE7FD', updated_at: now, server_updated_at: now },
    { id: 'f-priv', teacher_id: T, parent_id: null, name: 'Privada', color: '#DFF3D8', updated_at: now, server_updated_at: now });
  mock.db.quizzes.push(
    quiz('q-share', 'Colores compartido', 'f-sal'),
    quiz('q-type', 'Teclado compartido', null, { activity_type: 'typing', settings: { mode: 1 } }),
    quiz('q-private', 'Solo mis alumnos', 'f-priv', { shared_guest: false }),
    quiz('q-hidden', 'Compartido pero oculto', null, { visible: false }));
  const qq = (quizId, id, prompt, extra) => ({ quiz_id: quizId, teacher_id: T, id, position: 0, prompt, emoji: '', image_path: null, audio_mode: 'none', audio_path: null, read_text_enabled: false, read_text: '', ...extra });
  const opt = (quizId, qid, id, text, ok) => ({ quiz_id: quizId, teacher_id: T, question_id: qid, id, position: id === 'a' ? 0 : 1, text, image_path: null, audio_mode: 'none', audio_path: null, read_text_enabled: false, read_text: '', is_correct: ok });
  mock.db.quiz_questions.push(
    qq('q-share', 'p1', '¿Rojo?', { image_path: T + '/images/rojo.png' }),
    qq('q-type', 'w1', 'Hi'),
    qq('q-private', 'p1', '¿Secreto?', { image_path: T + '/images/secreto.png' }));
  mock.db.quiz_options.push(opt('q-share', 'p1', 'a', 'Sí', true), opt('q-share', 'p1', 'b', 'No', false), opt('q-private', 'p1', 'a', 'Sí', true), opt('q-private', 'p1', 'b', 'No', false));
  mock.files.set('quiz-media/' + T + '/images/rojo.png', PNG);
  mock.files.set('quiz-media/' + T + '/images/secreto.png', PNG);
  mock.db.students.push({ id: 1, teacher_id: T, name: 'Abigail', animal: '🐱', active: true });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { Element.prototype.requestFullscreen = function () { return Promise.resolve(); }; if (window.speechSynthesis) speechSynthesis.speak = () => {}; });
  await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const writes = []; p.on('request', (r) => { if (r.url().includes('supabase.co') && r.method() !== 'GET' && !r.url().includes('guest_catalog')) writes.push(r.method() + ' ' + r.url()); });
  await p.goto('file://' + path.resolve(process.argv[2]));
  // This device already has its own activity (it must stay untouched and hidden from the guest).
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify([{ id: 'local1', familyId: 'local1', version: 1, type: 'quiz', name: 'Actividad de este aparato', config: { visibility: 'visible', questions: [] } }])); });
  await p.reload(); await p.waitForTimeout(500);
  const before = await p.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

  assert(await p.isVisible('.login-guest button:has-text("Entrar como invitado")'), 'sign-in page has «Entrar como invitado» under the sign-in');
  await p.click('.login-guest button'); await p.waitForTimeout(700);
  assert(await p.isVisible('#screen-library'), 'the guest goes straight to the activities');
  assert(await p.isVisible('.guest-chip:has-text("Invitado")'), 'top bar says «Invitado»');
  assert(!(await p.isVisible('.teacher-gate')) && !(await p.$('.tabs')), 'no Maestro button and no teacher tabs');
  const root = await p.evaluate(() => [...document.querySelectorAll('#cardGrid .card .name')].map((x) => x.textContent));
  assert(root.includes('Inglés') && root.includes('Teclado compartido'), 'root shows the shared folder and activity: ' + root.join(', '));
  assert(!root.includes('Privada') && !root.includes('Solo mis alumnos') && !root.includes('Compartido pero oculto') && !root.includes('Actividad de este aparato'), 'nothing that is not shared + visible, and not this device\'s own activities');
  assert(!(await p.$('.card .card-tools')) && !(await p.isVisible('button:has-text("Nueva actividad")')), 'no editing tools');
  await p.click('.card:has-text("Inglés")'); await p.waitForTimeout(300);
  await p.click('.card:has-text("Saludos")'); await p.waitForTimeout(300);
  assert(await p.isVisible('.card:has-text("Colores compartido")'), 'folders lead to the shared activity');
  await p.click('.card:has-text("Colores compartido")'); await p.waitForTimeout(900);
  const img = await p.evaluate(() => { const i = document.querySelector('.question-image'); return i ? i.getAttribute('src') : null; });
  assert(img && img.startsWith('blob:') && mock.guestFiles >= 1, 'the shared picture loads for the guest (' + (img || 'none').slice(0, 10) + ')');
  assert(!(await p.isVisible('#playerStudent')), 'no student name in the activity');
  await p.click('.option:has-text("Sí")'); await p.waitForTimeout(2600);
  assert(await p.isVisible('.my-score:has-text("1 / 1")'), 'end: «Tu puntaje 1 / 1»');
  assert(!(await p.$('.board')), 'end: no class results board (no student names)');
  assert(await p.isVisible('button:has-text("Otra vez")') && await p.isVisible('.finish button:has-text("Salir")'), 'end: «Otra vez» and «Salir»');
  await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(500);
  assert(!(await p.isVisible('#player')) && await p.isVisible('.card:has-text("Colores compartido")') && await p.isVisible('#crumbs:has-text("Saludos")'), '«Salir» goes back to the folder the guest was in');

  // Typing activity works too, nothing saved
  await p.click('#brandHome'); await p.waitForTimeout(400);
  await p.click('.card:has-text("Teclado compartido")'); await p.waitForTimeout(600);
  for (const k of ['shift', 'h', 'i', 'enter']) await p.click('.kb-key[data-k="' + k + '"]', { force: true });
  await p.waitForTimeout(2300);
  assert(await p.isVisible('.my-score:has-text("1 / 1")'), 'Pantalla de Tablet as guest: score shown');
  await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(400);

  // Reload: still a guest (same tab)
  await p.reload(); await p.waitForTimeout(900);
  assert(await p.isVisible('.guest-chip') && await p.isVisible('.card:has-text("Teclado compartido")'), 'after reloading, still a guest with the shared activities');
  assert(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.includes('result')))), 'no results stored on this device');
  const after = await p.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  assert(before === after, 'this device\'s saved data is exactly as before');
  assert(!writes.length, 'nothing sent to the database: ' + writes.join(' | '));
  assert(!mock.db.quiz_results.length, 'no results in the database');

  // Leave guest mode
  await p.click('.appbar button:has-text("Salir")'); await p.waitForTimeout(500);
  assert(await p.isVisible('#screen-login form'), 'top «Salir» goes back to the sign-in page');
  const back = await p.evaluate(() => ({ guest: LL.store.isGuest(), names: LL.store.quizzes().map((q) => q.name) }));
  assert(!back.guest && back.names.join() === 'Actividad de este aparato', 'guest data is gone; the device\'s own activities are back');
  await p.goBack(); await p.waitForTimeout(500);
  assert(!(await p.isVisible('.guest-chip')), 'browser Back does not re-enter guest mode');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await ctx.close();

  // Teacher: the «Compartir con invitados» checkbox is saved to the database
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c2.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
  const t = await c2.newPage();
  const terrs = []; t.on('pageerror', (e) => terrs.push(e.message));
  const writesT = []; t.on('request', (r) => { if (r.url().includes('supabase.co') && r.method() !== 'GET' && !/guest_catalog|auth\/v1/.test(r.url())) writesT.push(r.method() + ' ' + r.url()); });
  await t.goto('file://' + path.resolve(process.argv[2]));
  await t.evaluate(() => localStorage.clear()); await t.reload(); await t.waitForTimeout(400);
  await t.fill('input[type=email]', 'teacher@test.org'); await t.fill('input[type=password]', 'secreto123');
  await t.click('button:has-text("Entrar")'); await t.waitForTimeout(1500);
  await t.focus('.teacher-gate'); await t.keyboard.press('Enter'); await t.waitForTimeout(500);
  assert(await t.isVisible('.card:has-text("Teclado compartido") .badge.shared'), 'teacher sees «👋 Invitados» on shared activities');
  await t.click('.card:has-text("Privada")'); await t.waitForTimeout(300);
  await t.click('.card:has-text("Solo mis alumnos") >> text=Editar'); await t.waitForTimeout(600);
  assert(await t.isVisible('.share-guest:has-text("Compartir con invitados")'), 'editor has «👋 Compartir con invitados»');
  assert(!(await t.isChecked('.share-guest input')), '…off for an activity not shared');
  await t.check('.share-guest input');
  await t.click('button:has-text("Guardar")'); await t.waitForTimeout(3000);
  const row = mock.db.quizzes.find((q) => q.id === 'q-private');
  assert(row && row.shared_guest === true, 'saved to the database: shared_guest = true');
  // Ajustes → «Ver como invitado»: the teacher sees exactly the guest view, then comes back
  await t.click('.tab:has-text("Ajustes")'); await t.waitForTimeout(500);
  assert(await t.isVisible('button:has-text("Ver como invitado")'), 'Ajustes has «👋 Ver como invitado»');
  const pushesBefore = writesT.length;
  await t.click('button:has-text("Ver como invitado")'); await t.waitForTimeout(800);
  assert(await t.isVisible('.guest-chip:has-text("Vista de invitado")') && !(await t.$('.tabs')), 'teacher sees the guest view (no teacher tabs)');
  const gv = await t.evaluate(() => [...document.querySelectorAll('#cardGrid .card .name')].map((x) => x.textContent));
  assert(gv.includes('Inglés') && gv.includes('Teclado compartido') && gv.includes('Privada') && !gv.includes('Compartido pero oculto'), 'guest view lists exactly what guests see (now also «Privada»): ' + gv.join(', '));
  assert(!(await t.$('.card .card-tools')), 'guest view: no editing tools');
  await t.click('.card:has-text("Teclado compartido")'); await t.waitForTimeout(600);
  for (const k of ['shift', 'h', 'i', 'enter']) await t.click('.kb-key[data-k="' + k + '"]', { force: true });
  await t.waitForTimeout(2300);
  assert(await t.isVisible('.my-score') && !(await t.$('.board')), 'guest view: score, no class board');
  await t.click('.finish button:has-text("Salir")'); await t.waitForTimeout(400);
  await t.waitForTimeout(2000);
  assert(writesT.length === pushesBefore, 'guest view: nothing sent to the database (no sync, no results)');
  await t.click('button:has-text("Volver al maestro")'); await t.waitForTimeout(600);
  assert(await t.isVisible('.tabs') && await t.isVisible('button:has-text("Nueva actividad")'), '«Volver al maestro» returns to the teacher area without the PIN');
  const own = await t.evaluate(() => ({ guest: LL.store.isGuest(), n: LL.store.quizzes().length }));
  assert(!own.guest && own.n === 4, 'the teacher\'s own 4 activities are back (' + own.n + ')');
  assert(mock.db.quizzes.length === 4 && !mock.db.quiz_results.length, 'database unchanged by the guest view');
  assert(!terrs.length, 'teacher: no page errors ' + terrs.join(' | '));
  await b.close();
})();
