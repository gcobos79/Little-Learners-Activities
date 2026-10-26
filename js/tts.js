/* ElevenLabs voice. Audio is made once, when the teacher saves a quiz, by the
 * Supabase function "ll-tts" (which holds the secret API key). Children's
 * tablets just download and play the saved file. If anything is missing
 * (offline, not signed in, out of credits), the device voice is used instead. */
window.LL = window.LL || {};
(function () {
  const S = LL.store;
  const cache = new Map(); // storage path -> object URL
  const hasWords = (t) => /\p{L}/u.test(String(t || ''));

  function active() { return LL.cloud.signedIn() && S.voice().enabled; }

  /** Text that should be spoken for a question or an answer, or '' if none. */
  function speechText(item) {
    if (item.audioMode !== 'voice') return '';
    const t = item.readTextEnabled && String(item.readText || '').trim() ? item.readText : item.text;
    return String(t || '').trim();
  }

  /** Is there a saved ElevenLabs file for exactly this text? */
  function ready(item, gender) {
    const t = speechText(item);
    // An audio made with the other type of voice (before the teacher switched) is not used.
    return !!(t && item.tts && item.tts.path && item.tts.text === t && (!gender || (item.tts.gender || 'female') === gender));
  }

  async function url(path) {
    if (cache.has(path)) return cache.get(path);
    // Keep files between visits when the browser allows it (Cache Storage).
    let blob = null;
    try {
      if ('caches' in window) {
        const c = await caches.open('ll-tts-v1');
        const hit = await c.match('https://ll-tts.local/' + path);
        if (hit) blob = await hit.blob();
        if (!blob) { blob = await LL.cloud.download('ll-tts', path); c.put('https://ll-tts.local/' + path, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {}); }
      }
    } catch { blob = null; }
    if (!blob) blob = await LL.cloud.download('ll-tts', path);
    const u = URL.createObjectURL(blob);
    cache.set(path, u);
    return u;
  }

  /** Download ahead of time so playback is instant when a child taps. */
  function prefetch(items, gender) {
    if (!LL.cloud.signedIn()) return;
    for (const it of items) if (it && ready(it, gender)) url(it.tts.path).catch(() => {});
  }

  /** Play the ElevenLabs file; resolves false if it could not (caller uses the device voice). */
  async function play(item, gender) {
    if (!ready(item, gender) || !LL.cloud.signedIn()) return false;
    try {
      LL.ui.playAudio(await url(item.tts.path));
      return true;
    } catch (e) {
      console.warn('voice file unavailable', e);
      return false;
    }
  }

  let warned = false;
  /** Make any missing voice files for a quiz. Mutates the quiz; returns how many were made. */
  async function prepareQuiz(quiz, onProgress) {
    if (!active()) return { made: 0, skipped: 0 };
    warned = false;
    const gender = quiz.config.voiceGender === 'male' ? 'male' : 'female';
    const voiceId = (gender === 'male' ? S.voice().maleVoiceId : S.voice().voiceId) || '';
    const jobs = [];
    for (const q of quiz.config.questions || []) {
      for (const it of [q, ...(q.options || [])]) {
        const t = speechText(it);
        if (!t || !hasWords(t)) continue;
        if (it.tts && it.tts.text === t && (it.tts.voice || '') === voiceId && (it.tts.gender || 'female') === gender) continue;
        jobs.push({ it, t });
      }
    }
    let made = 0, i = 0;
    for (const job of jobs) {
      onProgress && onProgress(++i, jobs.length);
      let r;
      try { r = await LL.cloud.invoke('ll-tts', { action: 'speak', text: job.t, lang: quiz.config.lang, voiceId, gender }); }
      catch (e) { if (!warned) { warned = true; LL.ui.toast('No se pudo crear la voz ahora (' + e.message + '). Se usará la voz del dispositivo.', 'error'); } break; }
      if (r && r.path) { job.it.tts = { path: r.path, text: job.t, voice: voiceId, gender }; made++; continue; }
      if (r && r.fallback) {
        const why = r.reason === 'no_api_key' ? 'falta la clave de ElevenLabs en Supabase'
          : /elevenlabs_(402|429)/.test(r.reason) ? 'se acabaron los créditos de ElevenLabs de este mes'
          : /elevenlabs_401/.test(r.reason) ? 'la clave de ElevenLabs no es válida'
          : r.reason;
        if (!warned) { warned = true; LL.ui.toast('Voz ElevenLabs no disponible: ' + why + '. Se usará la voz del dispositivo.', 'error'); }
        break;
      }
    }
    return { made, skipped: jobs.length - made };
  }

  async function voices() { return LL.cloud.invoke('ll-tts', { action: 'voices' }); }
  async function usage() { return LL.cloud.invoke('ll-tts', { action: 'usage' }); }

  LL.tts = { active, ready, play, prefetch, prepareQuiz, voices, usage, speechText };
})();
