// Students leave an activity only by holding ↩️ for 3 seconds (V125).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = process.argv[3];
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
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(600);
  const open = () => p.isVisible('#player');
  assert(await open(), 'student opened the activity');
  // quick click: stays
  await p.click('#playerExit'); await p.waitForTimeout(300);
  assert(await open(), 'a quick tap does not leave');
  assert(await p.isVisible('.toast:has-text("deja el dedo")'), 'a quick tap explains how to leave');
  // Escape: stays
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  assert(await open(), 'Esc does not leave for students');
  // hold 1.5 s then release: stays
  const r = await (await p.$('#playerExit')).boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down(); await p.waitForTimeout(1500);
  assert(await p.isVisible('#playerExit.holding'), 'holding shows the ring filling');
  if (shot) await p.screenshot({ path: shot, clip: { x: 0, y: 0, width: 400, height: 140 } });
  await p.mouse.up(); await p.waitForTimeout(300);
  assert(await open(), 'letting go before 3 seconds: stays');
  // finger slides off: cancels
  await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.move(r.x + 300, r.y + 300); await p.waitForTimeout(2600); await p.mouse.up();
  assert(await open(), 'sliding the finger off the button cancels');
  // hold 3 s: leaves
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down(); await p.waitForTimeout(3200);
  assert(!(await open()), 'holding 3 seconds leaves the activity');
  await p.mouse.up(); await p.waitForTimeout(300);
  assert(!(await open()) && (await p.isVisible('#studentGrid')) && (await p.evaluate(() => LL.app.state.screen === 'students' && !LL.app.state.student)), 'student: back on «¿Quién eres?» (all the students); nothing reopened');
  // touch hold
  await p.waitForTimeout(400);
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(p);
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] }); await p.waitForTimeout(1000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
  assert(await open(), 'touch: 1 second is not enough');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] }); await p.waitForTimeout(3200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
  assert(!(await open()), 'touch: holding 3 seconds leaves');
  assert(await p.isVisible('#studentGrid'), 'touch: also back on «¿Quién eres?»');
  // teacher preview: a normal click leaves
  // already on «¿Quién eres?» after leaving the activity
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores") .card-main'); await p.waitForTimeout(600);
  assert(await open(), 'teacher preview opened');
  await p.click('#playerExit'); await p.waitForTimeout(300);
  assert(!(await open()), 'teacher preview: a normal click leaves');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
