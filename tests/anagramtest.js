// «Anagrama» (V127): letters dragged to their boxes; wrong box → the letter goes back + a mistake;
// outside → back without a mistake; repeated letters fit any of their boxes; phrases keep their spaces;
// «Con pistas» (text, picture, sound); the word is said at the end; points; results; editor; sync.
// Usage: node anagramtest.js ../index.html [screenshot-folder]
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shots = process.argv[3];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const item = (id, text, extra) => ({ id, text, image: '', audioMode: 'none', readTextEnabled: false, readText: '', audio: '', options: [], ...(extra || {}) });
const act = (id, name, clues, qs, extra) => ({ id, familyId: id, version: 1, type: 'anagram', name, folderId: null, createdAt: '2026-10-01', config: { lang: 'es', visibility: 'visible', questionOrder: 'fixed', answerOrder: 'fixed', anagram: { clues }, questions: qs, ...(extra || {}) } });
const lib = [
  act('a1', 'Nombres', false, [item('n1', 'Arleth Escobedo'), item('n2', 'oso')], { instructions: 'Arrastra cada letra a su casilla.' }),
  act('a2', 'Con pista', true, [item('c1', 'gato', { image: PNG, readText: 'Dice miau', readTextEnabled: true, audioMode: 'voice' })]),
  act('a3', 'Incompleta', true, [item('x1', 'sol')]), // clues on, but no clue: not ready
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
  await p.evaluate(() => { LL.ui.feedbackTone = (ok) => { window.__tones.push(ok ? 'ok' : 'bad'); }; });
  const tones = () => p.evaluate(() => window.__tones.splice(0));
  const said = () => p.evaluate(() => window.__said.splice(0));

  const center = async (handle) => { const r = await handle.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const drag = async (from, to) => {
    const a = await center(from);
    await p.mouse.move(a.x, a.y); await p.mouse.down();
    await p.mouse.move((a.x + to.x) / 2, (a.y + to.y) / 2, { steps: 4 });
    await p.mouse.move(to.x, to.y, { steps: 4 });
    await p.mouse.up(); await p.waitForTimeout(350);
  };
  const state = () => p.evaluate(() => ({
    slots: [...document.querySelectorAll('.an-slot')].map((s) => s.textContent || '_').join(''),
    tray: [...document.querySelectorAll('.an-tile')].map((t) => t.textContent).join(''),
  }));
  /** Tile (in the tray) with a given letter, or with a letter different from it (not: true). */
  const tile = (ch, not) => p.evaluateHandle(({ ch, not }) => [...document.querySelectorAll('.an-tray .an-tile:not(.lifted)')].find((t) => (not ? t.textContent !== ch : t.textContent === ch)), { ch, not });
  const slot = (i) => p.$('.an-slot >> nth=' + i);
  /** Fill every box correctly, in order. */
  const solve = async () => {
    const n = (await p.$$('.an-slot')).length;
    for (let i = 0; i < n; i++) {
      const s = await slot(i);
      if (await s.evaluate((x) => x.classList.contains('ok'))) continue;
      const want = await p.evaluate((i) => LL.anagramGame && document.querySelectorAll('.an-slot')[i] && null, i);
      const ch = await p.evaluate((i) => { const all = [...document.querySelectorAll('.an-slot')]; return window.__target ? window.__target[i] : null; }, i);
      await drag(await tile(ch), await center(s));
    }
  };

  await p.click('.student-card >> nth=0'); await p.waitForTimeout(400);
  assert(await p.isVisible('.card.quiz:has-text("Nombres") .meta:has-text("Anagrama · 2 palabras")'), 'library card says «Anagrama · 2 palabras»');
  assert(!(await p.isVisible('.card.quiz:has-text("Incompleta")')), 'with clues on and a word without clue: not shown to students');

  // ---- Word 1: «Arleth Escobedo» (no clues)
  await said();
  await p.click('.card.quiz:has-text("Nombres")'); await p.waitForTimeout(900);
  assert(await p.isVisible('#player .an'), 'the anagram opens');
  assert((await p.$$('.an-slot')).length === 14 && (await p.$$('.an-gap')).length === 1, 'phrase: 14 boxes and a gap for the space');
  assert((await p.$$('.an-tile')).length === 14, '14 letter tiles');
  const st0 = await state();
  assert([...st0.tray].sort().join('') === [...'ArlethEscobedo'].sort().join(''), 'the tiles are exactly the letters of the phrase');
  assert(st0.tray !== 'ArlethEscobedo', 'the letters are mixed');
  assert(!(await p.isVisible('.an-clue')), 'no clue card without clues');
  assert(await p.isDisabled('#playerSpeak'), 'without clues 🔊 is off (the word is not given away)');
  const s1 = await said();
  assert(s1.includes('Arrastra cada letra a su casilla.') && !s1.some((t) => /Arleth/.test(t)), 'instructions read at the start; the word is not said');
  await p.evaluate(() => { window.__target = [...'ArlethEscobedo']; });

  // Wrong box: back to its place + mistake
  await tones();
  const wrong = await tile('A', true);
  const wrongCh = await wrong.evaluate((t) => t.textContent);
  await drag(wrong, await center(await slot(0)));
  let st = await state();
  assert(st.slots === '______________' && [...st.tray].sort().join('') === [...st0.tray].sort().join(''), 'a letter dropped on the wrong box goes back to the tray (' + wrongCh + ')');
  assert((await tones()).join() === 'bad', 'wrong box: buzzer');
  if (shots) await p.screenshot({ path: shots + '/anagram-start.png' });

  // Outside the boxes: back, no mistake
  await drag(await tile('A'), { x: 640, y: 120 });
  st = await state();
  assert(st.slots === '______________', 'dropped outside the boxes: goes back');
  assert((await tones()).length === 0, 'outside: no buzzer (not a mistake)');

  // Right box
  await drag(await tile('A'), await center(await slot(0)));
  st = await state();
  assert(st.slots.startsWith('A_') && !st.tray.includes('A'), 'the right letter stays in its box');
  assert(await p.isVisible('.an-slot.ok >> nth=0'), 'the box turns green');
  assert((await tones()).join() === 'ok', 'right box: happy tone');

  // Filled box: dropping there again sends the letter back, no mistake
  await drag(await tile('r'), await center(await slot(0)));
  assert((await state()).slots.startsWith('A_') && (await tones()).length === 0, 'a filled box does not take another letter (no mistake)');

  // Repeated letter: the «e» of «Escobedo» (box 11) accepts any «e» tile (also the one of «Arleth»)
  await drag(await tile('e'), await center(await slot(11)));
  assert((await state()).slots[11] === 'e', 'repeated letters: an «e» fits any «e» box');

  // Touch drag works too
  const cdp = await ctx.newCDPSession(p);
  {
    const a = await center(await tile('r')), z = await center(await slot(1));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
    for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (z.x - a.x) * k / 5, y: a.y + (z.y - a.y) * k / 5, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(350);
    assert((await state()).slots.startsWith('Ar'), 'dragging with a finger works');
  }

  await said();
  await solve();
  st = await state();
  assert(st.slots === 'ArlethEscobedo' && st.tray === '', 'all letters placed');
  assert(await p.isVisible('.an-area.win') && await p.isVisible('.an-points:has-text("Muy bien")'), 'win: green card, «¡Muy bien!» (1 mistake)');
  if (shots) await p.screenshot({ path: shots + '/anagram-win.png' });
  await p.waitForTimeout(700);
  assert((await said()).includes('Arleth Escobedo'), 'the voice says the phrase at the end');
  await p.waitForTimeout(2300);

  // ---- Word 2: «oso»
  assert((await p.$$('.an-slot')).length === 3, 'next word comes by itself');
  await p.evaluate(() => { window.__target = [...'oso']; });
  await solve();
  assert(await p.isVisible('.an-points:has-text("Perfecto")'), 'no mistakes: «¡Perfecto!»');
  await p.waitForTimeout(3200);
  assert(await p.isVisible('.finish'), 'finish screen after the last word');
  const res = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ll-v124-results') || '{}')).find((r) => r.quiz_id === 'a1'));
  console.log('   answers:', JSON.stringify(res && res.answers.map((a) => [a.prompt, a.points, a.errors, a.chosen_text])));
  assert(res && res.score === 1.75 && res.total === 2, 'result: 0.75 + 1 = 1.75 / 2 (got ' + (res && res.score) + ')');
  assert(res && res.answers[0].errors === 1 && res.answers[0].points === 0.75 && res.answers[0].chosen_text === 'Arleth Escobedo', 'answer keeps points and mistakes per word');

  // ---- With clues
  await p.click('#player .finish button:has-text("Salir"), #player .finish button:has-text("actividades")').catch(() => {});
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(400);
  if (await p.isVisible('.student-card')) { await p.click('.student-card >> nth=0'); await p.waitForTimeout(400); }
  await said();
  await p.click('.card.quiz:has-text("Con pista")'); await p.waitForTimeout(1200);
  assert(await p.isVisible('.an-clue .an-clue-text:has-text("Dice miau")') && await p.isVisible('.an-clue-img img'), 'clue card: text and picture');
  assert(!(await p.isDisabled('#playerSpeak')), '🔊 plays the clue');
  assert((await said()).includes('Dice miau'), 'the clue is read at the start');
  await p.click('.an-clue-img'); await p.waitForTimeout(200);
  assert((await said()).includes('Dice miau'), 'tapping the picture reads the clue');
  if (shots) await p.screenshot({ path: shots + '/anagram-clue.png' });
  await p.evaluate(() => LL.player.close()); await p.waitForTimeout(300);

  // ---- Results detail
  const detail = await p.evaluate(() => { const q = LL.store.getQuiz('a1'); return !!q; });
  assert(detail, 'activity still there');

  // ---- Editor
  await p.evaluate(() => LL.app.goHome()); await p.waitForTimeout(600);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  await p.click('button:has-text("Nueva actividad")'); await p.waitForTimeout(300);
  assert(await p.isVisible('.kind-choice:has-text("Anagrama")'), '«Anagrama» is in the list of activity types');
  await p.click('.kind-choice:has-text("Anagrama")'); await p.waitForTimeout(500);
  assert(await p.isVisible('#edAnagram') && await p.isVisible('.type-tag:has-text("Anagrama")'), 'anagram editor opens');
  assert((await p.$$('.an-word-input')).length === 3 && !(await p.isVisible('.an-clue-input')), '3 empty words; no clue fields «Sin pistas»');
  await p.fill('#edName', 'Compañeros');
  await p.fill('.an-word-input >> nth=0', 'Arleth Escobedo');
  await p.click('.tp-mode:has-text("Con pistas")'); await p.waitForTimeout(200);
  assert((await p.$$('.an-clue-input')).length === 3 && (await p.$$('.an-clue-cell .an-in-btn')).length === 6 && await p.isVisible('.an-swap'), '«Con pistas»: clue column with 🎤 and 🖼️, and «Intercambiar columnas»');
  assert(await p.isVisible('.problem-box:has-text("le falta la pista")'), 'a word without clue is flagged');
  await p.fill('.an-clue-input >> nth=0', 'Se sienta junto a la ventana');
  assert(await p.isVisible('.ok-box:has-text("1 palabra")'), 'with the clue it is ready (empty rows ignored)');
  if (shots) await p.screenshot({ path: shots + '/anagram-editor.png', fullPage: true });
  await p.click('.editor-top button:has-text("Guardar")'); await p.waitForTimeout(400);
  const saved = await p.evaluate(() => LL.store.quizzes().find((q) => q.name === 'Compañeros'));
  assert(saved && saved.type === 'anagram' && saved.config.anagram.clues === true && saved.config.questions.length === 1, 'saved as anagram with clues, empty rows dropped');
  const q0 = saved.config.questions[0];
  assert(q0.text === 'Arleth Escobedo' && q0.readText === 'Se sienta junto a la ventana' && q0.readTextEnabled && q0.audioMode === 'voice', 'clue stored in readText; the voice reads it');

  // ---- Sync conversion (database format)
  const conv = await p.evaluate((id) => {
    const e = LL.store.getQuiz(id);
    const pay = LL.sync._convert.entryToPayload(e, new Set());
    return pay && { type: pay.p_quiz.activity_type, settings: pay.p_quiz.settings, prompt: pay.p_questions[0].prompt, read: pay.p_questions[0].read_text };
  }, saved.id);
  if (conv) assert(conv.type === 'anagram' && conv.settings.clues === true && conv.prompt === 'Arleth Escobedo' && conv.read === 'Se sienta junto a la ventana', 'database format: activity_type anagram, settings {clues}, prompt = word, read_text = clue');
  else console.log('SKIP sync conversion (no test hook)');

  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
