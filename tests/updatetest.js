// The page reloads itself when a newer version is published, but never during an activity (V125).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const root = path.resolve(process.argv[2] || '.');
let serverBuild = null; // null = serve the real version.json
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/version.json' && serverBuild) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ build: serverBuild })); }
  const f = path.join(root, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.json') ? 'application/json' : 'text/html'); res.end(d); });
}).listen(0);
const opt = (t, c) => ({ id: 'o' + t, text: t, correct: !!c, audioMode: 'none' });
const lib = [{ id: 'q1', familyId: 'q1', version: 1, type: 'quiz', name: 'Colores', folderId: null, createdAt: '2026-10-01', config: { lang: 'es', mode: 'practice', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', questions: [{ id: 'a', text: '¿Rojo?', audioMode: 'none', options: [opt('Sí', 1), opt('No')] }] } }];
(async () => {
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch();
  const p = await b.newPage();
  let loads = 0; p.on('load', () => loads++);
  const scripts = []; p.on('request', (r) => { if (r.url().includes('/js/app.js')) scripts.push(r.url()); });
  await p.goto(url);
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(600);
  assert(/app\.js\?v=\d{14}$/.test(scripts[scripts.length - 1]), 'scripts load with a version number (' + scripts[scripts.length - 1].split('/').pop() + ')');
  const l0 = loads;
  await p.evaluate(() => LL.app.checkUpdate()); await p.waitForTimeout(500);
  assert(loads === l0, 'same version on the server: no reload');
  // A child starts an activity, then a new version is published.
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  await p.click('.card.quiz:has-text("Colores")'); await p.waitForTimeout(500);
  serverBuild = '29991231235959';
  await p.evaluate(() => LL.app.checkUpdate()); await p.waitForTimeout(800);
  assert(loads === l0 && await p.isVisible('#player'), 'during an activity: no reload');
  await p.click('#player .option:has-text("Sí")'); await p.waitForTimeout(3000);
  assert(loads === l0 && await p.isVisible('.finish'), 'finish screen: still no reload');
  await p.click('.finish button:has-text("Salir")');
  await p.waitForTimeout(1500);
  assert(loads === l0 + 1, 'after «Salir» (back to «¿Quién eres?»): the page updated itself');
  assert(await p.isVisible('#screen-students'), 'and shows «¿Quién eres?»');
  // The reloaded page still reports an older build than the server (we faked it): it must not loop.
  await p.evaluate(() => LL.app.checkUpdate()); await p.waitForTimeout(1000);
  assert(loads === l0 + 1, 'no reload loop when the server copy is still not newer in the browser');
  await b.close(); srv.close();
})();
