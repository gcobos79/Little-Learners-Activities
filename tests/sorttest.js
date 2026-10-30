// «Clasificación rápida»: create, edit, play (mouse + touch), results (V126).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shots = process.argv[3];
const IMG_DIR = process.argv[4];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__said = []; try { speechSynthesis.speak = (u) => window.__said.push(u.text); } catch { /* */ } });
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); });
  await p.reload(); await p.waitForTimeout(400);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);

  // Create
  await p.click('#newQuizBtn'); await p.waitForTimeout(300);
  assert(await p.isVisible('.kind-choice:has-text("Quiz")') && await p.isVisible('.kind-choice:has-text("Clasificación rápida")'), 'new activity: choose Quiz or Clasificación rápida');
  await p.click('.kind-choice:has-text("Clasificación rápida")'); await p.waitForTimeout(500);
  assert(await p.isVisible('#edSort') && (await p.$$('.sort-group')).length === 2, 'sort editor opens with 2 groups');
  await p.fill('#edName', 'Clasificar A y M');
  assert(await p.isVisible('#edInstructions'), 'editor header has «📢 Instrucciones de la actividad»');
  await p.fill('#edInstructions', 'Lleva cada dibujo a su letra.');
  const names = await p.$$('.sort-group-name'); await names[0].fill('A'); await names[1].fill('M');
  // Group A: two words typed + one picture
  let rows = await p.$$('.sort-group >> nth=0 >> .sort-item input[type=text]');
  await rows[0].fill('avión'); await rows[1].fill('árbol');
  // Group M: several pictures at once -> words from file names
  const tmp = fs.mkdtempSync('/tmp/llimg-');
  for (const [src, dst] of [['maleta.png', 'maleta.png'], ['abuela.png', '02_mono-feliz.png'], ['lasana.png', 'manzana.png']]) fs.copyFileSync(path.join(IMG_DIR, src), path.join(tmp, dst));
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.sort-group >> nth=1 >> button:has-text("Varias imágenes")')]);
  await fc.setFiles(['maleta.png', '02_mono-feliz.png', 'manzana.png'].map((f) => path.join(tmp, f)));
  await p.waitForTimeout(1500);
  rows = await p.$$eval('.sort-group >> nth=1 >> .sort-item', (a) => a.map((x) => [x.querySelector('input').value, !!x.querySelector('img')]));
  assert(rows.length === 3 && rows.every((r) => r[1]) && rows.map((r) => r[0]).join(',') === 'maleta,mono feliz,manzana', '«Varias imágenes»: one card per picture, word from the file name (' + JSON.stringify(rows) + ')');
  // Make visible with an incomplete group -> blocked
  await p.click('label.switch:has-text("Visible para estudiantes")');
  await p.fill('.sort-group >> nth=0 >> .sort-group-name', '');
  await p.click('text=💾 Guardar'); await p.waitForTimeout(300);
  assert(!(await p.evaluate(() => LL.store.quizzes().some((q) => q.name === 'Clasificar A y M'))), 'visible but a group has no name: not saved');
  await p.fill('.sort-group >> nth=0 >> .sort-group-name', 'A');
  // Settings
  await p.click('.segmented button:has-text("Rápida")');
  await p.click('label.switch:has-text("Mostrar la palabra")');
  await p.click('text=💾 Guardar'); await p.waitForTimeout(500);
  const saved = await p.evaluate(() => LL.store.quizzes().find((q) => q.name === 'Clasificar A y M'));
  assert(saved && saved.type === 'sort' && saved.config.sort.speed === 'fast' && saved.config.sort.showText === true && saved.config.questions.length === 2, 'saved as type sort with its settings');
  assert(saved.config.questions[0].options.length === 2, 'the empty third card of group A was dropped on save');
  assert(saved.config.instructions === 'Lleva cada dibujo a su letra.', 'instructions saved with the activity');
  if (shots) await p.screenshot({ path: shots + '/sort-editor.png', fullPage: true });
  await p.click('text=⬅️ Mis actividades'); await p.waitForTimeout(400);
  assert((await p.textContent('.card.quiz:has-text("Clasificar A y M") .meta')).includes('Clasificación rápida · 2 grupos · 5 tarjetas'), 'library card says what it is');
  // Normal speed for the play test
  await p.evaluate(() => { const lib = LL.store.readLibrary(); const e = lib.find((x) => x.name === 'Clasificar A y M'); e.config.sort.speed = 'slow'; LL.store.writeLibrary(lib); LL.library.render(); });

  // Play as a student
  await p.click('.appbar-right button:has-text("Salir")'); await p.waitForTimeout(400);
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  assert(await p.isVisible('.card.quiz:has-text("Clasificar A y M")'), 'students see the visible activity');
  await p.evaluate(() => { window.__said = []; });
  await p.click('.card.quiz:has-text("Clasificar A y M")'); await p.waitForTimeout(1200);
  assert(await p.isVisible('#playerHelp') && (await p.evaluate(() => window.__said)).includes('Lleva cada dibujo a su letra.'), '📢 button shown and the instructions are read at the start');
  await p.evaluate(() => { window.__said = []; }); await p.click('#playerHelp'); await p.waitForTimeout(200);
  assert((await p.evaluate(() => window.__said)).includes('Lleva cada dibujo a su letra.'), 'tapping 📢 reads the instructions again');
  assert(await p.$eval('#playerSpeak', (e) => getComputedStyle(e).visibility === 'hidden'), 'no question 🔊 in this activity type');
  assert((await p.$$('.sort-card')).length === 5 && (await p.$$('.sort-target')).length === 2, 'belt has 5 cards, 2 group boxes');
  const groupOf = await p.evaluate(() => { const q = LL.store.quizzes().find((x) => x.name === 'Clasificar A y M'); const m = {}; q.config.questions.forEach((g) => g.options.forEach((o) => { m[o.id] = g.id; })); return m; });
  const x0 = await p.$eval('.sort-card', (e) => new DOMMatrix(getComputedStyle(e).transform).m41); await p.waitForTimeout(700);
  const x1 = await p.$eval('.sort-card', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
  assert(x1 > x0, 'the belt moves (' + Math.round(x0) + ' → ' + Math.round(x1) + ')');
  // Drag helper on a visible card
  const visibleCard = async () => p.evaluate(() => { const belt = document.querySelector('.sort-belt').getBoundingClientRect(); const c = [...document.querySelectorAll('.sort-card')].find((e) => { const r = e.getBoundingClientRect(); return r.left > belt.left + 10 && r.right < belt.right - 10; }); return c ? c.dataset.id : null; });
  const dragMouse = async (id, toGroup) => {
    const r = await (await p.$('.sort-card[data-id="' + id + '"]')).boundingBox();
    const t = toGroup ? await (await p.$('.sort-target[data-group="' + toGroup + '"]')).boundingBox() : { x: 600, y: 10, width: 10, height: 10 };
    await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down();
    for (let s = 1; s <= 10; s++) await p.mouse.move(r.x + r.width / 2 + (t.x + t.width / 2 - r.x - r.width / 2) * s / 10, r.y + r.height / 2 + (t.y + t.height / 2 - r.y - r.height / 2) * s / 10);
    await p.mouse.up();
  };
  const groups = Object.values(groupOf).filter((v, i, a) => a.indexOf(v) === i);
  // 1) dropped outside -> back on the belt
  let id = await visibleCard();
  await p.evaluate(() => { window.__said = []; });
  await dragMouse(id, null); await p.waitForTimeout(300);
  assert(!!(await p.$('.sort-card[data-id="' + id + '"]:not(.picked)')) && (await p.textContent('.sort-status')).includes('0 de 5'), 'dropped outside the boxes: card goes back to the belt');
  assert((await p.evaluate(() => window.__said)).length >= 1, 'picking up a card says its word');
  // 2) right group
  id = await visibleCard();
  await dragMouse(id, groupOf[id]); await p.waitForTimeout(150);
  assert(await p.isVisible('.sort-target.good'), 'right group blinks green');
  await p.waitForTimeout(700);
  assert(!(await p.$('.sort-card[data-id="' + id + '"]')) && (await p.textContent('.sort-status')).includes('1 de 5') && (await p.textContent('.sort-status')).includes('✓ 1'), 'card is placed; counter 1 / 5');
  // 3) wrong group
  id = await visibleCard();
  const wrong = groups.find((g) => g !== groupOf[id]);
  await dragMouse(id, wrong); await p.waitForTimeout(200);
  assert(await p.isVisible('.sort-target.bad[data-group="' + wrong + '"]') && !(await p.$('.sort-target-mark')), 'wrong group blinks red (no ✕)');
  if (shots) await p.screenshot({ path: shots + '/sort-wrong.png' });
  await p.waitForTimeout(1200);
  assert(await p.isVisible('.sort-target.good[data-group="' + groupOf[id] + '"]'), 'then the right group blinks green');
  await p.waitForTimeout(2200);
  // 4) the rest by touch (finger)
  const cdp = await ctx.newCDPSession(p);
  let guard = 0;
  while ((await p.$$('.sort-card')).length && guard++ < 80) {
    id = await visibleCard();
    if (!id) { await p.waitForTimeout(500); continue; }
    const r = await (await p.$('.sort-card[data-id="' + id + '"]')).boundingBox();
    const t = await (await p.$('.sort-target[data-group="' + groupOf[id] + '"]')).boundingBox();
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(r.x + r.width / 2, r.y + r.height / 2) });
    for (let s = 1; s <= 8; s++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(r.x + r.width / 2 + (t.x + t.width / 2 - r.x - r.width / 2) * s / 8, r.y + r.height / 2 + (t.y + t.height / 2 - r.y - r.height / 2) * s / 8) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(900);
  }
  await p.waitForTimeout(1500);
  assert(await p.isVisible('.finish'), 'after all cards: finish screen');
  const board = await p.$$eval('.board-list li.me', (a) => a.map((x) => x.innerText.replace(/\s+/g, ' ')));
  assert(board.length === 1 && board[0].includes('4 / 5'), 'board shows 4 / 5 for this child (' + board[0] + ')');
  const res = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ll-v124-results') || '{}')));
  assert(res.length === 1 && res[0].score === 4 && res[0].total === 5 && res[0].answers.length === 5 && res[0].answers.filter((a) => !a.correct).length === 1, 'result saved: 4 of 5, one wrong card in the detail');
  if (shots) await p.screenshot({ path: shots + '/sort-finish.png' });
  // Otra vez restarts
  await p.click('.finish button:has-text("Otra vez")'); await p.waitForTimeout(800);
  assert((await p.$$('.sort-card')).length === 5, '«Otra vez» starts again with all cards');
  // Exit needs the half-second hold for students
  await p.click('#playerExit'); await p.waitForTimeout(300);
  assert(await p.isVisible('#player'), 'quick tap on ↩️ does not leave');
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);
  // Cards per group subset
  await p.evaluate(() => { const lib = LL.store.readLibrary(); const e = lib.find((x) => x.name === 'Clasificar A y M'); e.config.sort.perGroup = 2; LL.store.writeLibrary(lib); LL.library.render(); });
  await p.click('.card.quiz:has-text("Clasificar A y M")'); await p.waitForTimeout(800);
  assert((await p.$$('.sort-card')).length === 4, '«Tarjetas por grupo: 2» → 2 + 2 cards');
  await p.evaluate(() => LL.player.close());
  // Phone layout
  await p.setViewportSize({ width: 390, height: 844 }); await p.click('.card.quiz:has-text("Clasificar A y M")'); await p.waitForTimeout(800);
  const fits = await p.evaluate(() => [...document.querySelectorAll('.sort-target')].every((t) => t.getBoundingClientRect().bottom <= innerHeight + 1));
  assert(fits, 'phone: group boxes fit on screen');
  if (shots) await p.screenshot({ path: shots + '/sort-phone.png' });
  await p.evaluate(() => LL.player.close()); await p.setViewportSize({ width: 1280, height: 860 });
  // Teacher: results detail and Duplicar
  await p.evaluate(() => LL.app.goHome()); await p.waitForTimeout(400);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Clasificar A y M") [aria-label^="Ver resultados"]'); await p.waitForTimeout(800);
  await p.click('.rt-row.rt-click >> nth=0'); await p.waitForTimeout(300);
  assert((await p.textContent('.modal')).includes('Lo llevó a:'), 'results detail: where each card was taken');
  await p.keyboard.press('Escape'); await p.click('.tab:has-text("Actividades")'); await p.waitForTimeout(300);
  await p.click('.card.quiz:has-text("Clasificar A y M") [aria-label^="Más opciones"]'); await p.click('.menu >> text=Duplicar'); await p.waitForTimeout(300);
  const copy = await p.evaluate(() => LL.store.quizzes().find((q) => q.name === 'Clasificar A y M (copia)'));
  assert(copy && copy.type === 'sort', 'Duplicar keeps it as «Clasificación rápida»');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
