// Little Learners Activities — ElevenLabs voice for quizzes.
//
// The ElevenLabs API key never reaches the browser: it lives in the Supabase
// secret ELEVENLABS_API_KEY and is only used here. Audio is generated once per
// (voice, model, text) and stored in the private "ll-tts" bucket under the
// teacher's own folder, so children replaying a question costs no credits.
//
// POST body: { action: "speak", text, lang?, voiceId? } -> { path } | { fallback: true, reason }
//            { action: "voices" }                        -> { voices: [{ id, name, accent, gender }] }
//            { action: "usage" }                         -> { used, limit, resetsAt }
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ELEVEN = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "EXAVITQu4vr4xnSDxMaL"; // "Sarah", a premade voice
const MODEL = Deno.env.get("ELEVENLABS_MODEL_ID") ?? "eleven_multilingual_v2"; // speaks Spanish and English
const MAX_CHARS = 400;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Who is calling? Only signed-in teachers may use the voice.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);
  const uid = userData.user.id;

  const key = Deno.env.get("ELEVENLABS_API_KEY");
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body.action ?? "speak");

  if (!key) return json({ fallback: true, reason: "no_api_key" });

  if (action === "usage") {
    const r = await fetch(`${ELEVEN}/user/subscription`, { headers: { "xi-api-key": key } });
    if (!r.ok) return json({ fallback: true, reason: "elevenlabs_" + r.status });
    const s = await r.json();
    return json({ used: s.character_count, limit: s.character_limit, resetsAt: s.next_character_count_reset_unix, tier: s.tier });
  }

  if (action === "voices") {
    const r = await fetch(`${ELEVEN}/voices`, { headers: { "xi-api-key": key } });
    if (!r.ok) return json({ fallback: true, reason: "elevenlabs_" + r.status });
    const v = await r.json();
    const voices = (v.voices ?? []).map((x: Record<string, any>) => ({
      id: x.voice_id, name: x.name, category: x.category,
      accent: x.labels?.accent ?? "", gender: x.labels?.gender ?? "", age: x.labels?.age ?? "",
    }));
    return json({ voices, defaultVoice: DEFAULT_VOICE });
  }

  if (action !== "speak") return json({ error: "unknown_action" }, 400);

  const text = String(body.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return json({ error: "empty_text" }, 400);
  const voiceId = /^[A-Za-z0-9]{10,40}$/.test(String(body.voiceId ?? "")) ? String(body.voiceId) : DEFAULT_VOICE;
  const hash = await sha256(`${MODEL}|${voiceId}|${text}`);
  const path = `${uid}/${hash}.mp3`;

  // Already made? Reuse it.
  const { data: existing } = await admin.storage.from("ll-tts").list(uid, { search: `${hash}.mp3`, limit: 1 });
  if (existing && existing.some((f) => f.name === `${hash}.mp3`)) return json({ path, cached: true });

  const r = await fetch(`${ELEVEN}/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      // Slightly slower, steady delivery for young children.
      voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.9 },
    }),
  });
  if (!r.ok) {
    let detail = "";
    try { detail = JSON.stringify(await r.json()).slice(0, 300); } catch { /* ignore */ }
    console.warn("ElevenLabs error", r.status, detail);
    // 401 bad key, 402/429 out of credits or rate limited: the app falls back to the device voice.
    return json({ fallback: true, reason: "elevenlabs_" + r.status });
  }
  const audio = new Uint8Array(await r.arrayBuffer());
  const { error: upErr } = await admin.storage.from("ll-tts").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (upErr) return json({ fallback: true, reason: "storage_" + upErr.message });
  return json({ path, cached: false, chars: text.length });
});
