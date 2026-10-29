// «Pantalla de Tablet» (V127): keyboard, the 3 modes, mistakes (red letter + ⌫), green help after the
// second mistake, Shift / CAPS, ?123, accents, Enter, points, results, editor and sync conversion.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const item = (id, text, image) => ({ id, text, image: image || '', audioMode: 'voice', options: [] });
const act = (id, name, mode, qs, extra) => ({ id, familyId: id, version: 1, type: 'typing', name, folderId: null, createdAt: '2026-10-01', config: { lang: 'es', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', typing: { mode }, questions: qs, ...(extra || {}) } });
const lib = [
  act('t1', 'Uno', 1, [item('a', 'Sol 2!'), item('b', 'gato'), item('c', 'mamá'), item('d', 'a@b')], { instructions: 'Copia la palabra.' }),
  act('t2', 'Dos', 2, [item('a', 'oso')]),
  act('t3', 'Tres', 3, [item('a', 'pez', PNG)]),
  act('t4', 'Ceros', 1, [item('a', 'ab')]),
  act('t5', 'Mayus', 1, [item('a', 'OK')]),
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await ctx.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
    window.__said = []; window.__tones = [];
    if (window.speechSynthesis) speechSynthesis.speak = (u) => { if (u.text && u.text.trim()) { window.__said.push(u.text); setTimeout(() => u.onend && u.onend({}), 50); } };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate((lib) => { localStorage.clear(); localStorage.setItem('ll-activities-v10-templates', JSON.stringify(lib)); localStorage.setItem('ll-v122-local-mode', '1'); }, lib);
  await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(() => { const f = LL.ui.feedbackTone; LL.ui.feedbackTone = (ok) => { window.__tones.push(ok ? 'ok' : 'bad'); }; });

  const key = (k) => p.click('.kb-key[data-k="' + k + '"]', { force: true }); // the green key pulses
  const typed = () => p.evaluate(() => [...document.querySelectorAll('.tp-out .tp-och')].map((s) => (s.classList.contains('bad') ? '[' + s.textContent + ']' : s.textContent.replace(' ', ' '))).join(''));
  const hinted = () => p.evaluate(() => [...document.querySelectorAll('.kb-key.hint')].map((x) => x.dataset.k || x.dataset.v));
  const locked = () => p.evaluate(() => document.querySelector('.kb').classList.contains('locked'));
  const now = () => p.evaluate(() => { const n = document.querySelector('.tp-ch.now'); return n ? n.textContent : null; });
  const tones = () => p.evaluate(() => window.__tones.splice(0));
  const waitNext = () => p.waitForTimeout(1900);

  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  assert(await p.isVisible('.card.quiz:has-text("Uno") .meta:has-text("Pantalla de Tablet · 4 palabras")'), 'library card says «Pantalla de Tablet · 4 palabras»');
  await p.click('.card.quiz:has-text("Uno")'); await p.waitForTimeout(600);
  assert(await p.isVisible('.tp .kb'), 'opens the tablet screen with the keyboard');
  assert((await p.evaluate(() => window.__said[0])) === 'Copia la palabra.', 'instructions are read first');
  await p.waitForTimeout(500);
  assert((await p.evaluate(() => window.__said[1])) === 'Sol 2!', '…then the word');
  assert((await now()) === 'S', 'mode 1: the first letter «S» is marked');
  assert(await p.isVisible('.kb-key[data-k="ñ"]'), 'Spanish keyboard has ñ');

  // Word 1: «Sol 2!» with Shift, space, number row and «!»
  await key('shift');
  assert((await p.textContent('.kb-key[data-k="o"]')).includes('O'), 'Shift shows capital letters');
  await key('s');
  assert((await typed()) === 'S', 'S typed after Shift');
  assert((await p.textContent('.kb-key[data-k="o"]')).includes('o'), 'Shift goes back to small letters after one letter');
  await key('o'); await key('l'); await key('space'); await key('2'); await key('!');
  assert((await typed()) === 'Sol 2!', 'space, number and ! typed: ' + await typed());
  assert((await now()) === '⏎', 'mode 1: Enter is marked at the end');
  assert((await tones()).every((t) => t !== 'bad'), 'no mistakes so far');
  await key('enter'); await p.waitForTimeout(300);
  assert(await p.isVisible('.tp-points:has-text("Perfecto")'), 'Enter finishes the word: «¡Perfecto!»');
  await waitNext();

  // Word 2: «gato» with mistakes: red letter, ⌫, green help
  await key('x');
  assert((await typed()) === '[x]', 'a wrong letter appears in red');
  assert((await tones()).includes('bad'), '…with the wrong sound');
  assert(await p.evaluate(() => document.querySelector('.kb-key[data-k="x"]').classList.contains('bad')), '…and the key blinks red');
  assert(!(await locked()), 'first mistake: keyboard still free');
  await key('back');
  assert((await typed()) === '', '⌫ erases the red letter');
  await key('q');
  assert((await typed()) === '[q]', 'second mistake on the same letter: red again');
  await p.waitForTimeout(450);
  assert(await locked(), '…keyboard locked');
  assert(JSON.stringify(await hinted()) === '["back"]', '…and ⌫ is green first');
  await p.click('.kb-key[data-k="g"]', { force: true }); // locked: ignored
  assert((await typed()) === '[q]', 'other keys do nothing while locked');
  await key('back');
  assert(JSON.stringify(await hinted()) === '["g"]', 'after erasing, the right letter «g» is green');
  await key('g');
  assert((await typed()) === 'g' && !(await locked()) && !(await hinted()).length, 'pressing the green key types it and frees the keyboard');
  await key('a'); await key('t'); await key('o');
  await key('enter'); await waitNext();

  // Word 3: «mamá» — accent with a long press on «a»
  await key('m'); await key('a'); await key('m');
  const a = await (await p.$('.kb-key[data-k="a"]')).boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down(); await p.waitForTimeout(650);
  assert(await p.isVisible('.kb-pop .kb-var[data-v="á"]'), 'long press on «a» shows «á»');
  await p.mouse.up();
  await p.click('.kb-pop .kb-var[data-v="á"]');
  assert((await typed()) === 'mamá', 'á typed from the bubble');
  await key('enter'); await waitNext();

  // Word 4: «a@b» — the ?123 page
  await key('a');
  await key('sym');
  assert(await p.isVisible('.kb-key[data-k="@"]') && await p.isVisible('.kb-key[data-k="abc"]'), '?123 shows signs and «ABC»');
  await key('@'); await key('abc'); await key('b');
  assert((await typed()) === 'a@b', 'a@b typed with ?123 and ABC');
  await key('b');
  assert((await typed()) === 'a@b[b]', 'a letter after the end is a mistake (red)');
  await key('back');
  await key('enter'); await p.waitForTimeout(2200);
  assert(await p.isVisible('.finish'), 'last Enter ends the activity');
  const rec = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ll-v124-results') || '{}')).find((r) => r.quiz_id === 't1'));
  assert(rec && rec.total === 4, 'result saved with 4 words');
  const pts = rec.answers.map((x) => x.points).join(',');
  assert(pts === '1,0.75,1,0.75', 'points per word 1, 0.75 (2 mistakes), 1, 0.75 (1 mistake): ' + pts);
  assert(rec.score === 3.5, 'score is the sum: 3.5 (' + rec.score + ')');
  assert(rec.answers[1].errors === 2 && rec.answers[1].prompt === 'gato', 'mistakes kept per word');
  await p.waitForTimeout(600);
  assert(await p.isVisible('.board .b-score:has-text("3.5 / 4")'), 'end board shows 3.5 / 4');
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);

  // Enter too early, wrong case, CAPS LOCK
  await tones();
  await p.click('.card.quiz:has-text("Mayus")'); await p.waitForTimeout(500);
  await key('o');
  assert((await typed()) === '[o]', '«o» when «O» is needed is a mistake (Shift first)');
  await key('back'); await key('enter');
  assert((await typed()) === '' && (await tones()).filter((t) => t === 'bad').length === 2, 'Enter before the end is a mistake (nothing written)');
  await p.waitForTimeout(450);
  assert(JSON.stringify(await hinted()) === '["shift"]', 'help for a capital letter: Shift is green first');
  await key('shift');
  assert(JSON.stringify(await hinted()) === '["o"]', '…then the letter');
  await key('o');
  await key('shift'); await key('shift');
  assert(await p.evaluate(() => document.querySelector('.kb').classList.contains('caps')), 'double tap on Shift = CAPS LOCK');
  await key('k');
  assert((await typed()) === 'OK', 'OK typed');
  assert(await p.evaluate(() => document.querySelector('.kb').classList.contains('caps')), 'CAPS LOCK stays on');
  await key('enter'); await p.waitForTimeout(2200);
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);

  // More than 6 mistakes = 0 points
  await p.click('.card.quiz:has-text("Ceros")'); await p.waitForTimeout(500);
  // 2 mistakes on «a» (then the green help), 2 more on «b»
  for (const letter of ['a', 'b']) {
    await key('z'); await key('back'); await key('z'); await p.waitForTimeout(450);
    await key('back'); await key(letter);
  }
  await key('enter'); await p.waitForTimeout(2200);
  const r0 = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ll-v124-results') || '{}')).find((r) => r.quiz_id === 't4'));
  assert(r0 && r0.answers[0].errors === 4 && r0.answers[0].points === 0.5, '4 mistakes = 0.5 (' + (r0 && r0.answers[0].points) + ')');
  const scale = await p.evaluate(() => [0, 1, 2, 3, 4, 5, 6, 7, 12].map(LL.typingGame.pointsFor).join(','));
  assert(scale === '1,0.75,0.75,0.5,0.5,0.25,0.25,0,0', 'points scale: ' + scale);
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);

  // Mode 2: nothing marked. Mode 3: only the picture; tapping it says the word.
  await p.click('.card.quiz:has-text("Dos")'); await p.waitForTimeout(500);
  assert(await p.isVisible('.tp-word') && !(await p.$('.tp-ch.now')) && !(await p.isVisible('.tp-enter')), 'mode 2: word shown, no letter marked');
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);
  await p.click('.card.quiz:has-text("Tres")'); await p.waitForTimeout(500);
  assert(!(await p.$('.tp-word')) && await p.isVisible('.tp-img'), 'mode 3: only the picture, no word');
  await p.evaluate(() => { window.__said = []; });
  await p.click('.tp-img'); await p.waitForTimeout(200);
  assert((await p.evaluate(() => window.__said)).includes('pez'), 'mode 3: tapping the picture says the word');
  await key('p'); await key('e'); await key('z');
  assert((await typed()) === 'pez', 'mode 3: typed from memory');
  // A real keyboard works too
  await p.keyboard.press('Backspace');
  assert((await typed()) === 'pez' && (await tones()).includes('bad'), 'real keyboard: ⌫ with nothing red is a mistake');
  await p.keyboard.press('Enter'); await p.waitForTimeout(2200);
  assert(await p.isVisible('.finish'), 'real keyboard: Enter finishes');
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);

  // Editor: new «Pantalla de Tablet»
  await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  await p.click('button:has-text("Nueva actividad")'); await p.waitForTimeout(300);
  assert(await p.isVisible('.kind-choice:has-text("Pantalla de Tablet")'), 'the new kind is offered');
  await p.click('.kind-choice:has-text("Pantalla de Tablet")'); await p.waitForTimeout(600);
  assert(await p.isVisible('#edTyping') && await p.isVisible('.tp-mode'), 'editor opens with words and modes');
  await p.fill('#edName', 'Saludos');
  const rows = await p.$$('.tp-item-text');
  await rows[0].fill('Hola');
  await rows[1].fill('Buenos días ☺');
  assert(await p.isVisible('.tp-item-warn:has-text("☺")'), 'a sign not on the keyboard is flagged');
  await rows[1].fill('Buenos días');
  await p.click('.tp-mode:has-text("Modo 3")');
  assert(await p.isVisible('.problem-box:has-text("Modo 3")'), 'mode 3 asks for pictures');
  await p.click('.tp-mode:has-text("Modo 2")');
  await p.check('.settings-grid .switch input >> nth=0');
  await p.click('button:has-text("Guardar")'); await p.waitForTimeout(500);
  const saved = await p.evaluate(() => LL.store.quizzes().find((q) => q.name === 'Saludos'));
  assert(saved && saved.type === 'typing' && saved.config.typing.mode === 2 && saved.config.questions.length === 2, 'saved: type typing, mode 2, empty row dropped');
  assert(saved && LL_ok(saved), 'saved words: ' + (saved && saved.config.questions.map((q) => q.text).join(' | ')));
  function LL_ok(s) { return s.config.questions[1].text === 'Buenos días'; }
  // Sync conversion both ways
  const conv = await p.evaluate((id) => {
    const e = LL.store.readLibrary().find((x) => x.id === id);
    const pl = LL.sync._convert.entryToPayload(e, new Set());
    const row = { ...pl.p_quiz, quiz_questions: pl.p_questions.map((q) => ({ ...q, quiz_options: [] })), settings: pl.p_quiz.settings };
    const back = LL.sync._convert.rowToEntry(row);
    return { type: pl.p_quiz.activity_type, settings: pl.p_quiz.settings, backType: back.type, backMode: back.config.typing.mode, words: back.config.questions.map((q) => q.text) };
  }, saved.id);
  assert(conv.type === 'typing' && conv.settings.mode === 2, 'upload: activity_type typing, settings.mode 2');
  assert(conv.backType === 'typing' && conv.backMode === 2 && conv.words.join('|') === 'Hola|Buenos días', 'download: same activity back');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
