/* Shared UI helpers: element builder, dialogs, toasts, media and sound. */
window.LL = window.LL || {};
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** el('button.btn.primary', {onclick, type:'button'}, 'Texto', childNode) */
  function el(spec, props, ...children) {
    const [head, ...classes] = spec.split('.');
    let id = null;
    if (classes.length && classes[classes.length - 1].includes('#')) { const [c, i] = classes.pop().split('#'); classes.push(c); id = i; }
    const [tag, hid] = head.split('#');
    const node = document.createElement(tag || 'div');
    if (hid || id) node.id = hid || id;
    if (classes.length) node.className = classes.join(' ');
    if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { children.unshift(props); props = null; }
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'src' && LL.media && LL.media.isRef(v)) LL.media.attach(node, v); // stored file: load it
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
  }

  /* ---------- Toasts ---------- */
  function toast(message, kind = 'info') {
    let host = $('#toasts');
    if (!host) { host = el('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
    while (host.children.length >= 2) host.firstChild.remove(); // never pile up messages
    const t = el('div.toast.' + kind, { role: kind === 'error' ? 'alert' : 'status' }, message);
    host.append(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  /* ---------- Dialogs ---------- */
  function dialog({ title, body, actions, wide }) {
    return new Promise((resolve) => {
      const back = el('div.modal-back');
      const box = el('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Diálogo' });
      if (title) box.append(el('h2', title));
      if (body) box.append(body instanceof Node ? body : el('p.muted', body));
      const row = el('div.modal-actions');
      const opener = document.activeElement;
      const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); if (opener && opener.isConnected) opener.focus(); resolve(v); };
      for (const a of actions) row.append(el('button.btn' + (a.kind ? '.' + a.kind : ''), { type: 'button', onclick: () => { const v = a.value instanceof Function ? a.value() : a.value; if (v !== undefined) close(v); } }, a.label));
      box.append(row);
      back.append(box);
      back.addEventListener('click', (e) => { if (e.target === back) close(null); });
      // Escape closes; Tab stays inside the dialog (keyboard users don't get lost behind it).
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
        if (e.key !== 'Tab') return;
        const f = [...box.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      };
      document.addEventListener('keydown', onKey, true);
      document.body.append(back);
      setTimeout(() => { const f = box.querySelector('input,select,textarea') || row.lastChild; f && f.focus(); }, 30);
    });
  }

  const confirmDialog = (title, message, okLabel = 'Aceptar', danger = false) =>
    dialog({ title, body: message, actions: [{ label: 'Cancelar', kind: 'ghost', value: false }, { label: okLabel, kind: danger ? 'danger' : 'primary', value: true }] });

  /* ---------- Media ---------- */
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      r.readAsDataURL(file);
    });
  }

  /** Shrinks an image so it fits in `max` px and stores it as JPEG (saves browser space). */
  async function imageFileToDataURL(file, max = 1200, quality = 0.82) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
    if (file.size > 15 * 1024 * 1024) throw new Error('La imagen es muy grande (más de 15 MB).');
    const src = await readFileAsDataURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo abrir esa imagen.')); i.src = src; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // transparent PNGs get a white background
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // WebP is ~25-35% smaller than JPEG at the same quality. Browsers that can't
    // make WebP (older Safari) return PNG instead, so JPEG is used there.
    const webp = c.toDataURL('image/webp', quality);
    const jpeg = c.toDataURL('image/jpeg', quality);
    return webp.startsWith('data:image/webp') && webp.length <= jpeg.length ? webp : jpeg;
  }

  async function audioFileToDataURL(file) {
    if (!file || !file.type.startsWith('audio/')) throw new Error('Elige un archivo de audio.');
    if (file.size > 5 * 1024 * 1024) throw new Error('El audio debe pesar 5 MB o menos.');
    return readFileAsDataURL(file);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept, style: { display: 'none' } });
      input.addEventListener('change', () => { resolve(input.files && input.files[0] || null); input.remove(); });
      document.body.append(input);
      input.click();
    });
  }

  function download(filename, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ---------- Sound ---------- */
  function speak(text, lang) {
    if (!text || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = lang === 'en' ? 'en-US' : 'es-ES';
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { console.warn('speech failed', e); }
  }

  let currentAudio = null;
  let playToken = 0;
  function playAudio(src) {
    stopSound();
    if (!src) return;
    const token = ++playToken;
    const start = (u) => { if (token !== playToken) return; currentAudio = new Audio(u); currentAudio.play().catch(() => {}); };
    if (LL.media && LL.media.isRef(src)) LL.media.resolve(src).then(start).catch(() => {});
    else start(src);
  }
  function stopSound() {
    playToken++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  }

  // One shared AudioContext (creating one per answer can fail on low-end tablets).
  let audioCtx = null;
  /** Correct = bright "magic wand" notes (V112). Wrong = game-show buzzer, ~1.5 s (V120). */
  function feedbackTone(isCorrect) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      const notes = isCorrect
        ? [{ f: 783.99, t: 0, d: 0.12, level: 0.1125, type: 'sine' }, { f: 987.77, t: 0.075, d: 0.14, level: 0.1125, type: 'sine' }, { f: 1174.66, t: 0.15, d: 0.16, level: 0.1125, type: 'sine' }, { f: 1567.98, t: 0.22, d: 0.2, level: 0.09, type: 'sine' }, { f: 2349.32, t: 0.19, d: 0.12, level: 0.045, type: 'sine' }]
        : [{ f: 185, t: 0, d: 1.46, level: 0.16, type: 'square' }, { f: 155.56, t: 0.025, d: 1.42, level: 0.12, type: 'sawtooth' }];
      for (const n of notes) {
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = n.type;
        osc.frequency.setValueAtTime(n.f, now + n.t);
        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.exponentialRampToValueAtTime(n.level, now + n.t + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now + n.t); osc.stop(now + n.t + n.d + 0.02);
      }
    } catch { /* sound is optional */ }
  }

  function shuffle(a) {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  /* iPhone/iPad only allow sound after a tap. On the first tap anywhere we
   * "unlock" speech and Web Audio so later automatic reading works. */
  function unlockSound() {
    document.removeEventListener('pointerdown', unlockSound, true);
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtx) audioCtx = new Ctx();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch { /* ignore */ }
    try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch { /* ignore */ }
  }
  document.addEventListener('pointerdown', unlockSound, true);

  /** Small confetti burst from a point (or the screen center). DOM-only, ~1 s. */
  function confetti(x, y, count = 26) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#FFC94D', '#2F5BD3', '#22C55E', '#F472B6', '#FB923C', '#38BDF8'];
    const box = el('div.confetti', { 'aria-hidden': 'true' });
    const cx = x != null ? x : innerWidth / 2, cy = y != null ? y : innerHeight / 2;
    for (let i = 0; i < count; i++) {
      const star = i % 6 === 0;
      const p = el('i' + (star ? '.star' : ''), star ? '⭐' : null);
      const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 220;
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 120 + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--dur', (0.9 + Math.random() * 0.6) + 's');
      box.append(p);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 1700);
  }

  /** Give the children of a container a staggered "pop in". */
  function stagger(container) {
    container.classList.remove('animate-in');
    [...container.children].forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, 14))));
    void container.offsetWidth;
    container.classList.add('animate-in');
  }

  LL.ui = { $, $$, el, toast, dialog, confirmDialog, readFileAsDataURL, imageFileToDataURL, audioFileToDataURL, pickFile, download, formatBytes, speak, playAudio, stopSound, feedbackTone, shuffle, confetti, stagger };
})();
