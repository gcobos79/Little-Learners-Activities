// V123: students from the database, quizzes in real tables, pictures in storage, migration from V122.
const { chromium } = require('playwright');
const makeMock = require('./mocksb.js');
const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html');
  const mock = makeMock();
  const t0 = '2026-10-20T10:00:00.000Z';
  // Existing data in the real project: students without icons, and quizzes saved by V122 in ll_quizzes.
  mock.db.students.push({ id: 1, teacher_id: 'u-1111', name: 'Sofía', active: true, animal: null }, { id: 2, teacher_id: 'u-1111', name: 'Diego', active: true, animal: '🦁' }, { id: 3, teacher_id: 'u-1111', name: 'Inactivo', active: false, animal: '🐸' }, { id: 4, teacher_id: 'u-2222', name: 'De otra maestra', active: true, animal: '🐼' });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  mock.db.ll_folders.push({ owner_id: 'u-1111', id: 'folder-1792914497974-36fl6', name: 'Español', parent_id: null, color: '#F6D6D6', updated_at: t0, deleted_at: null, server_updated_at: t0 });
  mock.db.ll_quizzes.push({ owner_id: 'u-1111', id: 'quiz-old-1', family_id: 'quiz-old-1', type: 'quiz', name: 'Granja', version: 1, folder_id: 'folder-1792914497974-36fl6', created_at: t0, updated_at: t0, deleted_at: null, server_updated_at: t0,
    config: { lang: 'es', mode: 'practice', questionOrder: 'fixed', answerOrder: 'fixed', visibility: 'visible', coverImage: png, questions: [
      { id: 'q1', text: '¿Cuál es la vaca?', audioMode: 'voice', image: png, options: [{ id: 'o1', text: 'vaca', image: png, correct: true, audioMode: 'none' }, { id: 'o2', text: 'pato', correct: false, audioMode: 'none' }] },
      { id: 'q1', text: 'Id repetido', audioMode: 'none', options: [{ id: 'o1', text: 'a', correct: true }, { id: 'o1', text: 'b', correct: false }] }] } });

  const b = await chromium.launch();
  const mk = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }); await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  const signIn = async (p, email, pass) => { await p.fill('input[type=email]', email); await p.fill('input[type=password]', pass); await p.click('button:has-text("Entrar")'); };

  const A = await mk(1280, 800);
  await A.goto('file://' + file); await A.evaluate(() => localStorage.clear()); await A.reload(); await A.waitForTimeout(300);
  await signIn(A, 'teacher@test.org', 'secreto123'); await A.waitForTimeout(3000);
  ok(mock.db.quizzes.length === 1 && mock.db.quizzes[0].name === 'Granja', 'V122 quiz moved into table quizzes');
  ok(mock.db.quiz_questions.length === 2 && mock.db.quiz_options.length === 4, 'questions/options rows created (' + mock.db.quiz_questions.length + '/' + mock.db.quiz_options.length + '), repeated ids repaired');
  ok(mock.db.quizzes[0].cover_path && mock.db.quiz_questions.some((q) => q.image_path) && mock.db.quiz_options.some((o) => o.image_path), 'pictures uploaded to storage, rows keep only the path');
  ok(mock.db.folders.length === 1 && mock.db.quizzes[0].folder_id === mock.db.folders[0].id, 'folder moved into table folders and linked');
  const libSize = await A.evaluate(() => localStorage.getItem('ll-activities-v10-templates').length);
  ok(libSize < 3000, 'device copy no longer holds picture data (' + libSize + ' chars)');
  const names = await A.$$eval('.student-card', (a) => a.map((x) => x.textContent));
  ok(names.length === 2 && names.join().includes('Sofía') && !names.join().includes('Abigail') && !names.join().includes('Inactivo') && !names.join().includes('otra'), 'student picker shows real active students only: ' + names.join(', '));
  ok(mock.db.students.find((s) => s.id === 1).animal, 'student without icon got a random animal saved in the database');

  // Teacher: add a student with a picture, remove one
  await A.focus('.teacher-gate'); await A.keyboard.press('Enter'); await A.waitForTimeout(300);
  await A.click('.tab >> nth=1'); await A.waitForTimeout(300);
  await A.click('button:has-text("Agregar estudiante")'); await A.fill('.modal input[type=text]', 'Valentina');
  const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('.modal button:has-text("Elegir foto")')]);
  await fc.setFiles({ name: 'v.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }); await A.waitForTimeout(400);
  await A.click('.modal button:has-text("Agregar")'); await A.waitForTimeout(1200);
  const v = mock.db.students.find((s) => s.name === 'Valentina');
  ok(v && v.teacher_id === 'u-1111' && v.avatar_path && v.animal, 'new student saved in students with picture and animal');
  await A.click('.roster-row:has-text("Diego") button:has-text("Quitar")'); await A.click('.modal button:has-text("Quitar")'); await A.waitForTimeout(800);
  ok(mock.db.students.find((s) => s.id === 2).active === false, 'removing a student marks them inactive (results kept)');
  await A.screenshot({ path: (process.argv[3] || '/tmp') + '/db-students.png' });

  // New quiz with a picture answer
  await A.click('.tab >> nth=0'); await A.waitForTimeout(300);
  await A.click('#newQuizBtn'); await A.waitForTimeout(300);
  await A.fill('#edName', 'Colores'); await A.fill('#edQuestion textarea', '¿Cuál es rojo?');
  const ins = await A.$$('#edQuestion .answer input[type=text]'); for (let i = 0; i < 4; i++) await ins[i].fill(['rojo', 'azul', 'verde', 'amarillo'][i]);
  const [fc2] = await Promise.all([A.waitForEvent('filechooser'), A.click('.answer >> nth=0 >> button:has-text("Imagen")')]);
  await fc2.setFiles({ name: 'r.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }); await A.waitForTimeout(300);
  await A.click('.answer >> nth=0 >> .correct-toggle'); await A.click('label.switch:has-text("Visible para estudiantes")');
  await A.click('button:has-text("💾 Guardar")'); await A.waitForTimeout(3500);
  const col = mock.db.quizzes.find((q) => q.name === 'Colores');
  ok(col && col.visible === true && mock.db.quiz_options.some((o) => o.quiz_id === col.id && o.is_correct && o.image_path), 'new quiz saved with question, correct answer and picture');

  // Tablet B gets everything from the new tables
  const B = await mk(800, 1280);
  await B.goto('file://' + file); await B.evaluate(() => localStorage.clear()); await B.reload(); await B.waitForTimeout(300);
  await signIn(B, 'teacher@test.org', 'secreto123'); await B.waitForTimeout(3000);
  const bq = await B.evaluate(() => LL.store.quizzes().map((q) => q.name).sort());
  ok(JSON.stringify(bq) === JSON.stringify(['Colores', 'Granja']), 'tablet downloads quizzes from the database: ' + bq.join(', '));
  ok(mock.db.quizzes.length === 2, 'tablet did not create duplicates (' + mock.db.quizzes.length + ' quizzes in DB)');
  const bs = await B.$$eval('.student-card', (a) => a.map((x) => x.textContent));
  ok(bs.join().includes('Valentina') && !bs.join().includes('Diego'), 'tablet shows the updated class list: ' + bs.join(', '));
  await B.click('.student-card:has-text("Valentina")'); await B.waitForTimeout(500);
  await B.click('#cardGrid >> text=Español'); await B.waitForTimeout(400);
  await B.click('#cardGrid >> text=Granja'); await B.waitForTimeout(1200);
  const imgs = await B.$$eval('#player img', (a) => a.map((i) => ({ src: i.src.slice(0, 5), ok: i.complete })));
  ok(imgs.length >= 2 && imgs.every((i) => i.src === 'blob:'), 'player shows pictures downloaded from storage (' + imgs.length + ')');
  ok(await B.isVisible('#playerStudent .avatar-img'), 'player shows Valentina’s picture next to her name');
  await B.screenshot({ path: (process.argv[3] || '/tmp') + '/db-player.png' });
  await B.evaluate(() => LL.player.close());

  // Delete on A reaches B; backup from B has pictures inside
  await A.click('button:has-text("Mis actividades")'); await A.waitForTimeout(400);
  await A.click('.card.quiz:has-text("Colores") .icon-btn[aria-label^="Más opciones"]'); await A.click('.menu >> text=Eliminar'); await A.click('.modal button:has-text("Eliminar")'); await A.waitForTimeout(2500);
  ok(mock.db.quizzes.find((q) => q.name === 'Colores').deleted_at, 'deleting marks the quiz deleted in the database');
  await B.evaluate(() => LL.sync.run()); await B.waitForTimeout(1000);
  ok(!(await B.evaluate(() => LL.store.quizzes().some((q) => q.name === 'Colores'))), 'deletion reaches the tablet');
  const backup = await B.evaluate(async () => JSON.stringify(await LL.media.inlineBackup(LL.store.exportBackup())));
  ok(backup.includes('data:image/') && !backup.includes('sb:quiz-media'), 'backup file contains the pictures themselves');
  if (!backup.includes('data:image/') || backup.includes('sb:quiz-media')) console.log(backup.slice(0, 1500));

  // Another teacher sees nothing of the first
  const C = await mk(1280, 800);
  await C.goto('file://' + file); await C.evaluate(() => localStorage.clear()); await C.reload(); await C.waitForTimeout(300);
  await signIn(C, 'other@test.org', 'otro12345'); await C.waitForTimeout(2500);
  const cs = await C.$$eval('.student-card', (a) => a.map((x) => x.textContent));
  ok(cs.length === 1 && cs[0].includes('De otra maestra') && (await C.evaluate(() => LL.store.quizzes().length)) === 0, 'second teacher only sees their own students and no quizzes');
  console.log('ERRORS', A.errs, B.errs, C.errs, mock.stats());
  await b.close();
})();
