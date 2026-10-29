// Screenshots of «Pantalla de Tablet» at several sizes (for checking the look by eye).
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[3];
const PNG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#FDE68A"/><circle cx="50" cy="55" r="28" fill="#F59E0B"/><circle cx="40" cy="50" r="4"/><circle cx="60" cy="50" r="4"/><path d="M38 66 Q50 76 62 66" stroke="#000" stroke-width="4" fill="none"/><path d="M28 34 L34 16 L44 30 Z M72 34 L66 16 L56 30 Z" fill="#F59E0B"/></svg>').toString('base64');
const item = (id, text, image) => ({ id, text, image: image || '', audioMode: 'voice', options: [] });
const act = (id, name, mode, qs) => ({ id, familyId: id, version: 1, type: 'typing', name, folderId: null, createdAt: '2026-10-01', config: { lang: 'es', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', typing: { mode }, questions: qs } });
const lib = [
  act('t1', 'Modo uno', 1, [item('a', 'Welcome back 2626!'), item('b', 'gato', PNG)]),
  act('t3', 'Modo tres', 3, [item('a', 'gato', PNG)]),
];
(async () => {
  const b = await chromium.launch();
  for (const [name, w, h] of [['chromebook', 1280, 800], ['portrait', 800, 1280], ['ipad', 1180, 820], ['phoneL', 844, 390], ['phone', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    await ctx.addInitScript(() => { Element.prototype.requestFullscreen = function () { return Promise.resolve(); }; if (window.speechSynthesis) speechSynthesis.speak = () => {}; });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + path.resolve(process.argv[2]));
    await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
    await p.reload(); await p.waitForTimeout(400);
    await p.click('.student-card >> nth=0'); await p.waitForTimeout(300);
    await p.click('.card.quiz:has-text("Modo uno")'); await p.waitForTimeout(700);
    for (const k of ['shift', 'w', 'e', 'l']) await p.click('.kb-key[data-k="' + k + '"]');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${name}-mode1.png` });
    await p.click('.kb-key[data-k="x"]'); await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/${name}-wrong.png` });
    await p.click('.kb-key[data-k="z"]'); await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/${name}-hint.png` });
    const over = await p.evaluate(() => ({ h: document.documentElement.scrollHeight > innerHeight + 1, w: document.documentElement.scrollWidth > innerWidth + 1, kb: (() => { const r = document.querySelector('.kb').getBoundingClientRect(); return r.bottom <= innerHeight + 1; })() }));
    await p.evaluate(() => LL.player.close()); await p.waitForTimeout(200);
    await p.click('.card.quiz:has-text("Modo tres")'); await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${name}-mode3.png` });
    console.log(name, JSON.stringify(over), errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})();
