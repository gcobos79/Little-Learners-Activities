// Tapping the question picture reads the question, like the 🔊 button (V125).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const quiz = (id, name, questions) => ({ id, familyId: id, version: 1, type: 'quiz', name, folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions } });
const lib = [
  quiz('qa', 'Con imagen', [
    { id: 'q1', text: '¿Quién es?', image: PNG, audioMode: 'voice', options: [opt('Abuela', 1), opt('Bombero')] },
    { id: 'q2', text: 'Sin sonido', image: PNG, audioMode: 'none', options: [opt('Sí', 1), opt('No')] },
  ]),
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    window.__said = [];
    const s = window.speechSynthesis;
    if (s) { s.speak = (u) => window.__said.push(u.text); s.cancel = () => {}; }
  });
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Con imagen")'); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__said = []; });
  assert(await p.isVisible('#player .question-image.tap-speak'), 'picture is marked as tappable');
  await p.click('#player .question-image'); await p.waitForTimeout(200);
  const said = await p.evaluate(() => window.__said);
  assert(said.includes('¿Quién es?'), 'tapping the picture reads the question (' + JSON.stringify(said) + ')');
  await p.evaluate(() => { window.__said = []; });
  await p.click('#playerSpeak'); await p.waitForTimeout(200);
  assert((await p.evaluate(() => window.__said)).includes('¿Quién es?'), 'the 🔊 button still reads it');
  await p.evaluate(() => { window.__said = []; });
  await p.focus('#player .question-image'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  assert((await p.evaluate(() => window.__said)).includes('¿Quién es?'), 'keyboard Enter on the picture reads it');
  // Next question has no sound: the picture is not tappable.
  await p.click('#player .option:has-text("Abuela")'); await p.waitForTimeout(2500);
  if (await p.isVisible('#player button:has-text("Siguiente")')) { await p.click('#player button:has-text("Siguiente")'); await p.waitForTimeout(500); }
  const second = await p.textContent('#player .question-text').catch(() => '');
  assert(second.includes('Sin sonido') && !(await p.$('#player .question-image.tap-speak')), 'no sound set: picture is not a button');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
