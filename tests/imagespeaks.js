// «🔊 Al tocar la imagen, sonar la voz» (V127): ONE choice for the whole quiz. Marked (default) =
// tapping any question's picture plays that question's sound (question, «Leer en voz alta» text or audio
// file); unmarked = no picture does anything. Quizzes saved when it was per question: off if any was off.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shots = process.argv[3];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const qs = (extra = {}) => [
  { id: 'a', text: '¿Cuántos cerditos puedes contar?', image: PNG, audioMode: 'voice', options: [opt('Sí', 1), opt('No')], ...(extra.a || {}) },
  { id: 'b', text: '', image: PNG, audioMode: 'voice', readTextEnabled: true, readText: 'Cuenta los patos', options: [opt('Sí', 1), opt('No')] },
  { id: 'c', text: '', image: PNG, audioMode: 'file', audio: WAV, options: [opt('Sí', 1), opt('No')] },
];
const quiz = (id, name, config) => ({ id, familyId: id, version: 1, type: 'quiz', name, folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', ...config } });
const lib = [
  quiz('q1', 'Con voz', { questions: qs() }),                                           // older quiz: no field → on
  quiz('q2', 'Sin voz', { imageSpeaks: false, questions: qs() }),                       // off for the whole quiz
  quiz('q3', 'Antes por pregunta', { questions: qs({ a: { imageSpeaks: false } }) }),   // per-question era: off
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
    window.__said = []; window.__plays = 0;
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { if (u.text && u.text.trim()) window.__said.push(u.text); };
    HTMLMediaElement.prototype.play = function () { window.__plays++; return Promise.resolve(); };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const tap = async () => { await p.waitForTimeout(500); await p.evaluate(() => { window.__said = []; window.__plays = 0; }); await p.click('.question-image'); await p.waitForTimeout(400); return p.evaluate(() => ({ said: window.__said.slice(), plays: window.__plays })); };
  const next = async () => { await p.click('.option:has-text("Sí")'); await p.waitForTimeout(2400); };
  const play = async (name) => {
    await p.click('.card.quiz:has-text("' + name + '")'); await p.waitForTimeout(600);
    const r = [await tap()]; await next(); r.push(await tap()); await next(); r.push(await tap());
    await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);
    return r;
  };
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  let [r1, r2, r3] = await play('Con voz');
  assert(r1.said.some((t) => t.includes('cerditos')), 'on: picture reads the question');
  assert(r2.said.some((t) => t.includes('Cuenta los patos')), 'on: picture says the «Leer en voz alta» text');
  assert(r3.plays > 0, 'on: picture plays the audio file');
  [r1, r2, r3] = await play('Sin voz');
  assert(!r1.said.length && !r2.said.length && !r3.plays, 'off: no picture in the activity makes a sound (question, text and audio)');
  [r1, r2, r3] = await play('Antes por pregunta');
  assert(!r1.said.length && !r2.said.length && !r3.plays, 'saved per question with one off: the whole activity is off');

  // Editor: one switch in the activity options, none per question; it saves.
  await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  await p.click('.card.quiz:has-text("Con voz") >> text=Editar'); await p.waitForTimeout(600);
  const sw = '.field.image-speaks input[type=checkbox]';
  assert((await p.$$(sw)).length === 1, 'editor: one «Al tocar la imagen, sonar la voz» for the activity');
  assert(!(await p.isVisible('.field:has-text("Imagen (opcional)") .image-speaks')), 'editor: no switch under each question picture');
  assert(await p.isChecked(sw), 'editor: marked by default');
  if (shots) await (await p.$('.field.image-speaks')).screenshot({ path: shots + '/imagespeaks-editor.png' }).catch(() => {});
  await p.uncheck(sw); await p.waitForTimeout(200);
  const saveBtn = await p.$('button:has-text("Guardar")');
  if (saveBtn) { await saveBtn.click(); await p.waitForTimeout(600); }
  const stored = await p.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('ll-activities-v10-templates') || '[]');
    const q = all.filter((x) => x.familyId === 'q1').sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    return q && q.config.imageSpeaks;
  });
  assert(stored === false, 'editor: unmarking is saved for the activity (' + stored + ')');
  // Sync sends it with the activity.
  const sent = await p.evaluate(() => LL.store.imageSpeaksOf({ imageSpeaks: false, questions: [] }) === false && LL.store.imageSpeaksOf({ questions: [{}] }) === true);
  assert(sent, 'helper: explicit value wins, default is on');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
