// Per-quiz voice type: saved to the database, reaches tablets, and the device voice follows it
// (but any voice is used when the preferred kind is missing).
const { chromium } = require('playwright');
const makeMock = require('./mocksb.js');
const path = require('path');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const VOICES = {
  both: [['Microsoft Sabina - Spanish (Mexico)', 'es-MX'], ['Microsoft Raul - Spanish (Mexico)', 'es-MX'], ['Microsoft Zira', 'en-US'], ['Microsoft David', 'en-US']],
  womenOnly: [['Paulina', 'es-MX'], ['Samantha', 'en-US']],
  englishOnly: [['Microsoft David', 'en-US'], ['Microsoft Zira', 'en-US']],
};
(async () => {
  const file = path.resolve(process.argv[2] || '../index.html');
  const mock = makeMock();
  mock.noTtsKey = true; // no ElevenLabs key: the device voice must be used
  mock.db.students.push({ id: 1, teacher_id: 'u-1111', name: 'Sofía', animal: '🐱', active: true });
  const b = await chromium.launch();
  const mk = async (voices) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**', mock.handler);
    await ctx.addInitScript((vs) => {
      const list = vs.map(([name, lang]) => ({ name, lang, localService: true, default: false, voiceURI: name }));
      window.__spoken = [];
      // The real voice setter only accepts the browser's own voice objects; record the choice instead.
      Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', { configurable: true, set(v) { this._v = v; }, get() { return this._v || null; } });
      try { speechSynthesis.getVoices = () => list; speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang }); } catch (e) { /* ignore */ }
    }, voices);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') p.errs.push(m.text()); });
    await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
    await p.fill('input[type=email]', 'teacher@test.org'); await p.fill('input[type=password]', 'secreto123'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1500);
    return p;
  };
  const A = await mk(VOICES.both);
  await A.focus('.teacher-gate'); await A.keyboard.press('Enter'); await A.waitForTimeout(300);
  await A.click('#newQuizBtn'); await A.waitForTimeout(300);
  ok(await A.isVisible('.segmented button:has-text("Mujer")') && await A.isVisible('.segmented button:has-text("Hombre")'), 'editor shows “Tipo de voz: Mujer / Hombre”');
  await A.fill('#edName', 'Voz hombre'); await A.fill('#edQuestion > label textarea', '¿Dónde está el perro?');
  const ins = await A.$$('#edQuestion .answer input[type=text]'); for (let i = 0; i < 4; i++) await ins[i].fill('r' + i);
  await A.click('.answer >> nth=0 >> .correct-toggle'); await A.click('label.switch:has-text("Visible para estudiantes")');
  await A.click('.segmented button:has-text("Hombre")');
  await A.click('button:has-text("💾 Guardar")'); await A.waitForTimeout(2500);
  const row = mock.db.quizzes.find((q) => q.name === 'Voz hombre');
  ok(row && row.voice_gender === 'male', 'voice type saved in the database (voice_gender = male)');
  await A.click('button:has-text("Probar")'); await A.waitForTimeout(800);
  let s = await A.evaluate(() => window.__spoken.slice(-1)[0]);
  ok(s && s.voice && /Raul/.test(s.voice), 'device with both kinds: man voice used → ' + (s && s.voice));
  for (const [kind, expect] of [['womenOnly', /Paulina/], ['englishOnly', /David|Zira/]]) {
    const T = await mk(VOICES[kind]);
    const q = await T.evaluate(() => LL.store.quizzes().find((x) => x.name === 'Voz hombre'));
    ok(q && q.config.voiceGender === 'male', kind + ': tablet received the voice type');
    await T.click('.student-card >> nth=0'); await T.waitForTimeout(400); await T.click('#cardGrid >> text=Voz hombre'); await T.waitForTimeout(900);
    s = await T.evaluate(() => window.__spoken.slice(-1)[0]);
    ok(s && s.text.includes('perro') && expect.test(s.voice || ''), kind + ': still speaks, with ' + (s && s.voice) + ' (no man voice in that language → another voice)');
    console.log('errors', T.errs);
  }
  console.log('errors', A.errs);
  await b.close();
})();
