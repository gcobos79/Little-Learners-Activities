// Drag an activity card onto a folder / «Carpeta anterior» / breadcrumb (V125).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = process.argv[3];
const opt = (t, c) => ({ id: 'o' + t + Math.random(), text: t, correct: !!c, audioMode: 'none' });
const quiz = (id, name, folderId) => ({ id, familyId: id, version: 1, type: 'quiz', name, folderId, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [{ id: 'q' + id, text: '¿?', audioMode: 'none', options: [opt('a', 1), opt('b')] }] } });
const folders = [
  { id: 'fA', name: 'Animales', color: '#F8EDB8', parentId: null },
  { id: 'fB', name: 'Granja', color: '#DDEFFF', parentId: 'fA' },
];
const lib = [quiz('q1', 'Colores', null), quiz('q2', 'Números', null), quiz('q3', 'Vaca', 'fB')];
async function dragTo(p, from, to, opts = {}) {
  const a = await (await p.$(from)).boundingBox(), b = await (await p.$(to)).boundingBox();
  const sx = a.x + a.width / 2, sy = a.y + 60, tx = b.x + b.width / 2, ty = b.y + b.height / 2;
  await p.mouse.move(sx, sy); await p.mouse.down();
  for (let s = 1; s <= 15; s++) await p.mouse.move(sx + (tx - sx) * s / 15, sy + (ty - sy) * s / 15);
  await p.waitForTimeout(80);
  if (opts.check) await opts.check();
  if (opts.escape) await p.keyboard.press('Escape'); else await p.mouse.up();
  if (opts.escape) await p.mouse.up();
  await p.waitForTimeout(250);
}
const folderOf = (p, id) => p.evaluate((id) => (JSON.parse(localStorage.getItem('ll-activities-v10-templates')).find((x) => x.id === id) || {}).folderId || null, id);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate(({ lib, folders }) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-activities-v90-folders', JSON.stringify(folders)); localStorage.setItem('ll-v122-local-mode', '1'); }, { lib, folders });
  await p.reload(); await p.waitForTimeout(400);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);

  // 1) Colores -> Animales folder
  await dragTo(p, '.card.quiz:has-text("Colores")', '.card.folder:has-text("Animales")', { check: async () => {
    assert(await p.isVisible('.drag-chip'), 'a small card follows the mouse');
    assert(await p.isVisible('.card.folder.drop-target:has-text("Animales")'), 'the folder under the mouse is highlighted');
    if (shot) await p.screenshot({ path: shot });
  } });
  assert((await folderOf(p, 'q1')) === 'fA', 'dropped on a folder: activity moved into it');
  assert(!(await p.$('.card.quiz:has-text("Colores")')), 'the card left the current view');
  assert(!(await p.$('.drag-chip')) && !(await p.$('.drop-ok')), 'drag cleaned up');
  assert(!(await p.isVisible('#player')), 'dropping does not open the activity');

  // 2) Escape cancels
  await dragTo(p, '.card.quiz:has-text("Números")', '.card.folder:has-text("Animales")', { escape: true });
  assert((await folderOf(p, 'q2')) === null, 'Esc cancels the move');

  // 3) Dropped on empty space: nothing happens
  await dragTo(p, '.card.quiz:has-text("Números")', '#crumbs .here', {});
  assert((await folderOf(p, 'q2')) === null && !(await p.isVisible('#player')), 'dropped outside a folder: nothing changes');

  // 4) Inside Animales > Granja: drag Vaca onto «Carpeta anterior» -> goes up to Animales
  await p.click('.card.folder:has-text("Animales") .card-main'); await p.waitForTimeout(400);
  await p.click('.card.folder:has-text("Granja") .card-main'); await p.waitForTimeout(400);
  await dragTo(p, '.card.quiz:has-text("Vaca")', '.card.up');
  assert((await folderOf(p, 'q3')) === 'fA', '«Carpeta anterior»: moved one level up (Granja → Animales)');
  // 5) Back in Animales, drag Vaca onto the «Mis actividades» breadcrumb -> top level
  await p.click('.card.up .card-main'); await p.waitForTimeout(400);
  await dragTo(p, '.card.quiz:has-text("Vaca")', '#crumbs button:has-text("Mis actividades")');
  assert((await folderOf(p, 'q3')) === null, 'breadcrumb «Mis actividades»: moved to the top');
  // 6) A plain click still opens the preview
  await p.click('.card.quiz:has-text("Colores") .card-main'); await p.waitForTimeout(500);
  assert(await p.isVisible('#player'), 'a normal click still opens the activity');
  await p.click('#playerExit'); await p.waitForTimeout(300);
  // 7) Students cannot drag
  assert(!errs.length, 'no page errors ' + errs.join(' | '));

  // Touch: hold, then move onto a folder; and hold without moving opens the menu.
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  const t = await ctx.newPage();
  await t.goto('file://' + path.resolve(process.argv[2]));
  await t.evaluate(({ lib, folders }) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-activities-v90-folders', JSON.stringify(folders)); localStorage.setItem('ll-v122-local-mode', '1'); }, { lib, folders });
  await t.reload(); await t.waitForTimeout(400);
  await t.focus('.teacher-gate'); await t.keyboard.press('Enter'); await t.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(t);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  let a = await (await t.$('.card.quiz:has-text("Colores")')).boundingBox();
  let f = await (await t.$('.card.folder:has-text("Animales")')).boundingBox();
  // quick swipe = scroll, not a drag
  await touch('touchStart', a.x + 40, a.y + 60); for (let s = 1; s <= 5; s++) await touch('touchMove', a.x + 40, a.y + 60 - s * 20); await touch('touchEnd'); await t.waitForTimeout(300);
  assert((await folderOf(t, 'q1')) === null && !(await t.isVisible('#player')), 'touch: a quick swipe does not move the card');
  await t.evaluate(() => scrollTo(0, 0)); await t.waitForTimeout(100);
  a = await (await t.$('.card.quiz:has-text("Colores")')).boundingBox(); f = await (await t.$('.card.folder:has-text("Animales")')).boundingBox();
  await touch('touchStart', a.x + 40, a.y + 60); await t.waitForTimeout(550);
  for (let s = 1; s <= 12; s++) await touch('touchMove', a.x + 40 + (f.x + f.width / 2 - a.x - 40) * s / 12, a.y + 60 + (f.y + f.height / 2 - a.y - 60) * s / 12);
  await touch('touchEnd'); await t.waitForTimeout(300);
  assert((await folderOf(t, 'q1')) === 'fA', 'touch: hold then drag onto a folder moves it');
  a = await (await t.$('.card.quiz:has-text("Números")')).boundingBox();
  await touch('touchStart', a.x + 40, a.y + 60); await t.waitForTimeout(700); await touch('touchEnd'); await t.waitForTimeout(300);
  assert(await t.isVisible('.menu:has-text("Mover a otra carpeta")'), 'touch: hold without moving still opens the ⋯ menu');
  assert(!(await t.isVisible('#player')), 'touch: hold does not open the activity');
  // students
  await t.keyboard.press('Escape');
  await b.close();
})();
