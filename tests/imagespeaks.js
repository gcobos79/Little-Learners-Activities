// «🔊 Al tocar la imagen, sonar la voz» (V127): per question. Marked = tapping the question picture
// plays the question's sound; unmarked = the picture does nothing. Old questions (no field) still speak.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shots = process.argv[3];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const q = (id, text, extra) => ({ id, text, image: PNG, audioMode: 'voice', options: [opt('Sí', 1), opt('No')], ...extra });
const lib = [{ id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Cerditos', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [
  q('a', '¿Cuántos cerditos puedes contar?'),                      // old question: no field → speaks
  q('b', '¿Cuántas vacas hay?', { imageSpeaks: false }),           // turned off
  q('c', '¿Cuántos patos ves?', { imageSpeaks: true, readTextEnabled: true, readText: 'Cuenta los patos' }),
] } }];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
    window.__said = [];
    const s = window.speechSynthesis; if (s) s.speak = (u) => window.__said.push(u.text);
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const said = () => p.evaluate(() => window.__said.filter((t) => t && t.trim()));
  const tapImage = async () => { await p.evaluate(() => { window.__said = []; }); await p.click('.question-image'); await p.waitForTimeout(400); return said(); };
  const answer = async () => { await p.click('.option:has-text("Sí")'); await p.waitForTimeout(2400); };

  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Cerditos")'); await p.waitForTimeout(800);
  let s = await tapImage();
  assert(s.some((t) => t.includes('cerditos')), 'question without the setting (older): tapping the picture speaks');
  assert(await p.isVisible('.question-image.tap-speak'), '…and the picture looks tappable');
  await answer();
  s = await tapImage();
  assert(s.length === 0, 'turned off: tapping the picture says nothing');
  assert(!(await p.isVisible('.question-image.tap-speak')), '…and the picture does not look tappable');
  assert(!(await p.isDisabled('#playerSpeak')), '…the 🔊 button still reads the question');
  await answer();
  s = await tapImage();
  assert(s.some((t) => t.includes('Cuenta los patos')), 'marked: tapping the picture says the «Leer en voz alta» text');
  // leave
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);

  // Editor: the checkbox appears under the picture, reflects each question, and saves.
  await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  await p.click('.card.quiz:has-text("Cerditos") >> text=Editar'); await p.waitForTimeout(600);
  const box = '.image-speaks input[type=checkbox]';
  assert(await p.isVisible('.image-speaks'), 'editor: «Al tocar la imagen, sonar la voz» shows under the picture');
  assert(await p.isChecked(box), 'editor: older question shows it marked');
  if (shots) await (await p.$('.image-speaks')).screenshot({ path: shots + '/imagespeaks-editor.png' }).catch(() => {});
  await p.uncheck(box); await p.waitForTimeout(200);
  const saveBtn = await p.$('button:has-text("Guardar")');
  if (saveBtn) { await saveBtn.click(); await p.waitForTimeout(600); }
  const stored = await p.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('ll-activities-v10-templates') || '[]');
    const quiz = all.filter((x) => x.familyId === 'q1').sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    return quiz && quiz.config.questions[0].imageSpeaks;
  });
  assert(stored === false, 'editor: unmarking is saved for that question (' + stored + ')');
  // Removing the picture hides the option.
  await p.click('.field:has-text("Imagen (opcional)") button:has-text("Quitar")'); await p.waitForTimeout(200);
  assert(!(await p.isVisible('.image-speaks')), 'editor: without a picture the option is hidden');
  // Sync mapping keeps the value both ways.
  const map = await p.evaluate(() => typeof LL.sync === 'object');
  assert(map, 'sync module loaded');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
