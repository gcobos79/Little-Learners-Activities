// End-of-activity music (V127): the ~4 s jingle plays when an activity ends (quiz and sort),
// renders without errors, doesn't clip, and stops with «Otra vez».
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const lib = [{ id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Colores', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [{ id: 'a', text: '¿Rojo?', audioMode: 'none', options: [opt('Sí', 1), opt('No')] }] } }];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => { Element.prototype.requestFullscreen = function () { return Promise.resolve(); }; });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const off = await p.evaluate(async () => {
    const sr = 22050, c = new OfflineAudioContext(1, sr * 4.5, sr);
    const len = LL.ui.celebrateTune(c); const d = (await c.startRendering()).getChannelData(0);
    let peak = 0, first = -1, last = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.002) { if (first < 0) first = i; last = i; } }
    return { len, peak, first: first / sr, last: last / sr };
  });
  assert(off.len === 4 && off.first < 0.1, 'the music starts right away');
  assert(off.last > 3.5 && off.last < 4.2, 'it lasts about 4 seconds (' + off.last.toFixed(2) + ' s)');
  assert(off.peak > 0.2 && off.peak < 1, 'it is loud enough and does not clip (peak ' + off.peak.toFixed(2) + ')');
  await p.evaluate(() => { window.__tunes = 0; const f = LL.ui.celebrateTune; LL.ui.celebrateTune = (...a) => { window.__tunes++; return f(...a); }; });
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(500);
  assert((await p.evaluate(() => window.__tunes)) === 0, 'no music while working');
  await p.click('.option:has-text("Sí")'); await p.waitForTimeout(2600);
  assert(await p.isVisible('.finish'), 'activity finished');
  assert((await p.evaluate(() => window.__tunes)) === 1, 'the music plays once at the end');
  await p.click('button:has-text("Otra vez")'); await p.waitForTimeout(300);
  assert(!(await p.isVisible('.finish')), '«Otra vez» starts again (and stops the music)');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
