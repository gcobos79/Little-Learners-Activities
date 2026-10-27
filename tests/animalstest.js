// 40 animals; adding/editing a student only offers animals no other child uses (V126).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = process.argv[3];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); });
  await p.reload(); await p.waitForTimeout(400);
  const n = await p.evaluate(() => [LL.store.ANIMALS.length, new Set(LL.store.ANIMALS).size]);
  assert(n[0] === 40 && n[1] === 40, '40 different animals');
  const roster = await p.evaluate(() => LL.store.roster().map((s) => [s.name, s.animal]));
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.click('.tab:has-text("Estudiantes")'); await p.waitForTimeout(300);
  // Edit the first child
  await p.click('.roster-row >> nth=0 >> button:has-text("Editar")'); await p.waitForTimeout(300);
  const shown = await p.$$eval('.modal .animal-pick button', (a) => a.map((x) => x.textContent));
  const others = roster.slice(1).map((r) => r[1]);
  assert(shown.includes(roster[0][1]) && !shown.some((a) => others.includes(a)), 'edit: own animal shown, none used by other children (' + shown.length + ' shown, ' + others.length + ' used by others)');
  assert(shown.length === 40 - new Set(others).size, 'edit: all free animals are offered');
  if (shot) await p.screenshot({ path: shot });
  // pick a free one and save
  const free = shown.find((a) => a !== roster[0][1]);
  await p.click('.modal .animal-pick button:has-text("' + free + '")'); await p.click('.modal button:has-text("Guardar")'); await p.waitForTimeout(300);
  assert(await p.evaluate((f) => LL.store.roster()[0].animal === f, free), 'edit: new animal saved');
  // Add a student
  await p.click('button:has-text("Agregar")'); await p.waitForTimeout(300);
  const used = await p.evaluate(() => LL.store.roster().map((s) => s.animal));
  const shown2 = await p.$$eval('.modal .animal-pick button', (a) => a.map((x) => x.textContent));
  const sel = await p.$eval('.modal .animal-pick button[aria-pressed="true"]', (x) => x.textContent);
  assert(!shown2.some((a) => used.includes(a)) && shown2.length === 40 - new Set(used).size, 'add: only free animals (' + shown2.length + ')');
  assert(!used.includes(sel), 'add: the pre-selected animal is a free one');
  await p.fill('.modal input[type=text]', 'Nueva'); await p.click('.modal button:has-text("Agregar")'); await p.waitForTimeout(300);
  const after = await p.evaluate(() => LL.store.roster().map((s) => s.animal));
  assert(new Set(after).size === after.length, 'every child has a different animal');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
