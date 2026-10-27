// Teacher deletes one child's result: the child is pending again and can redo the activity (V126).
const { chromium } = require('playwright');
const makeMock = require('./mocksb.js');
const path = require('path');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html'); const shot = process.argv[3];
  const mock = makeMock(); const t0 = '2026-10-20T10:00:00.000Z';
  mock.db.students.push({ id: 1, teacher_id: 'u-1111', name: 'Sofía', animal: '🐱', active: true }, { id: 2, teacher_id: 'u-1111', name: 'Z2', animal: '🦁', active: true });
  mock.db.quizzes.push({ id: 'qz1', teacher_id: 'u-1111', name: 'Colores', language: 'es', mode: 'practice', question_order: 'fixed', answer_order: 'fixed', visible: true, created_at: t0, updated_at: t0, deleted_at: null, server_updated_at: t0 });
  mock.db.quiz_questions.push({ quiz_id: 'qz1', id: 'p1', teacher_id: 'u-1111', position: 0, prompt: '¿Rojo?', audio_mode: 'none' });
  mock.db.quiz_options.push({ quiz_id: 'qz1', question_id: 'p1', id: 'c', teacher_id: 'u-1111', position: 0, text: 'rojo', audio_mode: 'none', is_correct: true }, { quiz_id: 'qz1', question_id: 'p1', id: 'w', teacher_id: 'u-1111', position: 1, text: 'azul', audio_mode: 'none', is_correct: false });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.fill('input[type=email]', 'teacher@test.org'); await p.fill('input[type=password]', 'secreto123'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(2500);
  const play = async (student, pick) => {
    await p.click('.student-card:has-text("' + student + '")'); await p.waitForTimeout(500);
    await p.click('#cardGrid >> text=Colores'); await p.waitForTimeout(500);
    await p.click('.option:has-text("' + pick + '")'); await p.waitForTimeout(pick === 'rojo' ? 2400 : 4400);
    await p.waitForTimeout(1000);
  };
  await play('Sofía', 'rojo'); await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(400);
  await play('Z2', 'azul'); await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(1500);
  ok(mock.db.quiz_results.length === 2, 'two results in the database');
  // Teacher opens the results
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores") [aria-label^="Ver resultados"]'); await p.waitForTimeout(1000);
  ok((await p.$$('.rt-row.rt-click .rt-del')).length === 2, 'each result row has a 🗑️ button at the end');
  if (shot) await p.screenshot({ path: shot });
  // The 🗑️ must not open the detail; Cancel keeps it
  await p.click('.rt-row.rt-click:has-text("Z2") .rt-del'); await p.waitForTimeout(300);
  ok(await p.isVisible('.modal:has-text("¿Borrar el resultado de Z2?")') && !(await p.isVisible('.modal .answer-list')), 'asks for confirmation (does not open the detail)');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  ok(mock.db.quiz_results.length === 2 && (await p.$$('.rt-row.rt-click')).length === 2, 'Cancelar keeps the result');
  await p.click('.rt-row.rt-click:has-text("Z2") .rt-del'); await p.waitForTimeout(300);
  await p.click('.modal button:has-text("Borrar")'); await p.waitForTimeout(1200);
  ok(mock.db.quiz_results.length === 1 && mock.db.quiz_results[0].student_id === 1, 'Z2\'s result deleted from the database (Sofía\'s kept)');
  ok((await p.$$('.rt-row.rt-click')).length === 1 && (await p.textContent('.missing')).includes('Z2'), 'Z2 is pending again on the results page');
  ok(!(await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ll-v124-results') || '{}')).some((r) => r.student_name === 'Z2'))), 'removed from this device too');
  // Clicking a row still opens the detail
  await p.click('.rt-row.rt-click:has-text("Sofía")'); await p.waitForTimeout(300);
  ok(await p.isVisible('.modal .answer-list'), 'clicking the row still opens the detail');
  await p.keyboard.press('Escape');
  // Z2 can do it again
  await p.click('.appbar-right button:has-text("Salir")'); await p.waitForTimeout(400);
  await play('Z2', 'rojo');
  const board = await p.$$eval('.board-list li.me', (a) => a.map((x) => x.innerText.replace(/\s+/g, ' ')));
  ok(board.length === 1 && board[0].includes('1 / 1'), 'Z2 plays again and gets a new result (' + board[0] + ')');
  await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(1500);
  ok(mock.db.quiz_results.length === 2 && mock.db.quiz_results.find((r) => r.student_id === 2).score === 1, 'new result saved in the database');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
