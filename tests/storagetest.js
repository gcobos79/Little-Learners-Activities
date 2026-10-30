// Browser storage (~5 MB) must not block saving: pictures go to the cloud as soon as they are
// chosen, and when storage is full the app frees space and still saves.
const { chromium } = require('playwright');
const makeMock = require('./mocksb.js');
const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html');
  const mock = makeMock(); mock.noTtsKey = true;
  mock.db.activities_students.push({ id: 1, teacher_id: 'u-1111', name: 'Sofía', animal: '🐱', active: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  let offline = false;
  await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', (r) => (offline ? r.abort('internetdisconnected') : mock.handler(r)));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.fill('input[type=email]', 'teacher@test.org'); await p.fill('input[type=password]', 'secreto123'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1500);
  // Old saved versions of a quiz eating space (like V121 versions)
  await p.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem('ll-activities-v10-templates') || '[]');
    const big = 'x'.repeat(330000);
    for (let v = 1; v <= 5; v++) lib.push({ id: 'old-' + v, familyId: 'old', type: 'quiz', name: 'Viejo', version: v, config: { questions: [], pad: big } });
    try { localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); window.__filled = true; } catch (e) { window.__filled = false; }
  });
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.click('#newQuizBtn'); await p.click('.kind-choice:has-text("Quiz")'); await p.waitForTimeout(300);
  await p.fill('#edName', 'Búho'); await p.fill('#edQuestion > label textarea', 'Uno');
  // A big noisy picture (does not compress well)
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 900; const x = c.getContext('2d'); for (let i = 0; i < 60000; i++) { x.fillStyle = `hsl(${Math.random() * 360},80%,50%)`; x.fillRect(Math.random() * 900, Math.random() * 900, 4, 4); } return c.toDataURL('image/png').split(',')[1]; });
  const pick = async () => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#edQuestion button:has-text("imagen")')]); await fc.setFiles({ name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await p.waitForTimeout(800); };
  await pick();
  const img1 = await p.evaluate(() => document.querySelector('#edQuestion .thumb').dataset.ref || document.querySelector('#edQuestion .thumb').src.slice(0, 20));
  ok(String(img1).startsWith('sb:quiz-media/'), 'signed in: picture goes to the cloud as soon as it is chosen (' + String(img1).slice(0, 30) + '…)');

  // Now simulate the problem: offline pictures + storage almost full.
  offline = true;
  await p.click('#edQuestion button:has-text("Quitar")').catch(() => {}); await p.waitForTimeout(200);
  await pick();
  const isData = await p.evaluate(() => document.querySelector('#edQuestion .thumb').src.startsWith('data:'));
  ok(isData, 'offline: picture kept inside the quiz for now');
  const ans = await p.$$('#edQuestion .answer input[type=text]'); for (let i = 0; i < 4; i++) await ans[i].fill('r' + i);
  await p.click('.answer >> nth=0 >> .correct-toggle');
  for (let i = 0; i < 25; i++) { await p.click('button:has-text("📄 Duplicar")'); }
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__filled), 'test setup: old versions stored (storage nearly full)');
  const used = await p.evaluate(() => LL.store.storageUsed());
  console.log('storage used before saving:', Math.round(used / 1024) + ' KB');
  offline = false;
  await p.click('button:has-text("💾 Guardar")'); await p.waitForTimeout(4000);
  const saved = await p.evaluate(() => { const q = LL.store.quizzes().find((x) => x.name === 'Búho'); return q && { n: q.config.questions.length, ref: q.config.questions[0].image.slice(0, 14) }; });
  ok(saved && saved.n === 26, 'quiz with 26 pictured questions saved despite the full storage: ' + JSON.stringify(saved));
  ok(!(await p.evaluate(() => LL.store.readLibrary().some((x) => x.id === 'old-1'))), 'old versions removed to make room; newest kept');
  console.log(await p.evaluate(() => LL.store.readLibrary().map((x) => x.id + ':' + x.name + ':' + x.version)));
  ok(await p.evaluate(() => LL.store.quizzes().some((q) => q.name === 'Viejo')), 'the old quiz itself is still there');
  await p.waitForTimeout(2500);
  ok(mock.db.quizzes.some((q) => q.name === 'Búho') && mock.db.quiz_questions.filter((q) => q.image_path).length === 26, 'saved to the database with its pictures in storage');
  const after = await p.evaluate(() => LL.store.storageUsed());
  console.log('storage used after sync:', Math.round(after / 1024) + ' KB');
  ok(after < used, 'device copy is smaller after the pictures moved to the cloud');
  // Settings button
  await p.click('button:has-text("Mis actividades")'); await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  await p.click('button:has-text("Liberar espacio")'); await p.click('.modal button:has-text("Liberar espacio")'); await p.waitForTimeout(2500);
  ok((await p.textContent('#toasts')).includes('se liberaron'), 'Settings → “Liberar espacio” works');
  console.log('ERRORS', errs);
  await b.close();
})();
