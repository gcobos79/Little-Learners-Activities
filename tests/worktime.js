// ⏱️ Work time next to the child's name (V127): starts at 0:00, counts, stops at the end,
// restarts with «Otra vez». Also the sort game (no second clock) and small screens.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shots = process.argv[3];
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const card = (id, t) => ({ id, text: t, correct: false, audioMode: 'none' });
const lib = [
  { id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Colores', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [{ id: 'a', text: '¿Rojo?', audioMode: 'none', options: [opt('Sí', 1), opt('No')] }] } },
  { id: 's1', familyId: 's1', version: 1, type: 'sort', name: 'Clasificar', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', visibility: 'visible', settings: {}, questions: [{ id: 'g1', text: 'A', options: [card('c1', 'ala'), card('c2', 'ama')] }, { id: 'g2', text: 'M', options: [card('c3', 'mesa'), card('c4', 'mano')] }] } },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const t = () => p.textContent('#playerTime span');
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(200);
  assert(await p.isVisible('#playerTime'), 'clock shown next to the name');
  assert((await t()) === '0:00', 'starts at 0:00');
  await p.waitForTimeout(2300);
  assert((await t()) === '0:02', 'counts seconds (0:02 after ~2 s): ' + (await t()));
  const box = await p.evaluate(() => { const a = document.querySelector('#playerStudent').getBoundingClientRect(), c = document.querySelector('#playerTime').getBoundingClientRect(); return { a: a.right, c: c.left, same: Math.abs(a.top + a.height / 2 - (c.top + c.height / 2)) < 6 }; });
  assert(box.same && box.c >= box.a, 'clock sits right after the name, same row');
  if (shots) await p.screenshot({ path: shots + '/worktime-quiz.png', clip: { x: 0, y: 0, width: 1180, height: 120 } });
  await p.click('.option:has-text("Sí")'); await p.waitForTimeout(2600);
  assert(await p.isVisible('.finish'), 'activity finished');
  const end = await t();
  await p.waitForTimeout(1500);
  assert((await t()) === end, 'clock stops at the end and keeps the time (' + end + ')');
  await p.click('button:has-text("Otra vez")'); await p.waitForTimeout(200);
  assert((await t()) === '0:00', '«Otra vez» restarts from 0:00');
  // leave, open the sort game
  const r = await (await p.$('#playerExit')).boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down(); await p.waitForTimeout(3200); await p.mouse.up(); await p.waitForTimeout(500);
  await p.click('.card.quiz:has-text("Clasificar")'); await p.waitForTimeout(200);
  assert((await t()) === '0:00', 'sort game: starts at 0:00');
  assert(!(await p.isVisible('.st-time')), 'sort game: only one clock on screen');
  await p.waitForTimeout(1300);
  assert((await t()) === '0:01', 'sort game: counts');
  if (shots) await p.screenshot({ path: shots + '/worktime-sort.png', clip: { x: 0, y: 0, width: 1180, height: 140 } });
  // small screens: nothing overflows the top bar (leave full screen first so the window can resize)
  await p.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await p.waitForTimeout(400);
  for (const [w, h] of [[390, 844], [844, 390], [768, 1024]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(300);
    const ok = await p.evaluate(() => { const c = document.querySelector('#playerTime').getBoundingClientRect(); return c.right <= innerWidth && c.width > 0 && document.documentElement.scrollWidth <= innerWidth; });
    assert(ok, `fits at ${w}×${h}`);
    if (shots) await p.screenshot({ path: `${shots}/worktime-${w}x${h}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 160) } });
  }
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
