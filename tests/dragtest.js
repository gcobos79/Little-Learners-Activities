// Drag a question in the editor's list to change the order (V125).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = process.argv[3];
async function run(b, file, viewport, label) {
  const p = await b.newPage({ viewport });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(file));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); });
  await p.reload(); await p.waitForTimeout(400);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.click('#newQuizBtn'); await p.click('.kind-choice:has-text("Quiz")'); await p.waitForTimeout(400);
  await p.fill('#edName', 'Orden ' + label);
  for (let i = 1; i <= 4; i++) {
    if (i > 1) { await p.click('#edAddQ'); await p.waitForTimeout(100); }
    await p.fill('#edQuestion textarea', 'P' + i);
  }
  const order = () => p.$$eval('#edQList .q-item .txt', (a) => a.map((x) => x.textContent).join(','));
  assert((await order()) === 'P1,P2,P3,P4', label + ': four questions in order');
  // Drag question 4 onto question 2 (upper half / left half of 2).
  const src = await (await p.$('#edQList .q-item >> nth=3')).boundingBox();
  const dst = await (await p.$('#edQList .q-item >> nth=1')).boundingBox();
  const hz = dst.y === src.y;
  await p.mouse.move(src.x + 40, src.y + src.height / 2);
  await p.mouse.down();
  const tx = hz ? dst.x + 15 : dst.x + 40, ty = hz ? dst.y + dst.height / 2 : dst.y + 10;
  for (let s = 1; s <= 12; s++) await p.mouse.move(src.x + 40 + (tx - src.x - 40) * s / 12, src.y + src.height / 2 + (ty - src.y - src.height / 2) * s / 12);
  await p.waitForTimeout(100);
  assert(await p.isVisible('.q-ghost'), label + ': a copy follows the pointer');
  assert((await p.$$('.q-item.drop-before')).length === 1, label + ': drop line shown');
  if (shot) await p.screenshot({ path: shot.replace('.png', '-' + label + '.png') });
  await p.mouse.up(); await p.waitForTimeout(200);
  assert((await order()) === 'P1,P4,P2,P3', label + ': 4 became 2 and 2 became 3 (' + (await order()) + ')');
  assert((await p.textContent('#edQuestion h2')).includes('Pregunta 2 de 4') && (await p.inputValue('#edQuestion textarea')) === 'P4', label + ': shows the moved question');
  assert(!(await p.$('.q-ghost')) && !(await p.$('.drop-before')), label + ': drag cleaned up');
  // Drag to the end, then press Escape mid-drag.
  const a = await (await p.$('#edQList .q-item >> nth=0')).boundingBox();
  const z = await (await p.$('#edQList .q-item >> nth=3')).boundingBox();
  await p.mouse.move(a.x + 30, a.y + a.height / 2); await p.mouse.down();
  for (let s = 1; s <= 10; s++) await p.mouse.move(a.x + 30 + (z.x + z.width - 5 - a.x - 30) * s / 10, a.y + a.height / 2 + (z.y + z.height - 4 - a.y - a.height / 2) * s / 10);
  await p.mouse.up(); await p.waitForTimeout(200);
  assert((await order()) === 'P4,P2,P3,P1', label + ': drag first to the end (' + (await order()) + ')');
  // A plain click still just opens a question.
  await p.click('#edQList .q-item >> nth=2'); await p.waitForTimeout(150);
  assert((await order()) === 'P4,P2,P3,P1' && (await p.inputValue('#edQuestion textarea')) === 'P3', label + ': a click selects, does not move');
  await p.click('text=💾 Guardar'); await p.waitForTimeout(300);
  const saved = await p.evaluate((n) => JSON.parse(localStorage.getItem('ll-activities-v10-templates')).find((x) => x.name === n).config.questions.map((q) => q.text).join(','), 'Orden ' + label);
  assert(saved === 'P4,P2,P3,P1', label + ': new order saved');
  assert(!errs.length, label + ': no page errors ' + errs.join(' | '));
  await p.close();
}
(async () => {
  const b = await chromium.launch();
  await run(b, process.argv[2], { width: 1280, height: 800 }, 'monitor');
  await run(b, process.argv[2], { width: 820, height: 1180 }, 'ipad');
  await b.close();
})();
