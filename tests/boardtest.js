// End-of-quiz screen shows today's class results (best first, then pending).
const { chromium } = require('playwright');
const makeMock = require('./mocksb.js');
const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html'); const shots = process.argv[3] || '/tmp';
  const mock = makeMock(); const t0 = '2026-10-20T10:00:00.000Z';
  mock.db.activities_students.push({ id: 1, teacher_id: 'u-1111', name: 'Sofía', animal: '🐱', active: true }, { id: 2, teacher_id: 'u-1111', name: 'Diego', animal: '🦁', active: true }, { id: 3, teacher_id: 'u-1111', name: 'Lucía', animal: '🐸', active: true });
  mock.db.quizzes.push({ id: 'qz1', teacher_id: 'u-1111', name: 'Colores', language: 'es', mode: 'practice', question_order: 'fixed', answer_order: 'fixed', visible: true, created_at: t0, updated_at: t0, deleted_at: null, server_updated_at: t0 });
  mock.db.quiz_questions.push({ quiz_id: 'qz1', id: 'p1', teacher_id: 'u-1111', position: 0, prompt: '¿Rojo?', audio_mode: 'none' });
  mock.db.quiz_options.push({ quiz_id: 'qz1', question_id: 'p1', id: 'c', teacher_id: 'u-1111', position: 0, text: 'rojo', audio_mode: 'none', is_correct: true }, { quiz_id: 'qz1', question_id: 'p1', id: 'w', teacher_id: 'u-1111', position: 1, text: 'azul', audio_mode: 'none', is_correct: false });
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1280, 800, 'tab'], [390, 844, 'phone']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
    await p.fill('input[type=email]', 'teacher@test.org'); await p.fill('input[type=password]', 'secreto123'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(2000);
    const play = async (student, pick) => {
      await p.click('.student-card:has-text("' + student + '")'); await p.waitForTimeout(500);
      await p.click('#cardGrid >> text=Colores'); await p.waitForTimeout(500);
      await p.click('.option:has-text("' + pick + '")'); await p.waitForTimeout(pick === 'rojo' ? 2600 : 4600);
      await p.waitForTimeout(1200);
    };
    await play(tag === 'tab' ? 'Diego' : 'Lucía', 'azul');
    const rows1 = await p.$$eval('.board-list li', (a) => a.map((x) => x.className + ':' + x.innerText.replace(/\s+/g, ' ')));
    console.log(tag, rows1);
    if (tag === 'tab') {
      ok(rows1.length === 3 && rows1[0].includes('me') && rows1[0].includes('Diego') && rows1[0].includes('0 / 1') && rows1.filter((r) => r.includes('Pendiente')).length === 2, 'Diego sees himself plus Sofía and Lucía as pending');
      await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(400);
      ok(await p.isVisible('#screen-students') && !(await p.isVisible('#player')), '«Salir» goes back to «¿Quién eres?»');
      await play('Sofía', 'rojo');
      const rows2 = await p.$$eval('.board-list li', (a) => a.map((x) => x.className + ':' + x.innerText.replace(/\s+/g, ' ')));
      console.log(tag, rows2);
      ok(rows2[0].includes('Sofía') && rows2[0].includes('1 / 1') && rows2[0].includes('me') && rows2[1].includes('Diego') && rows2[2].includes('Lucía') && rows2[2].includes('Pendiente'), 'best score on top, then lower, then pending');
      ok(await p.isVisible('.finish button:has-text("Otra vez")') && await p.isVisible('.finish button:has-text("Salir")') && !(await p.isVisible('.finish button:has-text("Mis actividades")')), 'buttons: Otra vez and Salir');
      const font = await p.evaluate(() => getComputedStyle(document.querySelector('#player')).fontFamily);
      ok(font.startsWith('"Century Gothic"'), 'player uses Century Gothic first: ' + font.slice(0, 40));
    }
    await p.screenshot({ path: shots + '/board-' + tag + '.png' });
    console.log('errors', errs);
    await ctx.close();
  }
  await b.close();
})();
