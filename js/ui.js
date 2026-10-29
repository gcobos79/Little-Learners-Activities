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
  /* Device voice (used when there is no ElevenLabs audio). Every device has different
   * voices, so we pick the best one it has: Latin-American / US Spanish first, female
   * voices preferred; if the device has no voice in that language, its default voice
   * still reads the text, so there is always sound. */
  // Voice names that tell us the kind of voice (Windows, Edge, Chrome, Apple, Android).
  const FEMALE = /sabina|paulina|m[oó]nica|helena|laura|elvira|dalia|paloma|lupe|pe[nñ]elope|marisol|camila|valentina|francisca|isabela|ang[eé]lica|elena|luc[ií]a|ximena|larissa|renata|beatriz|carmen|marta|sof[ií]a|catalina|abril|estrella|irene|triana|vera|flo\b|sandy|shelley|grandma|zira|samantha|jenny|aria|susan|karen|hazel|female|mujer|femenin|google espa|google us english|google uk english female/i;
  const MALE = /david|mark|pablo|ra[uú]l|jorge|juan|diego|[aá]lvaro|alonso|gerardo|liberto|dar[ií]o|enrique|emilio|jaime|carlos|andr[eé]s|tom[aá]s|lorenzo|federico|mateo|sergio|eddy|reed|rocko|grandpa|guy\b|daniel|fred|alex\b|male\b|hombre|masculin|google uk english male/i;
  let voiceList = [];
  function loadVoices() { try { voiceList = speechSynthesis.getVoices() || []; } catch { voiceList = []; } }
  if ('speechSynthesis' in window) { loadVoices(); try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch { speechSynthesis.onvoiceschanged = loadVoices; } }

  const kindOf = (v) => (FEMALE.test(v.name) ? 'female' : MALE.test(v.name) ? 'male' : '');

  /** Which device voice to use, and how.
   *  1) A voice in the quiz language of the requested kind (Spanish: US/MX first).
   *  2) No voice of that kind in the language: use a voice in the language and change its pitch
   *     (lower for "Hombre", higher for "Mujer") so it sounds closer to what was chosen.
   *  3) No voice in the language at all: any voice, so there is always sound.
   *  Returns { voice, pitch, exact } where exact = the voice really is the requested kind. */
  function voicePlan(lang, gender = 'female') {
    if (!voiceList.length) loadVoices();
    const want = lang === 'en' ? ['en-us', 'en-gb', 'en'] : ['es-us', 'es-mx', 'es-419', 'es-es', 'es'];
    const langRank = (v) => {
      const l = String(v.lang || '').toLowerCase().replace('_', '-');
      return want.findIndex((w) => l === w || l.startsWith(w + '-') || (w.length === 2 && l.startsWith(w)));
    };
    const score = (v) => {
      const i = langRank(v);
      if (i < 0) return -1;
      let sc = 100 - i * 10;
      const k = kindOf(v);
      if (k === gender) sc += 1000;          // the kind of voice matters more than the accent
      else if (k && k !== gender) sc -= 50;
      if (v.localService) sc += 2;           // works without internet
      return sc;
    };
    let best = null, bestScore = -1;
    for (const v of voiceList) { const sc = score(v); if (sc > bestScore) { best = v; bestScore = sc; } }
    if (best) {
      const exact = kindOf(best) === gender;
      const pitch = exact ? 1 : gender === 'male' ? 0.6 : (kindOf(best) === 'male' ? 1.35 : 1);
      return { voice: best, pitch, exact };
    }
    const fallback = voiceList.find((v) => kindOf(v) === gender) || voiceList.find((v) => v.default) || voiceList[0] || null;
    return { voice: fallback, pitch: 1, exact: !!fallback && kindOf(fallback) === gender };
  }
  function bestVoice(lang, gender = 'female') { return voicePlan(lang, gender).voice; }

  /** gender is only a preference: any voice is better than silence. */
  /** onDone(finished): optional; called once when the reading ends (true) or is cut off / fails (false).
   *  Some browsers never send «end», so a generous timer (based on the text length) stands in for it. */
  function speak(text, lang, gender, onDone) {
    let called = false, guard = null;
    const done = (ok) => { if (called) return; called = true; clearTimeout(guard); if (onDone) onDone(ok); };
    if (!text || !('speechSynthesis' in window)) { if (onDone) setTimeout(() => done(true), 0); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      const plan = voicePlan(lang, gender === 'male' ? 'male' : 'female');
      if (plan.voice) { u.voice = plan.voice; u.lang = plan.voice.lang; } else u.lang = lang === 'en' ? 'en-US' : 'es-US';
      u.pitch = plan.pitch;
      u.rate = 0.9;
      if (onDone) {
        u.onend = () => done(true);
        u.onerror = (e) => done(!(e && (e.error === 'interrupted' || e.error === 'canceled')));
        const wait = 3000 + String(text).length * 110;
        const check = () => { if (speechSynthesis.speaking) guard = setTimeout(check, 1000); else done(true); };
        guard = setTimeout(check, wait);
      }
      speechSynthesis.speak(u);
    } catch (e) { console.warn('speech failed', e); done(false); }
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
    if (typeof stopCelebrate === 'function') stopCelebrate();
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

  /* «¡Lo lograste!» jingle (V127): an original, cheerful ~4-second tune in C major for the end of
   * every activity. Made with Web Audio (no file to download): a bright lead, bass, soft chords,
   * light drums and a sparkle on the last chord. `ctx` lets the tests render it offline. */
  let jingleOut = null;
  function celebrateTune(ctx) {
    const live = !ctx;
    try {
      if (live) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return 0;
        if (!audioCtx || audioCtx.state === 'closed') audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        ctx = audioCtx;
        stopCelebrate();
      }
      const t0 = ctx.currentTime + 0.05;
      const out = ctx.createGain();
      out.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      out.connect(comp); comp.connect(ctx.destination);
      if (live) jingleOut = out;
      const N = { G2: 98, A2: 110, C3: 130.81, E3: 164.81, F2: 87.31, G3: 196, C4: 261.63, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093 };
      const tone = (f, t, d, level, type, opt = {}) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0 + t);
        if (opt.vibrato) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t0 + t + 0.15); l.stop(t0 + t + d + 0.05); }
        let node = o;
        if (opt.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opt.lp; o.connect(fl); node = fl; }
        const a = opt.attack || 0.012;
        g.gain.setValueAtTime(0.0001, t0 + t);
        g.gain.exponentialRampToValueAtTime(level, t0 + t + a);
        g.gain.exponentialRampToValueAtTime(level * (opt.sustain || 0.55), t0 + t + Math.min(d * 0.5, 0.12));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + d);
        node.connect(g); g.connect(out);
        o.start(t0 + t); o.stop(t0 + t + d + 0.05);
      };
      // Lead melody: a quick run up, a bouncy hook, a climb and a long happy ending.
      const S = 0.15; // one eighth note (200 beats per minute)
      const lead = [
        ['G4', 0, 1], ['C5', 1, 1], ['E5', 2, 1], ['G5', 3, 1],
        ['E5', 4, 1], ['G5', 5, 2],
        ['A5', 7, 1], ['G5', 8, 1], ['E5', 9, 1], ['G5', 10, 3],
        ['F5', 13, 1], ['A5', 14, 1], ['C6', 15, 1], ['D6', 16, 2],
        ['B5', 18, 1], ['C6', 19, 7.5],
      ];
      for (const [n, at, len] of lead) {
        const d = len * S * 0.95, long = len > 3;
        tone(N[n], at * S, d, 0.13, 'square', { lp: 3200, vibrato: long, sustain: long ? 0.7 : 0.5 });
        tone(N[n] * 2, at * S, d, 0.035, 'triangle', { sustain: 0.4 });
      }
      // Bass.
      [['C3', 0, 3], ['E3', 4, 3], ['A2', 7, 3], ['G2', 10, 3], ['F2', 13, 3], ['G2', 16, 3], ['C3', 19, 7]]
        .forEach(([n, at, len]) => tone(N[n], at * S, len * S * 0.9, 0.2, 'triangle', { sustain: 0.6 }));
      // Soft off-beat chords.
      const chords = [[0, ['C4', 'E4', 'G4']], [2, ['C4', 'E4', 'G4']], [5, ['C4', 'E4', 'G4']], [8, ['C4', 'E4', 'A4']], [11, ['B4', 'E4', 'G4']], [14, ['C4', 'F4', 'A4']], [17, ['B4', 'D5', 'G4']]];
      for (const [at, ns] of chords) ns.forEach((n) => tone(N[n], at * S + 0.01, S * 0.8, 0.03, 'triangle'));
      // Final chord, strummed, and a sparkle on top.
      ['C4', 'E4', 'G4', 'C5', 'E5'].forEach((n, i) => tone(N[n], 19 * S + i * 0.025, 1.1, 0.05, 'triangle', { sustain: 0.8 }));
      ['C6', 'E6', 'G6', 'C7', 'G6', 'C7'].forEach((n, i) => tone(N[n], 19 * S + 0.08 + i * 0.07, 0.35, 0.03, 'sine'));
      // Light drums: kick on the beat, a clap between.
      const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const kick = (t) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t0 + t); o.frequency.exponentialRampToValueAtTime(45, t0 + t + 0.12); g.gain.setValueAtTime(0.35, t0 + t); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.16); o.connect(g); g.connect(out); o.start(t0 + t); o.stop(t0 + t + 0.2); };
      const clap = (t) => { const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); b.buffer = noise; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.12, t0 + t); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.12); b.connect(f); f.connect(g); g.connect(out); b.start(t0 + t); b.stop(t0 + t + 0.15); };
      [0, 4, 7, 10, 13, 16, 19].forEach((at) => kick(at * S));
      [2, 6, 9, 12, 15, 18].forEach((at) => clap(at * S));
      clap(19 * S); clap(19 * S + 0.05);
      // Fade out so it ends cleanly at ~4 s.
      out.gain.setValueAtTime(0.9, t0 + 3.65);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + 4);
      return 4;
    } catch { return 0; /* sound is optional */ }
  }
  function stopCelebrate() {
    if (!jingleOut || !audioCtx) return;
    try { jingleOut.gain.cancelScheduledValues(audioCtx.currentTime); jingleOut.gain.setValueAtTime(0.0001, audioCtx.currentTime); jingleOut.disconnect(); } catch { /* ignore */ }
    jingleOut = null;
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

  /* Guest language (V127): guests can switch the interface to English. Teachers and students keep
   * Spanish. tr(es, en) gives the English text only to a guest who chose English (this tab). */
  const GUEST_LANG = 'll-guest-lang';
  function guestLang() {
    try { const v = sessionStorage.getItem(GUEST_LANG); if (v === 'en' || v === 'es') return v; } catch { /* ignore */ }
    return 'es'; // English only when the guest chooses it (button on the sign-in page or «🌐 English»)
  }
  function setGuestLang(l) { try { sessionStorage.setItem(GUEST_LANG, l === 'en' ? 'en' : 'es'); } catch { /* ignore */ } }
  const tr = (es, en) => (window.LL && LL.app && LL.app.state.mode === 'guest' && guestLang() === 'en' ? en : es);

  LL.ui = { tr, guestLang, setGuestLang, $, $$, el, toast, dialog, confirmDialog, readFileAsDataURL, imageFileToDataURL, audioFileToDataURL, pickFile, download, formatBytes, speak, bestVoice, voicePlan, playAudio, stopSound, feedbackTone, celebrateTune, stopCelebrate, shuffle, confetti, stagger };
})();
