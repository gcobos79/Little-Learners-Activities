// V124: results — one per student/quiz/month, newest attempt wins, offline queue, teacher ranking.
const { chromium } = require('playwright');
const makeMock = require('./mocksb.js');
const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html'); const shots = process.argv[3] || '/tmp';
  const mock = makeMock(); const t0 = '2026-10-20T10:00:00.000Z';
  mock.db.students.push({ id: 1, teacher_id: 'u-1111', name: 'Sofía', animal: '🐱', active: true }, { id: 2, teacher_id: 'u-1111', name: 'Diego', animal: '🦁', active: true }, { id: 3, teacher_id: 'u-1111', name: 'Lucía', animal: '🐸', active: true });
  mock.db.quizzes.push({ id: 'qz1', teacher_id: 'u-1111', name: 'Colores', language: 'es', mode: 'assessment', question_order: 'fixed', answer_order: 'fixed', visible: true, created_at: t0, updated_at: t0, deleted_at: null, server_updated_at: t0 });
  mock.db.quiz_questions.push({ quiz_id: 'qz1', id: 'p1', teacher_id: 'u-1111', position: 0, prompt: '¿Rojo?', audio_mode: 'none' }, { quiz_id: 'qz1', id: 'p2', teacher_id: 'u-1111', position: 1, prompt: '¿Azul?', audio_mode: 'none' });
  for (const [q, a, b] of [['p1', 'rojo', 'azul'], ['p2', 'azul', 'verde']]) mock.db.quiz_options.push({ quiz_id: 'qz1', question_id: q, id: 'c', teacher_id: 'u-1111', position: 0, text: a, audio_mode: 'none', is_correct: true }, { quiz_id: 'qz1', question_id: q, id: 'w', teacher_id: 'u-1111', position: 1, text: b, audio_mode: 'none', is_correct: false });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  let offline = false;
  await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', (route) => (offline ? route.abort('internetdisconnected') : mock.handler(route)));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.fill('input[type=email]', 'teacher@test.org'); await p.fill('input[type=password]', 'secreto123'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(2500);

  const play = async (student, picks) => {
    await p.click('.student-card:has-text("' + student + '")'); await p.waitForTimeout(500);
    await p.click('#cardGrid >> text=Colores'); await p.waitForTimeout(500);
    for (const pick of picks) { await p.click('.option:has-text("' + pick + '")'); await p.waitForTimeout(pick === 'rojo' || pick === 'azul' && picks.indexOf(pick) === 1 ? 2300 : 4300); }
    await p.waitForTimeout(800);
    await p.click('.finish button:has-text("Mis actividades")'); await p.waitForTimeout(300);
    await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  };
  // The quiz was saved as "assessment" before: it must now behave as practice (shows the correct answer after a mistake).
  await play('Sofía', ['azul', 'azul']); // 1st wrong, 2nd right -> 1/2
  await p.waitForTimeout(1200);
  ok(mock.db.quiz_results.length === 1 && mock.db.quiz_results[0].score === 1 && mock.db.quiz_results[0].total === 2, 'result saved: Sofía 1/2');
  ok(mock.db.quiz_result_answers.length === 2 && mock.db.quiz_result_answers.some((a) => a.correct === false && a.chosen_text === 'azul'), 'question-by-question detail saved');
  await play('Sofía', ['rojo', 'azul']); await p.waitForTimeout(1200); // 2/2, same month
  ok(mock.db.quiz_results.length === 1 && mock.db.quiz_results[0].score === 2, 'same month: newest attempt replaced the older one (still 1 row, 2/2)');
  // Offline: Diego plays, result waits on the device
  offline = true;
  await play('Diego', ['azul', 'verde']); await p.waitForTimeout(800); // 0/2
  ok(mock.db.quiz_results.length === 1, 'offline: nothing uploaded yet');
  ok(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ll-v124-results') || '{}')).length === 1), 'offline: result kept on the tablet');
  offline = false;
  await p.evaluate(() => LL.sync.run()); await p.waitForTimeout(1500);
  ok(mock.db.quiz_results.length === 2 && mock.db.quiz_results.find((r) => r.student_id === 2).score === 0, 'back online: waiting result uploaded');
  // Teacher view
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores") .icon-btn[title="Ver resultados"]'); await p.waitForTimeout(1200);
  const rows = await p.$$eval('.rt-row:not(.rt-head)', (a) => a.map((x) => x.innerText.replace(/\s+/g, ' ')));
  console.log(rows);
  ok(rows.length === 2 && rows[0].includes('1') && rows[0].includes('Sofía') && rows[0].includes('2 / 2') && rows[1].includes('Diego') && rows[1].includes('0 / 2'), 'ranking: highest score first with place numbers');
  ok((await p.textContent('.missing')).includes('Lucía'), 'shows who has not done it this month');
  await p.screenshot({ path: shots + '/results.png' });
  await p.click('.rt-row:has-text("Sofía")'); await p.waitForTimeout(300);
  ok((await p.$$('.answer-list li.good')).length === 2, 'detail shows each question with ✓/✗');
  await p.screenshot({ path: shots + '/results-detail.png' });
  await p.keyboard.press('Escape');
  await p.click('.month-nav button[aria-label="Mes anterior"]'); await p.waitForTimeout(800);
  ok((await p.textContent('#screen-results')).includes('Nadie ha hecho'), 'previous month shows no results');
  // Editor: no more "Evaluación"
  await p.click('button:has-text("Mis actividades")'); await p.waitForTimeout(300);
  await p.click('.card.quiz:has-text("Colores") >> text=Editar'); await p.waitForTimeout(400);
  ok(!(await p.textContent('#screen-editor')).includes('Evaluación'), 'editor has no "Evaluación" option');
  console.log('ERRORS', errs);
  await b.close();
})();
