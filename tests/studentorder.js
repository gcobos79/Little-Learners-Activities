// New students take their alphabetical place in the class list (never jump to the top), both on a
// signed-in teacher (fake Supabase) and in local mode; a hand-made order (⬆️) is kept.
const { chromium } = require('playwright');
const path = require('path');
const makeMock = require('./mocksb.js');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const mock = makeMock();
  mock.db.students.push({ id: 1, teacher_id: 'u-1111', name: 'Abigail', animal: '🐱', active: true }, { id: 2, teacher_id: 'u-1111', name: 'Daniel', animal: '🦖', active: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(500);
  await p.fill('input[type=email]', 'teacher@test.org'); await p.fill('input[type=password]', 'secreto123');
  await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1200);
  if (await p.isVisible('.modal button:has-text("Subir a mi cuenta")')) { await p.click('.modal button:has-text("Subir a mi cuenta")'); await p.waitForTimeout(800); }
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.tab:has-text("Estudiantes")'); await p.waitForTimeout(400);
  const names = () => p.evaluate(() => LL.store.roster().map((s) => s.name).join(','));
  const add = async (name) => {
    await p.click('button:has-text("Agregar estudiante")'); await p.waitForTimeout(300);
    await p.fill('.modal input[type=text]', name);
    await p.click('.modal .btn.primary'); await p.waitForTimeout(900);
  };
  await add('Zone Guest');
  assert((await names()) === 'Abigail,Daniel,Zone Guest', 'signed in: «Zone Guest» goes in its alphabetical place: ' + await names());
  await add('Bruno');
  assert((await names()) === 'Abigail,Bruno,Daniel,Zone Guest', 'signed in: «Bruno» between Abigail and Daniel: ' + await names());
  const dbZone = mock.db.students.find((s) => s.name === 'Zone Guest');
  assert(dbZone && dbZone.sort_order == null, 'no hand-made order: the new student has no number of its own');
  const shown = await p.evaluate(() => [...document.querySelectorAll('#screen-students-admin .roster-row, #screen-students-admin li')].map((x) => x.textContent).join('|'));
  assert(shown.indexOf('Abigail') < shown.indexOf('Zone Guest'), 'the Estudiantes page shows Zone Guest after Abigail');
  // Teacher moves Daniel up by hand: Abigail, Daniel, Bruno, Zone Guest
  await p.click('button[aria-label="Subir a Daniel"]'); await p.waitForTimeout(900);
  assert((await names()) === 'Abigail,Daniel,Bruno,Zone Guest', 'hand-made order: ' + await names());
  await add('Carla');
  assert((await names()) === 'Abigail,Carla,Daniel,Bruno,Zone Guest', 'with a hand-made order, «Carla» goes before the first name after it and the rest keeps its order: ' + await names());
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await ctx.close();

  // Local mode (no account)
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await c2.newPage();
  await q.goto('file://' + path.resolve(process.argv[2]));
  await q.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); localStorage.setItem('ll-v122-roster', JSON.stringify([{ id: 'a', name: 'Ana', animal: '🐱' }, { id: 'm', name: 'Mario', animal: '🦁' }])); });
  await q.reload(); await q.waitForTimeout(400);
  const key = await q.evaluate(() => LL.store.KEYS.roster);
  await q.evaluate((k) => localStorage.setItem(k, JSON.stringify([{ id: 'a', name: 'Ana', animal: '🐱' }, { id: 'm', name: 'Mario', animal: '🦁' }])), key);
  await q.reload(); await q.waitForTimeout(400);
  await q.focus('.teacher-gate'); await q.keyboard.press('Enter'); await q.waitForTimeout(400);
  await q.click('.tab:has-text("Estudiantes")'); await q.waitForTimeout(400);
  await q.click('button:has-text("Agregar estudiante")'); await q.waitForTimeout(300);
  await q.fill('.modal input[type=text]', 'Beto'); await q.click('.modal .btn.primary'); await q.waitForTimeout(600);
  const local = await q.evaluate(() => LL.store.roster().map((s) => s.name).join(','));
  assert(local === 'Ana,Beto,Mario', 'local mode: Beto between Ana and Mario: ' + local);
  await b.close();
})();
