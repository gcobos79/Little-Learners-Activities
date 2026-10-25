# Supabase and ElevenLabs setup

Already done (project **WebsiteGcobos**):
- `students` (existing table): added `animal`, `avatar_path`, `sort_order`, `updated_at`; every student
  got a random animal. Existing rows and the `assessments` / `letter_results` tables were not changed.
- Quiz tables `folders`, `quizzes`, `quiz_questions`, `quiz_options` and the function `save_quiz`,
  each teacher limited to their own rows (row-level security).
- Private storage bucket `quiz-media` for pictures and audio (one folder per teacher).
- `ll_settings` keeps the PIN, voice and Sonidos iniciales settings. `ll_quizzes` / `ll_folders`
  (used by V122) are kept as a backup after their content is moved to the new tables.
- Private storage bucket `ll-tts` for voice files, one folder per teacher.
- Edge function `ll-tts`, which calls ElevenLabs with the secret key and saves the audio.
- The site's `js/config.js` points to the project with its **publishable** key (safe to be public).

Steps that need you, in the Supabase dashboard (https://supabase.com/dashboard/project/abbtbaupzdzdvtkunmtf):

1. **Invite-only sign-up:** Authentication → Sign In / Providers → turn **off** “Allow new users to sign up”.
2. **Links in emails:** Authentication → URL Configuration →
   - Site URL: `https://gcobos79.github.io/Little-Learners-Activities/`
   - Redirect URLs: add the same address.
3. **Invite a teacher:** Authentication → Users → Add user → **Send invitation**. They get an email,
   open the link, and create a password in the app.
4. **ElevenLabs key:** sign in at elevenlabs.io, open **API Keys** in your account menu, and create a key.
   If it asks for permissions, allow Text to Speech, plus read access to Voices and User (used to list
   voices and show how many credits are left). Then in Supabase: Edge Functions → Secrets → add
   `ELEVENLABS_API_KEY` with that value. Never put this key in the website code or paste it in a chat.

Optional secrets: `ELEVENLABS_VOICE_ID` (default voice) and `ELEVENLABS_MODEL_ID`
(default `eleven_multilingual_v2`, which speaks Spanish and English; `eleven_flash_v2_5` uses about half the credits).
