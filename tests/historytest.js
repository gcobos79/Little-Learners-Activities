// Browser Back/Forward inside the site, and the logo as a home button.
const { chromium } = require('playwright');
const seed = require('./seed.js');
const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html');
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + file);
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); localStorage.setItem('ll-activities-v90-folders', JSON.stringify(s.folders)); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(s.library)); }, seed);
  await p.reload(); await p.waitForTimeout(400);
  const where = () => p.evaluate(() => ({ screen: LL.app.state.screen, mode: LL.app.state.mode, folder: LL.library.current(), player: LL.player.isOpen(), crumbs: document.querySelector('#crumbs').innerText.replace(/\s+/g, ' ') }));
  const back = async () => { await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await p.waitForTimeout(450); };
  const fwd = async () => { await p.goForward({ waitUntil: 'commit' }).catch(() => {}); await p.waitForTimeout(450); };

  await p.click('.student-card >> nth=0'); await p.waitForTimeout(500);
  await p.click('#cardGrid >> text=Español'); await p.waitForTimeout(400);
  await p.click('#cardGrid >> text=Letras'); await p.waitForTimeout(400);
  ok((await where()).crumbs.includes('Letras'), 'student opened Español › Letras');
  await back(); let w = await where();
  ok(w.screen === 'library' && w.crumbs.includes('Español') && !w.crumbs.includes('Letras'), 'Back → Español');
  await back(); w = await where();
  ok(w.screen === 'library' && w.folder === null, 'Back → top of activities');
  await fwd(); w = await where();
  ok(w.crumbs.includes('Español'), 'Forward → Español again');
  await p.click('#cardGrid >> text=Animales'); await p.waitForTimeout(600);
  ok((await where()).player, 'quiz opened');
  await back(); w = await where();
  ok(!w.player && w.screen === 'library' && w.crumbs.includes('Español'), 'Back closes the quiz and stays in the folder');
  await p.click('#cardGrid >> text=Animales'); await p.waitForTimeout(600);
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(500);
  await back(); w = await where();
  ok(!w.player && w.folder === null, 'after closing a quiz with ↩️, Back goes to the previous folder (quiz not reopened)');
  await back(); w = await where();
  ok(w.screen === 'students' && !w.mode, 'Back → ¿Quién eres?');
  await fwd(); w = await where();
  ok(w.screen === 'students', 'Forward after leaving does not put the child back in (stays on ¿Quién eres?)');

  // Logo
  await p.click('.student-card >> nth=1'); await p.waitForTimeout(500);
  await p.click('#cardGrid >> text=Español'); await p.waitForTimeout(400);
  await p.click('#brandHome'); await p.waitForTimeout(400);
  ok((await where()).screen === 'students', 'student mode: logo → ¿Quién eres?');

  // Teacher
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('#cardGrid >> text=Matemáticas'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Contar") >> text=Editar'); await p.waitForTimeout(500);
  ok((await where()).screen === 'editor', 'teacher opened the editor');
  await back(); w = await where();
  ok(w.screen === 'library' && w.crumbs.includes('Matemáticas'), 'Back from editor → the folder it came from');
  await fwd(); w = await where();
  ok(w.screen === 'editor', 'Forward → editor again');
  await p.fill('#edName', 'Cambiado'); await back(); await p.waitForTimeout(300);
  ok(await p.isVisible('.modal:has-text("¿Guardar los cambios?")'), 'Back with unsaved changes asks first');
  await p.click('.modal button:has-text("Seguir editando")'); await p.waitForTimeout(400);
  ok((await where()).screen === 'editor' && (await p.inputValue('#edName')) === 'Cambiado', 'choosing “Seguir editando” keeps the editor and the changes');
  await back(); await p.click('.modal button:has-text("Salir sin guardar")'); await p.waitForTimeout(400);
  ok((await where()).screen === 'library', 'Back + “Salir sin guardar” → library');
  await p.click('.tab >> nth=1'); await p.waitForTimeout(300);
  await back(); w = await where();
  ok(w.screen === 'library', 'Back from a teacher tab → previous tab');
  await p.click('#cardGrid >> text=Matemáticas').catch(() => {}); await p.waitForTimeout(300);
  await p.click('#brandHome'); await p.waitForTimeout(400); w = await where();
  ok(w.screen === 'library' && w.mode === 'teacher' && w.folder === null, 'teacher mode: logo → top of Mis actividades');
  await p.click('text=Salir ↩'); await p.waitForTimeout(400);
  await back(); w = await where();
  ok(w.mode !== 'teacher', 'after “Salir”, Back does NOT reopen the teacher area (no PIN skipping)');
  console.log('URL', p.url().split('#')[1], 'ERRORS', errs);
  await b.close();
})();
