// A student's activity opens in full screen and leaves it when the activity closes (V127).
// The teacher's preview does not go full screen.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const lib = [{ id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Colores', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [{ id: 'a', text: '¿Rojo?', audioMode: 'none', options: [opt('Sí', 1), opt('No')] }] } }];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const fs = () => p.evaluate(() => !!document.fullscreenElement);
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  assert(!(await fs()), 'picking a student does not go full screen');
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(800);
  assert(await p.isVisible('#player'), 'student opened the activity');
  assert(await fs(), 'the activity is in full screen');
  // Left full screen another way (Esc / system gesture): the next tap brings it back.
  await p.evaluate(() => document.exitFullscreen()); await p.waitForTimeout(400);
  assert(!(await fs()) && (await p.isVisible('#player')), 'left full screen, activity still open');
  await p.click('#playerBody', { position: { x: 20, y: 20 } }); await p.waitForTimeout(600);
  assert(await fs(), 'a tap in the activity returns to full screen');
  // Hold ↩️ 3 s: leaves the activity and full screen.
  const r = await (await p.$('#playerExit')).boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down(); await p.waitForTimeout(3200); await p.mouse.up(); await p.waitForTimeout(600);
  assert(!(await p.isVisible('#player')), 'holding ↩️ leaves the activity');
  assert(!(await fs()), 'leaving the activity leaves full screen');
  // Teacher preview: no full screen.
  await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores") .card-main'); await p.waitForTimeout(800);
  assert(await p.isVisible('#player'), 'teacher preview opened');
  assert(!(await fs()), 'teacher preview is not full screen');
  await p.click('#playerExit'); await p.waitForTimeout(300);
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
