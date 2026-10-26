// End-of-quiz board: time column (m:ss) and, with the same score, the faster child goes first (V125).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = process.argv[3];
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const lib = [{ id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Colores', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [
  { id: 'a', text: '¿Rojo?', audioMode: 'none', options: [opt('Sí', 1), opt('No')] },
  { id: 'b', text: '¿Azul?', audioMode: 'none', options: [opt('Sí', 1), opt('No')] }] } }];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const roster = await p.evaluate(() => LL.store.roster().map((s) => s.name));
  // Earlier results today for other children (same quiz).
  await p.evaluate((names) => {
    const quiz = LL.store.getQuiz('q1');
    const now = Date.now();
    const add = (name, correct, secs) => LL.results.record({ quiz, student: { name }, total: 2,
      answers: [{ position: 1, correct: correct >= 1 }, { position: 2, correct: correct >= 2 }],
      startedAt: new Date(now - 60000 - secs * 1000).toISOString(), finishedAt: new Date(now - 60000).toISOString() });
    add(names[1], 1, 30);   // 1/2 fast
    add(names[2], 2, 200);  // 2/2 slow  -> 1st or behind faster 2/2
    add(names[3], 2, 65);   // 2/2 1:05  -> 1st
    add(names[4], 2, 125);  // 2/2 2:05
    add(names[5], 2, 125);  // 2/2 2:05  -> ties with names[4]
  }, roster);
  // The child (names[0]) plays and gets 2/2 quickly.
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(600);
  for (let i = 0; i < 2; i++) { await p.click('#player .option:has-text("Sí")'); await p.waitForTimeout(2600); }
  await p.waitForSelector('.board-list li', { timeout: 5000 });
  await p.waitForTimeout(400);
  const rows = await p.$$eval('.board-list li:not(.pending)', (a) => a.map((x) => ({ place: x.querySelector('.b-place').textContent, name: x.querySelector('.b-name').textContent, score: x.querySelector('.b-score').textContent, time: x.querySelector('.b-time').textContent })));
  console.log(rows.map((r) => r.place + ' ' + r.name + ' ' + r.score + ' ' + r.time).join('\n'));
  const order = rows.map((r) => r.name);
  assert(await p.isVisible('.board-head:has-text("Tiempo")'), 'board has a «Tiempo» column');
  assert(order[0] === roster[0] && /^0:0\d$/.test(rows[0].time), 'fastest 2/2 is first (' + rows[0].time + ')');
  assert(order[1] === roster[3] && rows[1].time === '1:05' && rows[1].place === '🥈', '2/2 in 1:05 is second');
  assert(rows[2].time === '2:05' && rows[3].time === '2:05' && rows[2].place === '🥉' && rows[3].place === '🥉', 'same score and same time share the place');
  assert(order[4] === roster[2] && rows[4].time === '3:20' && rows[4].place === '5', 'slow 2/2 (3:20) is 5th, after faster 2/2');
  assert(order[5] === roster[1] && rows[5].score.trim() === '1 / 2' && rows[5].place === '6', 'lower score is last even if fastest');
  if (roster.length > 6) assert(await p.isVisible('.board-list li.pending'), 'children who have not played are still listed as pending');
  if (shot) await p.screenshot({ path: shot });
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  // Small phone: columns fit without horizontal scrolling
  await p.setViewportSize({ width: 375, height: 700 }); await p.waitForTimeout(300);
  const over = await p.$$eval('.board-list li', (a) => a.some((x) => x.scrollWidth > x.clientWidth + 1));
  assert(!over, 'phone: rows fit');
  if (shot) await p.screenshot({ path: shot.replace('.png', '-phone.png') });
  await b.close();
})();
