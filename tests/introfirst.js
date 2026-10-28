// V127: when a quiz has instructions, they are read first when the activity starts, then question 1's
// sound (question text, «Leer en voz alta» text or audio file). Only at the start (and again on «Otra vez»).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const Q = (id, extra) => ({ id, text: '', image: PNG, audioMode: 'voice', options: [opt('Sí', 1), opt('No')], ...extra });
const quiz = (id, name, config) => ({ id, familyId: id, version: 1, type: 'quiz', name, folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', ...config } });
const INS = 'Escucha la pregunta y toca la respuesta correcta.';
const lib = [
  quiz('q1', 'Con instrucciones', { instructions: INS, questions: [Q('a', { text: '¿Cuántos cerditos hay?' }), Q('b', { text: '¿Cuántas vacas hay?' })] }),
  quiz('q2', 'Sin instrucciones', { questions: [Q('a', { text: '¿Cuántos patos hay?' })] }),
  quiz('q3', 'Texto diferente', { instructions: INS, questions: [Q('a', { readTextEnabled: true, readText: 'Cuenta los pollitos' })] }),
  quiz('q4', 'Con audio', { instructions: INS, questions: [Q('a', { audioMode: 'file', audio: WAV })] }),
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
    // Fake voice: each reading "lasts" 1.2 s, then fires «end»; cancel() fires «interrupted».
    window.__log = []; let cur = null, tm = null;
    const s = window.speechSynthesis;
    Object.defineProperty(s, 'speaking', { get: () => !!cur, configurable: true });
    s.speak = (u) => {
      if (!u.text || !u.text.trim()) return;
      window.__log.push('voz: ' + u.text); cur = u;
      tm = setTimeout(() => { if (cur === u) { cur = null; u.onend && u.onend({}); } }, 1200);
    };
    s.cancel = () => { const u = cur; cur = null; clearTimeout(tm); if (u && u.onerror) u.onerror({ error: 'interrupted' }); };
    HTMLMediaElement.prototype.play = function () { window.__log.push('audio'); return Promise.resolve(); };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  const log = () => p.evaluate(() => window.__log.slice());
  const reset = () => p.evaluate(() => { window.__log = []; });
  const open = async (name) => { await reset(); await p.click('.card.quiz:has-text("' + name + '")'); };
  const leave = async () => { await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300); };
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);

  await open('Con instrucciones'); await p.waitForTimeout(800);
  let l = await log();
  assert(l.length === 1 && l[0] === 'voz: ' + INS, 'starts with the instructions (and only them while they play)');
  await p.waitForTimeout(1600);
  l = await log();
  assert(l.length === 2 && l[1] === 'voz: ¿Cuántos cerditos hay?', 'then the question: ' + JSON.stringify(l));
  await p.waitForTimeout(1500);
  assert((await log()).length === 2, 'nothing is repeated');
  await reset(); await p.click('.option:has-text("Sí")'); await p.waitForTimeout(3600);
  l = (await log()).filter((x) => x.startsWith('voz'));
  assert(l.length === 1 && l[0] === 'voz: ¿Cuántas vacas hay?', 'question 2: only the question, no instructions: ' + JSON.stringify(l));
  await p.click('.option:has-text("Sí")'); await p.waitForTimeout(2800);
  assert(await p.isVisible('.finish'), 'finished');
  await reset(); await p.click('button:has-text("Otra vez")'); await p.waitForTimeout(3200);
  l = (await log()).filter((x) => x.startsWith('voz'));
  assert(l[0] === 'voz: ' + INS && l[1] === 'voz: ¿Cuántos cerditos hay?', '«Otra vez»: instructions, then question 1 again');
  await leave();

  await open('Sin instrucciones'); await p.waitForTimeout(900);
  l = await log();
  assert(l.length === 1 && l[0] === 'voz: ¿Cuántos patos hay?', 'no instructions: the question right away');
  await leave();

  await open('Texto diferente'); await p.waitForTimeout(3200);
  l = await log();
  assert(l[0] === 'voz: ' + INS && l[1] === 'voz: Cuenta los pollitos', 'instructions, then the «Leer en voz alta» text');
  await leave();

  await open('Con audio'); await p.waitForTimeout(3200);
  l = await log();
  assert(l[0] === 'voz: ' + INS && l[1] === 'audio', 'instructions, then the audio file');
  await leave();

  // The child taps the question picture during the instructions: the question plays once, no repeat after.
  await open('Con instrucciones'); await p.waitForTimeout(700);
  await p.click('.question-image'); await p.waitForTimeout(3000);
  l = (await log()).filter((x) => x.includes('cerditos'));
  assert(l.length === 1, 'tapping during the instructions: the question is read once (' + l.length + ')');
  await leave();
  // The child answers during the instructions: nothing else is read for that question.
  await open('Con instrucciones'); await p.waitForTimeout(700);
  await p.click('.option:has-text("Sí")'); await p.waitForTimeout(1500);
  l = await log();
  assert(!l.some((x) => x.includes('cerditos')), 'answering during the instructions: question 1 is not read afterwards');
  await leave();
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
