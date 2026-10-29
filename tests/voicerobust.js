// Reliable speech (V127): imitates two Chromebook problems with the online «Google español» voice:
//  1) a reading sent less than 100 ms after cancel() is silently dropped;
//  2) the online voice fails («synthesis-failed»).
// The app must still be heard: it waits after a cancel and retries with another Spanish voice.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const lib = [{ id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Cerditos', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', instructions: 'Escucha y toca la respuesta.', questions: [{ id: 'a', text: '¿Cuántos cerditos hay?', audioMode: 'voice', options: [opt('Uno', 1), opt('Dos')] }] } }];
(async () => {
  const b = await chromium.launch();
  for (const failOnline of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript((failOnline) => {
      Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
      const online = { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false, default: false, voiceURI: 'g-es' };
      const local = { name: 'Chrome OS español', lang: 'es-US', localService: true, default: false, voiceURI: 'c-es' };
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      window.__heard = []; let cur = null, tm = null, lastCancel = 0;
      const s = window.speechSynthesis;
      s.getVoices = () => [online, local];
      Object.defineProperty(s, 'speaking', { get: () => !!cur, configurable: true });
      Object.defineProperty(s, 'pending', { get: () => false, configurable: true });
      s.cancel = () => { lastCancel = Date.now(); const u = cur; cur = null; clearTimeout(tm); if (u && u.onerror) u.onerror({ error: 'interrupted' }); };
      s.speak = (u) => {
        if (Date.now() - lastCancel < 100) return; // dropped silently, like Chrome
        if (failOnline && u.voice && !u.voice.localService) { setTimeout(() => u.onerror && u.onerror({ error: 'synthesis-failed' }), 50); return; }
        cur = u; u.onstart && u.onstart({});
        window.__heard.push(u.text + ' [' + (u.voice ? u.voice.name : 'sistema') + ']');
        tm = setTimeout(() => { if (cur === u) { cur = null; u.onend && u.onend({}); } }, 800);
      };
    }, failOnline);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + path.resolve(process.argv[2]));
    await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
    await p.reload(); await p.waitForTimeout(500);
    await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
    await p.click('.card.quiz:has-text("Cerditos")'); await p.waitForTimeout(5500);
    const heard = await p.evaluate(() => window.__heard);
    const tag = failOnline ? 'online voice fails: ' : 'drop after cancel: ';
    assert(heard.some((h) => h.startsWith('Escucha y toca')), tag + 'instructions are heard ' + JSON.stringify(heard));
    assert(heard.some((h) => h.startsWith('¿Cuántos cerditos')), tag + 'then the question is heard');
    if (failOnline) assert(heard.filter((h) => h.trim().length > 12).every((h) => h.includes('Chrome OS español')), 'online voice fails: the other Spanish voice is used');
    await p.evaluate(() => { window.__heard = []; });
    await p.click('#playerSpeak'); await p.waitForTimeout(1500);
    assert((await p.evaluate(() => window.__heard)).some((h) => h.startsWith('¿Cuántos cerditos')), tag + '🔊 button reads the question');
    assert(!errs.length, tag + 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})();
