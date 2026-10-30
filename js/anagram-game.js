/* «Anagrama» (activity type 'anagram', V127), like Wordwall's «Anagram».
 *
 * The child builds a word or phrase from its mixed-up letters: each letter is a tile that is dragged
 * (finger or mouse) to its box. Spaces of a phrase are shown as gaps, not as tiles.
 *
 * Rules (from the teacher):
 *   - A letter dropped on its box stays there (green). Repeated letters can go in any box with that
 *     same letter.
 *   - A letter dropped on a wrong box goes back to its place (buzzer) and counts as a mistake.
 *     Dropped outside the boxes (or on a filled box) it just goes back, without a mistake.
 *   - When every box is filled, the voice says the word or phrase and the next one comes.
 *   - Points per word (same as «Pantalla de Tablet»): 0 mistakes = 1; 1–2 = 0.75; 3–4 = 0.5;
 *     5–6 = 0.25; more = 0.
 *   - «Con pistas»: a clue card shows the picture and/or text; its sound (file, or the voice reading
 *     the text) plays at the start and with 🔊 or a tap on the picture.
 */
window.LL = window.LL || {};
(function () {
  const { el, confetti } = LL.ui;
  const feedbackTone = (ok) => LL.ui.feedbackTone(ok);
  let game = null;

  const normalize = (t) => String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const pointsFor = (errors) => (errors <= 0 ? 1 : errors <= 2 ? 0.75 : errors <= 4 ? 0.5 : errors <= 6 ? 0.25 : 0);

  /** Mix the letters; never leave them already in order (when that is possible). */
  function mix(chars) {
    const idx = chars.map((_, i) => i);
    const same = (a) => a.every((k, i) => chars[k] === chars[i]);
    const allSame = chars.every((c) => c === chars[0]);
    for (let tries = 0; tries < 30; tries++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      if (allSame || !same(idx)) break;
    }
    return idx;
  }

  /** host: element to fill. q: { text, image, readText }. o: { clues, say(), onDone(result) } */
  function start(host, q, o) {
    stop();
    const text = normalize(q.text);
    const g = game = { host, q, o, text, errors: 0, placed: 0, done: false, startedAt: Date.now(), timers: [], drag: null };

    // Clue card («Con pistas»).
    const clueText = o.clues ? String(q.readText || '').trim() : '';
    const hasImg = o.clues && LL.media.isImage(q.image);
    let clue = null;
    if (clueText || hasImg) {
      const img = hasImg ? el('button.an-clue-img', { type: 'button', 'aria-label': LL.ui.tr('Escuchar la pista', 'Listen to the clue'), title: LL.ui.tr('Toca para escuchar', 'Tap to listen') }, el('img', { src: q.image, alt: '' })) : null;
      if (img) img.addEventListener('click', () => { o.say && o.say(); img.classList.remove('pop'); void img.offsetWidth; img.classList.add('pop'); });
      clue = el('div.an-clue' + (hasImg ? '.has-img' : ''), el('span.an-tag', LL.ui.tr('💡 Pista', '💡 Clue')), el('div.an-clue-in', img, clueText ? el('div.an-clue-text', clueText) : null));
    }

    // Boxes: one per letter; the letters of a word stay together on a line.
    g.slots = [];
    const board = el('div.an-board', { role: 'group', 'aria-label': LL.ui.tr('Casillas de la palabra', 'Boxes of the word') });
    let word = null;
    [...text].forEach((ch) => {
      if (ch === ' ') { word = null; board.append(el('span.an-gap', { 'aria-hidden': 'true' })); return; }
      if (!word) { word = el('span.an-word'); board.append(word); }
      const slot = el('span.an-slot', { dataset: { i: String(g.slots.length) } });
      g.slots.push({ ch, el: slot, filled: false });
      word.append(slot);
    });

    // Tiles: the mixed letters, each on its own spot (the spot stays when the letter leaves).
    const chars = g.slots.map((s) => s.ch);
    g.tiles = [];
    const tray = el('div.an-tray');
    mix(chars).forEach((k) => {
      const home = el('span.an-home');
      const tile = el('span.an-tile', { role: 'button', tabindex: '-1', 'aria-label': chars[k] }, chars[k]);
      const t = { ch: chars[k], el: tile, home, used: false };
      tile.addEventListener('pointerdown', (e) => grab(g, t, e));
      tile.addEventListener('dragstart', (e) => e.preventDefault());
      home.append(tile);
      tray.append(home);
      g.tiles.push(t);
    });

    g.root = el('div.an', clue, el('div.an-area', el('span.an-tag', LL.ui.tr('🔤 Forma la palabra', '🔤 Build the word')), board), el('div.an-tray-wrap', tray));
    g.board = board;
    host.replaceChildren(g.root);
    requestAnimationFrame(() => fit(g));
    g.onResize = () => fit(g);
    window.addEventListener('resize', g.onResize);
    return { total: 1 };
  }

  function stop() {
    const g = game; if (!g) return;
    g.timers.forEach(clearTimeout);
    window.removeEventListener('resize', g.onResize);
    endDrag(g, true);
    game = null;
  }
  const later = (g, ms, fn) => { const t = setTimeout(() => { if (game === g) fn(); }, ms); g.timers.push(t); };

  /** Size of boxes and tiles: as big as possible while the longest line fits. */
  function fit(g) {
    if (game !== g) return;
    const w = g.board.clientWidth || g.host.clientWidth || 800;
    const words = g.text.split(' ').map((x) => [...x].length);
    const total = words.reduce((a, b) => a + b, 0) + (words.length - 1) * 0.5;
    const longest = Math.max(...words);
    const room = (n) => Math.floor((w - 16) / (n * 1.14));
    const maxH = Math.max(46, Math.floor(innerHeight * 0.13));
    let size = Math.min(110, maxH, room(total));
    if (size < 52) size = Math.min(110, maxH, room(longest)); // a long phrase wraps at its spaces
    size = Math.max(30, size);
    g.root.style.setProperty('--an-size', size + 'px');
    // Then make sure everything also fits in height (clue, boxes and tiles), shrinking a little at a time.
    const avail = g.host.clientHeight;
    let guard = 0;
    while (avail && size > 30 && g.root.scrollHeight > avail + 1 && guard++ < 40) {
      size -= 3;
      g.root.style.setProperty('--an-size', size + 'px');
    }
  }

  /* ---------- Dragging ---------- */
  function grab(g, t, e) {
    if (game !== g || g.done || t.used || g.drag) return;
    if (e.button > 0) return;
    e.preventDefault();
    const r = t.el.getBoundingClientRect();
    const ghost = t.el.cloneNode(true);
    ghost.classList.add('an-ghost');
    Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
    document.body.append(ghost);
    t.el.classList.add('lifted');
    const d = g.drag = { t, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, over: null };
    d.move = (ev) => { if (ev.pointerId !== d.id) return; ev.preventDefault(); moveTo(g, ev.clientX, ev.clientY); };
    d.up = (ev) => { if (ev.pointerId !== d.id) return; drop(g, ev.clientX, ev.clientY); };
    d.cancel = (ev) => { if (ev.pointerId !== d.id) return; back(g, t); endDrag(g); };
    window.addEventListener('pointermove', d.move, { passive: false });
    window.addEventListener('pointerup', d.up);
    window.addEventListener('pointercancel', d.cancel);
    moveTo(g, e.clientX, e.clientY);
  }

  function moveTo(g, x, y) {
    const d = g.drag; if (!d) return;
    d.ghost.style.left = (x - d.dx) + 'px';
    d.ghost.style.top = (y - d.dy) + 'px';
    const s = slotAt(g, x, y);
    if (d.over !== s) {
      if (d.over) d.over.el.classList.remove('over');
      d.over = s;
      if (s && !s.filled) s.el.classList.add('over');
    }
  }

  /** The box under the finger (or the nearest one, if the finger is just beside it). */
  function slotAt(g, x, y) {
    let best = null, bestD = Infinity;
    for (const s of g.slots) {
      const r = s.el.getBoundingClientRect();
      const pad = r.width * 0.35;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
      const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (dist < bestD) { bestD = dist; best = s; }
    }
    return best;
  }

  function drop(g, x, y) {
    const d = g.drag; if (!d) return;
    const t = d.t;
    const s = slotAt(g, x, y);
    if (!s || s.filled) { back(g, t); endDrag(g); return; } // outside the boxes: no mistake
    if (s.ch === t.ch) { place(g, t, s); endDrag(g); return; }
    // Wrong box: the letter goes back to its place.
    g.errors++;
    feedbackTone(false);
    s.el.classList.remove('bad'); void s.el.offsetWidth; s.el.classList.add('bad');
    back(g, t);
    endDrag(g);
  }

  function endDrag(g, silent) {
    const d = g && g.drag; if (!d) return;
    window.removeEventListener('pointermove', d.move);
    window.removeEventListener('pointerup', d.up);
    window.removeEventListener('pointercancel', d.cancel);
    if (d.over) d.over.el.classList.remove('over');
    if (silent) d.ghost.remove();
    g.drag = null;
  }

  /** Fly the dragged copy back to the letter's spot. */
  function back(g, t) {
    const d = g.drag; if (!d) return;
    const ghost = d.ghost;
    const r = t.el.getBoundingClientRect();
    ghost.classList.add('returning');
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    setTimeout(() => { ghost.remove(); t.el.classList.remove('lifted'); t.el.classList.remove('wig'); void t.el.offsetWidth; t.el.classList.add('wig'); }, 260);
  }

  function place(g, t, s) {
    feedbackTone(true);
    g.drag.ghost.remove();
    t.used = true;
    t.el.classList.remove('lifted');
    t.home.classList.add('empty');
    t.el.remove();
    s.filled = true;
    s.el.classList.remove('over');
    s.el.append(el('span.an-letter', s.ch));
    s.el.classList.add('ok');
    g.placed++;
    if (g.placed === g.slots.length) complete(g);
  }

  function complete(g) {
    g.done = true;
    const points = pointsFor(g.errors);
    g.root.querySelector('.an-area').classList.add('win');
    const r = g.board.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2);
    g.root.querySelector('.an-area').append(el('span.an-points' + (points === 1 ? '.full' : ''), points === 1 ? LL.ui.tr('⭐ ¡Perfecto!', '⭐ Perfect!') : points > 0 ? LL.ui.tr('⭐ ¡Muy bien!', '⭐ Great job!') : LL.ui.tr('👍 ¡Lo lograste!', '👍 You did it!')));
    // The voice says the word or phrase as a reward, then the next one comes.
    later(g, 450, () => { g.o.sayWord && g.o.sayWord(g.text); });
    later(g, 2600, () => { const o = g.o; const res = { built: g.text, errors: g.errors, points, ms: Date.now() - g.startedAt }; stop(); o.onDone && o.onDone(res); });
  }

  LL.anagramGame = { start, stop, isRunning: () => !!game, normalize, pointsFor };
})();
