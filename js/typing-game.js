/* «Pantalla de Tablet» (activity type 'typing', V127).
 *
 * The child copies a word or phrase with an on-screen keyboard that looks like the school tablets'
 * keyboard (lower case, upper case with Shift, numbers row, «?123» page with more signs). It teaches
 * the keys and their functions: letters, Shift, Space, Backspace (⌫) and Enter.
 *
 * Modes (one per activity, config.typing.mode):
 *   1 — the letter to type is marked with a yellow box in the word above;
 *   2 — the word is shown but no letter is marked;
 *   3 — only the picture (tap it to hear the word); the child writes it from memory.
 *
 * Rules (from the teacher):
 *   - Right key: the letter appears in the white box. Upper/lower case must match (Shift first).
 *   - Wrong key: buzzer and the key blinks red; a wrong letter appears in red in the white box and must
 *     be erased with ⌫ before going on.
 *   - A second mistake on the same letter: the key to press turns green and the rest of the keyboard is
 *     locked until it is pressed (first ⌫ if a red letter is there; Shift / ?123 / ABC when needed).
 *   - When the word is complete, Enter goes to the next word (same green help if it can't be found).
 *   - Points per word: 0 mistakes = 1; 1–2 = 0.75; 3–4 = 0.5; 5–6 = 0.25; more than 6 = 0.
 */
window.LL = window.LL || {};
(function () {
  const { el, toast, confetti } = LL.ui;

  const LONG_PRESS_MS = 450;
  const DOUBLE_SHIFT_MS = 380;
  const VARIANTS = { a: ['á'], e: ['é'], i: ['í'], o: ['ó'], u: ['ú', 'ü'], n: ['ñ'] };
  const DIGITS = '1234567890'.split('');
  const SYM_ROWS = [
    '@#$%&-+=()'.split(''),
    ['*', '"', "'", ':', ';', '¡', '!', '¿', '?'],
    ['~', '|', '<', '>', '[', ']', '{', '}', '\\', '°'],
  ];

  /** Letters page. The Spanish keyboard has ñ after l (like the tablets set to Spanish). */
  function letterRows(lang) {
    return [
      [...'qwertyuiop'.split(''), 'back'],
      ['pad', ...'asdfghjkl'.split(''), ...(lang === 'en' ? [] : ['ñ']), 'enter'],
      ['shift', ...'zxcvbnm'.split(''), '!', '?', 'shift'],
      ['sym', '_', '/', 'space', ',', '.', 'hide'],
    ];
  }
  function symRows() {
    return [
      [...SYM_ROWS[0], 'back'],
      ['pad', ...SYM_ROWS[1], 'enter'],
      SYM_ROWS[2],
      ['abc', '_', '/', 'space', ',', '.', 'hide'],
    ];
  }
  const KEYWORDS = new Set(['back', 'enter', 'shift', 'sym', 'abc', 'space', 'hide', 'pad']);
  const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase();
  const lower = (ch) => ch.toLocaleLowerCase('es');
  const upper = (ch) => ch.toLocaleUpperCase('es');

  /** Characters each page can type (besides the numbers row, which is always there). */
  function pageChars(page, lang) {
    const rows = page === 'sym' ? symRows() : letterRows(lang);
    const s = new Set(DIGITS);
    for (const r of rows) for (const k of r) if (!KEYWORDS.has(k)) s.add(k);
    s.add(' ');
    return s;
  }
  /** Base key of a lower-case letter on the letters page: 'á' → 'a'; 'ñ' → 'ñ' (es) or 'n' (en). */
  function baseKey(ch, lang) {
    const letters = pageChars('letters', lang);
    if (letters.has(ch)) return ch;
    for (const [base, vs] of Object.entries(VARIANTS)) if (vs.includes(ch) && letters.has(base)) return base;
    return null;
  }
  /** Can this character be typed with our keyboard? */
  function canType(ch, lang) {
    if (ch === ' ') return true;
    if (isLetter(ch)) return !!baseKey(lower(ch), lang);
    return pageChars('letters', lang).has(ch) || pageChars('sym', lang).has(ch);
  }
  /** Characters of a text that the keyboard can't type (for the editor). */
  function unsupported(text, lang) {
    const bad = new Set();
    for (const ch of normalize(text)) if (!canType(ch, lang)) bad.add(ch);
    return [...bad];
  }
  const normalize = (t) => String(t || '').normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();

  /** Points for one word: 0 mistakes = 1; 1–2 = 0.75; 3–4 = 0.5; 5–6 = 0.25; more = 0. */
  const pointsFor = (errors) => (errors <= 0 ? 1 : errors <= 2 ? 0.75 : errors <= 4 ? 0.5 : errors <= 6 ? 0.25 : 0);

  // Toolbar of the tablet keyboard: icons are only for looks; the numbers type.
  const TOOL_ICONS_LEFT = ['⌨️', '🙂', '📋', '✍️', '🎤'];
  const TOOL_ICONS_RIGHT = ['🔄', '🌐'];

  let game = null;

  /**
   * host: element to fill. q: { id, text, image }. o: { mode, lang, say(), onDone({ typed, errors, points, ms }) }
   */
  function start(host, q, o) {
    stop();
    const text = normalize(q.text);
    const g = game = {
      host, q, o, mode: [1, 2, 3].includes(Number(o.mode)) ? Number(o.mode) : 1, lang: o.lang === 'en' ? 'en' : 'es',
      target: [...text, '\n'], pos: 0, typed: [], pending: null,
      page: 'letters', shift: 0, lastShift: 0,
      errors: 0, stepErr: 0, hint: false, done: false, startedAt: Date.now(), timers: [],
    };

    // Top: the word to copy (modes 1 and 2) or only the picture (mode 3).
    const hasImg = LL.media.isImage(q.image);
    const img = hasImg ? el('button.tp-img', { type: 'button', 'aria-label': LL.ui.tr('Escuchar la palabra', 'Listen to the word'), title: LL.ui.tr('Toca para escuchar', 'Tap to listen') }, el('img', { src: q.image, alt: '' })) : null;
    if (img) img.addEventListener('click', () => { o.say && o.say(); img.classList.remove('pop'); void img.offsetWidth; img.classList.add('pop'); });
    const word = el('div.tp-word', { 'aria-label': g.mode === 3 ? '' : 'Copia: ' + text });
    g.chars = [];
    if (g.mode !== 3) {
      // Letters of one word stay together on a line (a phrase only wraps at its spaces).
      let group = null;
      [...text].forEach((ch) => {
        const s = el('span.tp-ch' + (ch === ' ' ? '.sp' : ''), ch === ' ' ? '\u00A0' : ch);
        g.chars.push(s);
        if (ch === ' ') { group = null; word.append(s, document.createTextNode(' ')); return; }
        if (!group) { group = el('span.tp-w'); word.append(group); }
        group.append(s);
      });
      const enter = el('span.tp-ch.tp-enter', { title: 'Enter' }, '⏎'); g.chars.push(enter);
      (group || word).append(enter);
    }
    const listen = g.mode === 3 && !hasImg
      ? el('button.tp-listen', { type: 'button', onclick: () => o.say && o.say() }, el('span', '🔊'), el('span', LL.ui.tr('Escucha', 'Listen')))
      : null;
    const top = el('div.tp-target.mode-' + g.mode + (hasImg ? '.has-img' : ''),
      el('span.tp-tag', g.mode === 3 ? LL.ui.tr('👂 Escucha y escribe', '👂 Listen and write') : LL.ui.tr('👀 Copia', '👀 Copy')),
      el('div.tp-target-in', img, g.mode === 3 ? listen : word));

    // Middle: where the child writes.
    g.out = el('div.tp-out', { 'aria-live': 'polite' });
    g.caret = el('span.tp-caret', { 'aria-hidden': 'true' });
    const outBox = el('div.tp-typed', el('span.tp-tag', LL.ui.tr('✏️ Escribe aquí', '✏️ Write here')), el('div.tp-typed-in', g.out));
    g.outBox = outBox;

    // Bottom: the keyboard.
    g.kb = el('div.kb', { role: 'group', 'aria-label': 'Teclado' });
    g.pop = null;
    wireKeyboard(g);

    host.replaceChildren(el('div.tp', el('div.tp-boxes', top, outBox), g.kb));
    g.root = host.firstElementChild;
    drawKeyboard(g);
    drawOut(g);
    drawMarks(g);
    requestAnimationFrame(() => fit(g));
    g.onResize = () => fit(g);
    window.addEventListener('resize', g.onResize);
    g.onKey = (e) => physicalKey(g, e);
    document.addEventListener('keydown', g.onKey);
    return { total: 1 };
  }

  function stop() {
    const g = game; if (!g) return;
    g.timers.forEach(clearTimeout);
    window.removeEventListener('resize', g.onResize);
    window.removeEventListener('pointerup', g.onUp);
    document.removeEventListener('keydown', g.onKey);
    closePop(g);
    game = null;
  }
  const later = (g, ms, fn) => { const t = setTimeout(() => { if (game === g) fn(); }, ms); g.timers.push(t); };

  /* ---------- Drawing ---------- */
  function keyLabel(g, k) {
    if (k === 'back') return '⌫';
    if (k === 'enter') return '↵';
    if (k === 'shift') return g.shift ? '⬆' : '⇧';
    if (k === 'sym') return '?123';
    if (k === 'abc') return 'ABC';
    if (k === 'space') return '';
    if (k === 'hide') return '⌨';
    return g.page === 'letters' && g.shift && isLetter(k) ? upper(k) : k;
  }
  const KEY_NAMES = { back: 'Borrar', enter: 'Enter', shift: 'Mayúsculas (Shift)', sym: 'Números y signos', abc: 'Letras', space: 'Espacio', hide: 'Ocultar teclado' };

  function drawKeyboard(g) {
    const rows = g.page === 'sym' ? symRows() : letterRows(g.lang);
    const tools = el('div.kb-tools',
      ...TOOL_ICONS_LEFT.map((i) => el('span.kb-icon', { 'aria-hidden': 'true' }, i)),
      el('span.kb-sep'),
      ...DIGITS.map((d) => keyButton(g, d, 'kb-num')),
      el('span.kb-sep'),
      ...TOOL_ICONS_RIGHT.map((i) => el('span.kb-icon', { 'aria-hidden': 'true' }, i)),
      el('span.kb-sep'),
      el('span.kb-icon', { 'aria-hidden': 'true' }, '▣'));
    const body = el('div.kb-rows', ...rows.map((r, ri) => el('div.kb-row.r' + (ri + 1), ...r.map((k) => (k === 'pad' ? el('span.kb-pad') : keyButton(g, k))))));
    g.kb.replaceChildren(tools, body);
    g.kb.classList.toggle('caps', g.shift === 2);
    g.kb.classList.toggle('shifted', g.shift > 0);
    g.kb.classList.toggle('sym', g.page === 'sym');
    applyHint(g);
  }

  function keyButton(g, k, extra) {
    const special = KEYWORDS.has(k);
    const label = keyLabel(g, k);
    const b = el('button.kb-key' + (extra ? '.' + extra : '') + (special ? '.k-' + k : ''), {
      type: 'button', dataset: { k }, tabIndex: -1,
      'aria-label': special ? KEY_NAMES[k] : (label === ' ' ? 'Espacio' : label),
    });
    b.append(el('span.kb-label', label));
    if (g.page === 'letters' && VARIANTS[k] && (k !== 'n' || g.lang === 'en')) b.append(el('span.kb-alt', { 'aria-hidden': 'true' }, VARIANTS[k][0]));
    if (!special) b.dataset.label = label;
    return b;
  }

  function drawOut(g) {
    const parts = g.typed.map((ch) => el('span.tp-och' + (ch === ' ' ? '.sp' : ''), ch === ' ' ? '\u00A0' : ch));
    if (g.pending != null) parts.push(el('span.tp-och.bad', g.pending === ' ' ? '\u00A0' : g.pending));
    g.out.replaceChildren(...parts, g.caret);
  }

  /** Mode 1: yellow box on the letter to type (done letters turn green). Mode 2: nothing marked. */
  function drawMarks(g) {
    if (g.mode !== 1) { g.chars.forEach((s) => s.classList.remove('now', 'done')); return; }
    g.chars.forEach((s, i) => { s.classList.toggle('done', i < g.pos); s.classList.toggle('now', i === g.pos && !g.done); });
  }

  /** Same big letters in both boxes, shrunk only when the phrase doesn't fit. */
  function fit(g) {
    if (game !== g || !g.root.isConnected) return;
    const r = g.root;
    r.style.removeProperty('--tp-size');
    const word = r.querySelector('.tp-word');
    if (!word) return;
    const box = word.parentElement;
    let size = parseFloat(getComputedStyle(word).fontSize) || 56;
    let guard = 0;
    while (size > 18 && guard++ < 60 && (word.scrollWidth > box.clientWidth + 1 || word.scrollHeight > box.clientHeight + 1)) {
      size -= 3; r.style.setProperty('--tp-size', size + 'px');
    }
  }

  /* ---------- What should be pressed now ---------- */
  /** The key that moves the child toward the next character: { k, variant? }. */
  function expected(g) {
    if (g.pending != null) return { k: 'back' };
    const t = g.target[g.pos];
    if (t === '\n') return { k: 'enter' };
    if (t === ' ') return { k: 'space' };
    if (DIGITS.includes(t)) return { k: t };
    if (isLetter(t)) {
      if (g.page === 'sym') return { k: 'abc' };
      const up = t !== lower(t);
      if (up !== (g.shift > 0)) return { k: 'shift' };
      const low = lower(t), base = baseKey(low, g.lang);
      return base && base !== low ? { k: base, variant: up ? t : low } : { k: low };
    }
    if (pageChars(g.page, g.lang).has(t)) return { k: t };
    return { k: g.page === 'letters' ? 'sym' : 'abc' };
  }

  /** Green key + locked keyboard while the help is on. */
  function applyHint(g) {
    const keys = g.kb.querySelectorAll('.kb-key');
    keys.forEach((b) => b.classList.remove('hint'));
    g.kb.classList.toggle('locked', !!g.hint && !g.done);
    if (!g.hint || g.done) return;
    const ex = expected(g);
    const b = g.kb.querySelector('.kb-key[data-k="' + cssEsc(ex.k) + '"]');
    if (b) b.classList.add('hint');
  }
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));

  /* ---------- Pressing keys ---------- */
  function wireKeyboard(g) {
    let downKey = null, longTimer = null, longDone = false;
    const keyOf = (e) => e.target.closest && e.target.closest('.kb-key');
    g.kb.addEventListener('contextmenu', (e) => e.preventDefault());
    g.kb.addEventListener('pointerdown', (e) => {
      const b = keyOf(e);
      if (!b || e.button > 0) return;
      e.preventDefault();
      if (g.pop && !g.pop.contains(e.target)) closePop(g);
      if (g.kb.classList.contains('locked') && !b.classList.contains('hint')) return;
      downKey = b; longDone = false;
      b.classList.add('down');
      const k = b.dataset.k;
      clearTimeout(longTimer);
      if (variantsOf(g, k).length) {
        longTimer = setTimeout(() => { longDone = true; b.classList.remove('down'); openPop(g, b, k); }, LONG_PRESS_MS);
      }
    });
    const up = (e, commit) => {
      clearTimeout(longTimer);
      const b = downKey; downKey = null;
      if (!b) return;
      b.classList.remove('down');
      if (!commit || longDone) return;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (over && b.contains(over)) press(g, b.dataset.k, b);
    };
    window.addEventListener('pointerup', g.onUp = (e) => { if (game === g) up(e, true); });
    g.kb.addEventListener('pointercancel', (e) => up(e, false));
    g.kb.addEventListener('pointerleave', () => { if (downKey && !longDone) { clearTimeout(longTimer); downKey.classList.remove('down'); downKey = null; } });
    // Keyboard users (Tab + Enter) and screen readers.
    g.kb.addEventListener('click', (e) => { const b = keyOf(e); if (b && e.detail === 0) press(g, b.dataset.k, b); });
  }

  function variantsOf(g, k) {
    if (g.page !== 'letters' || !VARIANTS[k]) return [];
    if (k === 'n' && g.lang !== 'en') return [];
    return VARIANTS[k].map((v) => (g.shift ? upper(v) : v));
  }

  /** Long press on a vowel: little bubble with á é í ó ú ü (like the tablets). */
  function openPop(g, b, k) {
    closePop(g);
    const vs = variantsOf(g, k);
    const ex = expected(g);
    const pop = el('div.kb-pop', { role: 'group', 'aria-label': 'Letras con tilde' },
      ...vs.map((v) => {
        const vb = el('button.kb-key.kb-var', { type: 'button', dataset: { v } }, v);
        if (g.hint && ex.variant === v) vb.classList.add('hint');
        vb.addEventListener('pointerup', (e) => { e.stopPropagation(); closePop(g); typeChar(g, v, b); });
        vb.addEventListener('click', (e) => { if (e.detail === 0) { closePop(g); typeChar(g, v, b); } });
        return vb;
      }));
    g.root.append(pop);
    const r = b.getBoundingClientRect(), host = g.root.getBoundingClientRect();
    const w = Math.max(r.width * vs.length, r.width);
    pop.style.left = Math.max(4, Math.min(r.left - host.left + r.width / 2 - w / 2, host.width - w - 4)) + 'px';
    pop.style.top = (r.top - host.top - r.height - 10) + 'px';
    pop.style.setProperty('--kw', r.width + 'px');
    pop.style.setProperty('--kh', r.height + 'px');
    g.pop = pop;
  }
  function closePop(g) { if (g && g.pop) { g.pop.remove(); g.pop = null; } }

  function press(g, k, btn) {
    if (game !== g || g.done) return;
    if (g.hint && (!btn || !btn.classList.contains('hint')) && !(btn && btn.classList.contains('kb-var'))) return;
    switch (k) {
      case 'shift': {
        if (g.page !== 'letters') return;
        const now = Date.now();
        if (g.shift === 1 && now - g.lastShift < DOUBLE_SHIFT_MS) g.shift = 2; // double tap = CAPS LOCK
        else g.shift = g.shift ? 0 : 1;
        g.lastShift = now;
        drawKeyboard(g);
        return;
      }
      case 'sym': g.page = 'sym'; drawKeyboard(g); return;
      case 'abc': g.page = 'letters'; drawKeyboard(g); return;
      case 'hide': case 'pad': wiggle(btn); return;
      case 'back':
        if (g.pending != null) {
          g.pending = null; drawOut(g); tap(btn);
          applyHint(g);
          return;
        }
        return mistake(g, btn, null);
      case 'enter':
        if (g.pending == null && g.target[g.pos] === '\n') { tap(btn); return complete(g, btn); }
        return mistake(g, btn, null);
      default: {
        const ex = expected(g);
        // In the help, the green vowel opens the bubble with the right accented letter.
        if (g.hint && ex.variant && btn && btn.dataset.k === ex.k) { openPop(g, btn, ex.k); return; }
        const ch = k === 'space' ? ' ' : (g.page === 'letters' && g.shift && isLetter(k) ? upper(k) : k);
        typeChar(g, ch, btn);
      }
    }
  }

  function typeChar(g, ch, btn) {
    if (game !== g || g.done) return;
    const k = btn && btn.dataset.k;
    if (g.pending != null) { mistake(g, btn, null); return; }
    // Shift pressed once only lasts for one letter (double tap = CAPS LOCK stays on).
    const redraw = (g.shift === 1 && isLetter(ch)) || g.hint;
    if (g.shift === 1 && isLetter(ch)) g.shift = 0;
    if (ch === g.target[g.pos]) {
      g.typed.push(ch); g.pos++; g.stepErr = 0; g.hint = false;
      if (redraw) drawKeyboard(g); else applyHint(g);
      tap(findKey(g, k) || btn, true);
      drawOut(g); drawMarks(g);
      return;
    }
    if (redraw) drawKeyboard(g);
    mistake(g, (k && findKey(g, k)) || btn, ch);
  }
  const findKey = (g, k) => (k ? g.kb.querySelector('.kb-key[data-k="' + cssEsc(k) + '"]') : null);

  function mistake(g, btn, glyph) {
    g.errors++; g.stepErr++;
    if (glyph != null && g.pending == null) g.pending = glyph;
    LL.ui.feedbackTone(false);
    if (btn) { btn.classList.remove('bad'); void btn.offsetWidth; btn.classList.add('bad'); later(g, 900, () => btn.classList.remove('bad')); }
    g.outBox.classList.remove('shake'); void g.outBox.offsetWidth; g.outBox.classList.add('shake');
    drawOut(g);
    if (g.stepErr >= 2 && !g.hint) {
      g.hint = true;
      later(g, 350, () => { applyHint(g); toast(g.pending != null ? LL.ui.tr('Toca la tecla verde ⌫ para borrar.', 'Tap the green ⌫ key to erase.') : LL.ui.tr('Toca la tecla verde.', 'Tap the green key.')); });
    } else applyHint(g);
  }

  function complete(g) {
    g.done = true; g.hint = false;
    applyHint(g); drawMarks(g);
    g.caret.remove();
    const points = pointsFor(g.errors);
    LL.ui.feedbackTone(true);
    g.outBox.classList.add('win');
    g.root.querySelector('.tp-target').classList.add('win');
    const r = g.outBox.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2);
    g.outBox.append(el('span.tp-points' + (points === 1 ? '.full' : ''), points === 1 ? LL.ui.tr('⭐ ¡Perfecto!', '⭐ Perfect!') : points > 0 ? LL.ui.tr('⭐ ¡Muy bien!', '⭐ Great job!') : LL.ui.tr('👍 ¡Lo lograste!', '👍 You did it!')));
    later(g, 1600, () => { const o = g.o; const res = { typed: g.typed.join(''), errors: g.errors, points, ms: Date.now() - g.startedAt }; stop(); o.onDone && o.onDone(res); });
  }

  function tap(btn, good) {
    if (!btn) return;
    btn.classList.remove('ok'); void btn.offsetWidth;
    if (good) btn.classList.add('ok');
  }
  function wiggle(btn) { if (!btn) return; btn.classList.remove('wig'); void btn.offsetWidth; btn.classList.add('wig'); }

  /** A real keyboard (Chromebook) works too: the typed character counts as is. */
  function physicalKey(g, e) {
    if (game !== g || g.done || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-back')) return;
    const find = (k) => g.kb.querySelector('.kb-key[data-k="' + cssEsc(k) + '"]');
    if (e.key === 'Backspace') { e.preventDefault(); const b = find('back'); if (!g.hint || (b && b.classList.contains('hint'))) press(g, 'back', b); return; }
    if (e.key === 'Enter') { e.preventDefault(); const b = find('enter'); if (!g.hint || (b && b.classList.contains('hint'))) press(g, 'enter', b); return; }
    if (e.key.length !== 1) return;
    e.preventDefault();
    const ch = e.key;
    if (g.hint && g.pending == null && ch !== g.target[g.pos]) return;
    if (g.hint && g.pending != null) return;
    const k = ch === ' ' ? 'space' : (baseKey(lower(ch), g.lang) || ch);
    typeChar(g, ch, find(k));
  }

  LL.typingGame = { start, stop, isRunning: () => !!game, unsupported, canType, normalize, pointsFor };
})();
