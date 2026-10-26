# Changelog

## V125 — October 2026 (voice type, storage)
- Editor: drag a question in the list to change the order (4 dropped on 2 becomes 2, the old 2
  becomes 3). Mouse: drag the question. Touch: drag the ⠿ handle, or press and hold the question.
  A line shows where it will land; Esc cancels. The ↑/↓ “Cambiar de lugar” buttons still work.
- Storage: when signed in, pictures and audio go to the cloud as soon as they are chosen, so the
  browser's ~5 MB storage doesn't fill up. If storage is full when saving, the app removes old quiz
  versions and the editing backup, uploads the pictures, and saves anyway. New “🧹 Liberar espacio”
  button in Ajustes.
- Each quiz has “Tipo de voz: 👩 Mujer / 👨 Hombre” (column `quizzes.voice_gender`). It is a preference:
  the device voice uses that kind when the device has it, otherwise any available voice, so there is
  always sound. If a device has no voice in the quiz language, its own voice still reads the text.
- Settings → Voz natural: choose one ElevenLabs voice for women and one for men (`ll_settings.male_voice_id`);
  without a choice, the server picks a default of each kind. Audio made with the other kind isn't reused.

## V124 — October 2026 (results)
- Quiz results are saved: one per student, per quiz, per month; a newer attempt in the same month
  replaces the older one (total and question-by-question detail). Tables `quiz_results` and
  `quiz_result_answers`, function `save_quiz_result` (an older attempt never overwrites a newer one).
- Without internet, results wait on the tablet and upload when the connection comes back.
- Teacher: 📊 button / “Ver resultados” on each quiz — ranking for the month (place, student, score,
  date, minutes), earlier months, detail per question, and who hasn't done it yet.
- The “Evaluación” mode was removed: every quiz shows the correct answer after a mistake
  (also in Sonidos iniciales).
- Editor: clear “‹ Anterior / Siguiente ›” question navigation, separate from reordering.
- Chrome's Back / Forward buttons now move inside the site (folders, quizzes, editor, tabs, results)
  instead of leaving it. Back never reopens the teacher area after “Salir” and never switches
  to another child after 🏠. Unsaved quiz changes are protected.
- Results “📅 Por día” view (default): who did the activity on a given day and who is still missing;
  ‹ › to move between days, “Ir a hoy”. “🗓️ Por mes” keeps the monthly view.
- End-of-quiz screen shows “🏆 Resultados de hoy” for the whole class: icon, name and score, best
  first; children who haven't done it yet appear below as “⏳ Pendiente”. The child who just
  finished is highlighted. Buttons “Otra vez” and “Mis actividades” unchanged.
- Children's screens use Century Gothic when the device has it (closest geometric font otherwise).
- Device voice: picks the best voice each device has (US/Mexican Spanish first, female preferred);
  if a device has no voice in that language, its default voice still reads the text.
- The ✨ Little Learners logo is a home button (teacher: top of Mis actividades; otherwise ¿Quién eres?).

## V123 — October 2026 (real database)
- Students come from the existing `students` table (active students of the signed-in teacher).
  New columns: `animal` (random icon assigned to every student), `avatar_path` (optional picture),
  `sort_order`, `updated_at`. Removing a student marks them inactive, so past results are kept.
- Quizzes are stored in real tables: `folders`, `quizzes`, `quiz_questions`, `quiz_options`
  (owner-only row-level security). A quiz is saved in one all-or-nothing step (`save_quiz`).
- Pictures and audio go to the private storage bucket `quiz-media`, resized and saved as WebP
  (JPEG where WebP isn't available), named by content so each file is stored once. Devices keep a
  cached copy for offline use.
- Quizzes and folders saved by V122 (`ll_quizzes`, `ll_folders`) are moved automatically the first
  time a signed-in device opens V123; the old tables are kept as a backup.
- Backups now include the pictures themselves, so they work on any device or account.
- Fixed: a quiz deleted on one device could come back before its deletion was uploaded.

## V122 — October 2026 (redesign)
- New look made for touch: big animal cards, folder cards, full-screen quiz player, light animations
  (switched off when a device asks for reduced motion).
- Layouts for iPhone, iPad, Chromebook tablets, laptops and widescreen monitors.
- Single-page quiz editor: settings, question list and answers on one screen; reorder, duplicate,
  delete questions; live “what's missing” checks; unsaved-changes warning and draft recovery.
- Teacher library: visible Edit and ⋯ buttons (no right-click needed), move/duplicate/delete,
  folder rename/move/delete (contents move up, nothing is lost), share a folder as a file.
- Student mode: starts at the top every time, only ready quizzes, nothing editable, 🏠 button back to “¿Quién eres?”.
- Teacher area opens with a one-second hold (and optional PIN).
- Teacher sign-in and cloud sync with Supabase; works offline and without an account.
- Natural voices with ElevenLabs, made once when saving; device voice as fallback.
- Student list editor, backup/import, delete this device / delete cloud data.
- Privacy policy, terms, accessibility statement and credits; contrast and keyboard fixes; no outside fonts.
- Same saved-data format as V121, so existing quizzes and folders carry over. Sonidos iniciales kept unchanged.

## V121 and earlier
Built with ChatGPT; kept untouched in `versions/`. See `HANDOFF.md` for its history.
