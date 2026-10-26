# Changelog

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
