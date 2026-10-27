/* «Clasificación rápida»: cards ride a conveyor belt; the child drags each one to its group.
 * Same rules as the old Sonidos iniciales prototype (removed):
 *  - Right group: the box blinks green (½ s) and the card counts.
 *  - Wrong group: the box blinks red (1 s, no ✕), then the right group blinks green (2 s).
 *    The card is used up either way (no point when wrong).
 *  - Dropped outside the boxes: the card goes back to its place on the belt.
 *  - Cards nobody picks keep going round. While feedback shows, the belt stops.
 * Works with mouse and touch (pointer events). */
window.LL = window.LL || {};
(function () {
  const { el, shuffle, feedbackTone, confetti } = LL.ui;
  const S = LL.store;
  const SPEED = { slow: 0.24, normal: 0.38, fast: 0.6 }; // card widths per second (prototype: 28/45/70 px/s for 120 px cards)
  // Group tiles: warm, clearly different frames. Card frames: bright colours that cycle.
  const COLORS = ['#FFD43B', '#74C0FC', '#8CE99A', '#FFA8A8', '#B197FC', '#FFC078', '#63E6BE', '#F783AC'];
  const FRAMES = ['#2F5BD3', '#C04CD9', '#1F8A4C', '#F06A0F', '#13A3A3', '#D6336C', '#7048E8', '#E8A500'];
  const clock = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  let game = null;

  /**
   * host: element to fill. entry: the activity. api: {
   *   say(item, text)            read a card / group aloud
   *   onProgress(done, total, ok)
   *   onFinish({ answers, total, ok })
   * }
   */
  function start(host, entry, api) {
    stop();
    const c = entry.config || {};
    const set = S.sortSettings(c);
    const groups = (c.questions || []).filter((g) => (g.options || []).some(S.itemFilled));
    // Cards in play: each group's filled cards, maybe a random subset, all mixed.
    let cards = [];
    groups.forEach((g, gi) => {
      let opts = g.options.filter(S.itemFilled).map((o) => ({ ...o, groupId: g.id, groupIndex: gi, position: (c.questions || []).indexOf(g) * 100 + g.options.indexOf(o) }));
      if (set.perGroup > 0 && opts.length > set.perGroup) opts = shuffle(opts).slice(0, set.perGroup);
      cards.push(...opts);
    });
    cards = shuffle(cards);

    const g = game = { host, api, set, groups, cards, x: [], raf: 0, last: 0, locked: false, drag: null, done: 0, ok: 0, answers: [], startedAt: Date.now(), timers: [] };

    const belt = el('div.sort-belt', { 'aria-label': 'Banda con tarjetas' });
    const targets = el('div.sort-targets');
    g.belt = belt; g.targets = targets;
    g.stTime = el('span.st-time', '⏱️ 0:00');
    g.stCount = el('span.st-count', '0 de ' + cards.length);
    g.stOk = el('span.st-ok', '✓ 0');

    groups.forEach((grp, i) => {
      const box = el('button.sort-target', { type: 'button', dataset: { group: grp.id }, 'aria-label': 'Grupo ' + (grp.text || i + 1) });
      box.style.setProperty('--group', COLORS[i % COLORS.length]);
      const face = el('span.sort-target-face');
      const label = String(grp.text || '').trim();
      if (grp.image) face.append(el('img', { src: grp.image, alt: '' }));
      if (label) face.append(el('span.sort-target-label' + (grp.image ? '.small' : label.length > 3 ? '.long' : ''), label));
      box.append(face);
      // Tapping a group reads its name.
      box.addEventListener('click', () => { if (!g.drag && String(grp.text || '').trim()) api.say(grp, grp.text); });
      targets.append(box);
    });

    cards.forEach((card, i) => {
      const tile = el('div.sort-card' + (card.image ? '' : '.text-only'), { dataset: { id: card.id } });
      tile.style.setProperty('--frame', FRAMES[i % FRAMES.length]);
      if (card.image) tile.append(el('img', { src: card.image, alt: card.text || '', draggable: 'false' }));
      if (!card.image || (set.showText && String(card.text || '').trim())) tile.append(el('span.sort-card-word', card.text));
      tile.addEventListener('pointerdown', (e) => pickup(e, card));
      card.el = tile;
      belt.append(tile);
    });

    host.replaceChildren(el('div.sort-game',
      belt, targets));
    g.clock = setInterval(() => { if (game === g) g.stTime.textContent = '⏱️ ' + clock(Date.now() - g.startedAt); }, 500);

    // Size and place the cards once the belt has its size.
    requestAnimationFrame(() => {
      if (game !== g) return;
      layout();
      cards.forEach((card, i) => { card.x = 20 + i * g.gap; place(card); });
      g.last = 0;
      g.raf = requestAnimationFrame(frame);
    });
    g.onResize = () => layout();
    window.addEventListener('resize', g.onResize);
    api.onProgress && api.onProgress(0, cards.length, 0);
    return { total: cards.length, status: el('div.sort-status', g.stTime, g.stCount, g.stOk) };
  }

  function layout() {
    const g = game; if (!g) return;
    const h = g.belt.clientHeight;
    g.size = Math.max(70, Math.round(h - 40)); // room for the rails above and below
    g.gap = Math.round(g.size * 1.32);
    g.belt.style.setProperty('--card', g.size + 'px');
    fitTargets();
  }
  /** Big group tiles, but never off the screen: shrink a little only when they don't fit. */
  function fitTargets() {
    const t = game && game.targets; if (!t) return;
    let fit = 1;
    t.style.setProperty('--fit', '1');
    // Up to 6 groups: keep them on one row when that only needs them a little smaller (≥ 80%).
    const tiles = [...t.querySelectorAll('.sort-target')];
    if (tiles.length > 1 && tiles.length <= 6) {
      const cs = getComputedStyle(t);
      const gap = parseFloat(cs.columnGap) || 0, pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const w = tiles[0].getBoundingClientRect().width;
      const rowFit = (t.clientWidth - pad - gap * (tiles.length - 1)) / (w * tiles.length);
      if (rowFit < 1 && rowFit >= 0.8) { fit = Math.floor(rowFit * 100) / 100; t.style.setProperty('--fit', String(fit)); }
    }
    while (fit > 0.55 && t.scrollHeight > t.clientHeight + 2) { fit -= 0.05; t.style.setProperty('--fit', fit.toFixed(2)); }
  }
  function place(card) { card.el.style.transform = 'translateX(' + card.x + 'px)'; }

  function frame(ts) {
    const g = game; if (!g) return;
    const dt = Math.min((ts - (g.last || ts)) / 1000, 0.05);
    g.last = ts;
    if (!g.locked && !document.hidden) {
      const width = g.belt.clientWidth;
      const v = (SPEED[g.set.speed] || SPEED.normal) * g.size;
      const alive = g.cards.filter((x) => !x.done);
      for (const card of alive) {
        if (g.drag && g.drag.card === card) { card.x += v * dt; continue; } // keeps its place while held
        card.x += v * dt;
        if (card.x > width + 20) {
          // Back in at the left, behind the last card.
          const left = Math.min(...alive.filter((a) => a !== card).map((a) => a.x), width);
          card.x = Math.min(-g.size - 10, left - g.gap);
        }
        place(card);
      }
    }
    g.raf = requestAnimationFrame(frame);
  }

  function pickup(e, card) {
    const g = game;
    if (!g || g.locked || card.done || g.drag || (e.button != null && e.button > 0)) return;
    e.preventDefault();
    if (g.set.speak !== false && String(card.text || '').trim()) g.api.say(card, card.text);
    const r = card.el.getBoundingClientRect();
    const ghost = card.el.cloneNode(true);
    ghost.classList.add('sort-ghost');
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', transform: 'none' });
    document.body.append(ghost);
    card.el.classList.add('picked');
    g.drag = { card, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }
  function targetAt(x, y) {
    return [...game.targets.querySelectorAll('.sort-target')].find((t) => { const r = t.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || null;
  }
  function onMove(e) {
    const g = game; if (!g || !g.drag || e.pointerId !== g.drag.id) return;
    e.preventDefault();
    const d = g.drag;
    d.ghost.style.left = (e.clientX - d.dx) + 'px';
    d.ghost.style.top = (e.clientY - d.dy) + 'px';
    const t = targetAt(e.clientX, e.clientY);
    g.targets.querySelectorAll('.sort-target').forEach((x) => x.classList.toggle('hover', x === t));
  }
  function endDrag() {
    const g = game; const d = g && g.drag; if (!d) return null;
    g.drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    d.ghost.remove();
    d.card.el.classList.remove('picked');
    g.targets.querySelectorAll('.sort-target').forEach((x) => x.classList.remove('hover'));
    return d;
  }
  function onCancel(e) { if (game && game.drag && e.pointerId === game.drag.id) endDrag(); }
  function onUp(e) {
    const g = game; if (!g || !g.drag || e.pointerId !== g.drag.id) return;
    const d = endDrag();
    const box = targetAt(e.clientX, e.clientY);
    if (!box) return; // back to its place on the belt
    drop(d.card, box);
  }

  function drop(card, box) {
    const g = game;
    const grp = g.groups.find((x) => x.id === box.dataset.group);
    const good = box.dataset.group === card.groupId;
    card.done = true;
    card.el.remove();
    g.done++;
    if (good) g.ok++;
    g.answers.push({
      position: card.position, question_id: card.id,
      prompt: String(card.text || '').trim() || '🖼️ (imagen)',
      chosen_option_ids: [], chosen_text: String(grp && grp.text || '').slice(0, 200) || '🖼️',
      correct: good, response_ms: Date.now() - g.startedAt,
    });
    g.api.onProgress && g.api.onProgress(g.done, g.cards.length, g.ok);
    g.stCount.textContent = g.done + ' de ' + g.cards.length;
    g.stOk.textContent = '✓ ' + g.ok;
    const finished = g.cards.every((x) => x.done);
    g.locked = true;
    const later = (ms, fn) => g.timers.push(setTimeout(() => { if (game === g) fn(); }, ms));
    const blink = (b, kind) => { b.classList.remove('good', 'bad'); void b.offsetWidth; b.classList.add(kind); };
    g.belt.classList.add('paused');
    const end = () => { g.locked = false; g.belt.classList.remove('paused'); if (finished) finish(); };
    if (good) {
      feedbackTone(true);
      blink(box, 'good');
      const r = box.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2, 14);
      later(600, () => { box.classList.remove('good'); end(); });
      return;
    }
    feedbackTone(false);
    blink(box, 'bad');
    later(1000, () => {
      box.classList.remove('bad');
      const right = g.targets.querySelector('.sort-target[data-group="' + card.groupId + '"]');
      if (!right) { end(); return; }
      blink(right, 'good');
      later(2000, () => { right.classList.remove('good'); end(); });
    });
  }

  function finish() {
    const g = game; if (!g) return;
    const result = { answers: g.answers.slice().sort((a, b) => a.position - b.position), total: g.cards.length, ok: g.ok };
    const api = g.api;
    stop();
    api.onFinish && api.onFinish(result);
  }

  function stop() {
    const g = game; if (!g) return;
    if (g.drag) endDrag();
    cancelAnimationFrame(g.raf);
    clearInterval(g.clock);
    g.timers.forEach(clearTimeout);
    window.removeEventListener('resize', g.onResize);
    game = null;
  }

  LL.sortGame = { start, stop, isRunning: () => !!game };
})();
