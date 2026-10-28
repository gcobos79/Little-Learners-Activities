# Changelog

## V126 — October 2026 (Clasificación rápida)
- Full screen: when a student opens an activity, the app goes full screen (no browser bar or tabs),
  and returns to the normal window when the child leaves the activity (holding ↩️ or «👋 Salir»). If
  full screen is left another way (Esc, a system gesture), the next tap in the activity brings it back.
  The teacher's preview stays in the window. iPhone Safari doesn't allow full screen for web pages.
- Folder colours are more intense (Rosa, Naranja, Amarillo, Verde menta, Verde, Celeste, Azul, Lila,
  Fucsia, Gris; dark text keeps ≥ 5.4:1 contrast). Folders with an old soft colour show its intense
  version automatically.
- Results page: a 🗑️ at the end of each row deletes that child's result (after confirming), in the
  database and on the device. The child shows as pending again and can redo the activity.
- Students: 40 animals (was 24). Adding or editing a student only offers animals no other child is
  using (plus the child's own), so no two children share one; a new student starts with a free one.
- Activity instructions (header of every activity, column `quizzes.instructions`): the editor has
  «📢 Instrucciones de la actividad» with 🔊 Escuchar; in the activity a 📢 button next to the child's
  name reads them (Clasificación rápida also reads them when it starts). `save_quiz` keeps them when an
  older app saves without the field.
- Clasificación rápida: group tiles 30% bigger and more spaced (they shrink only if they don't fit; up
  to 6 groups stay on one row when possible). A wrong answer blinks red without a ✕.
- Removed the old «Sonidos iniciales» prototype (tab, screens, library card, files). Old links go to
  the activities.
- Game screen redesigned after Wordwall's Speed Sorting, but roomier: a tall belt between moving
  rails with big picture cards in coloured frames; compact, centred group tiles (white face on a
  coloured frame); ⏱️ time · count · ✓ right answers in the top bar. Rails stop while feedback shows.
- New activity type **«🧺 Clasificación rápida»** (from the Sonidos iniciales prototype, for any
  topic): cards (picture and/or word) ride a conveyor belt; the child drags each one to its group.
  Right group: green blink; wrong group: red ✕, then the right group blinks green (the card is used);
  dropped outside: back to the belt. Mouse and touch. Picking a card says its word.
- «＋ Nueva actividad» asks for the type (Quiz / Clasificación rápida).
- Editor (like the Wordwall group-sort editor): one panel per group (name, optional picture), numbered
  cards with picture + word, ↑/↓, duplicate, delete, «🖼️ Varias imágenes» (one card per picture, the
  word comes from the file name), optional instruction. Settings: belt speed (Lenta / Normal / Rápida),
  cards per group per game (all or a random subset), say the word, show the word under the picture.
- Same player features as quizzes: child's name, hold ↩️ 3 s to leave, end screen with today's board
  (score and time), results saved per month («Lo llevó a: …» in the detail), folders, duplicate, sync.
- Database: `quizzes.activity_type` ('quiz' | 'sort') and `quizzes.settings` (jsonb); `save_quiz` keeps
  them when an older app version saves. Groups are stored as quiz_questions and cards as quiz_options.
  Until the migration is applied, a new sort activity stays on the device that created it.

## V125 — October 2026 (voice type, storage)
- Ajustes asks for the teacher PIN every time it is opened (tab, browser Back/Forward). A wrong PIN
  shows «❌ PIN incorrecto» with «Aceptar» and the teacher stays where they were. Coming back from
  «Información» opened inside Ajustes doesn't ask again. Without a PIN set, Ajustes opens directly.
- Always up to date: every publish gets a build number (`tools/stamp_version.py`): scripts and styles
  load as `file.js?v=<build>` and `version.json` holds the newest build. The app checks it on start,
  when the tab comes back, and every 5 minutes, and reloads itself at a safe moment (never during an
  activity or while editing — e.g. right after a child taps «Salir»).
- End-of-quiz screen (students): the «📚 Mis actividades» button is now «👋 Salir» and goes back to
  «¿Quién eres?» so the next child can pick their animal. «🔁 Otra vez» is unchanged; the teacher's
  preview still shows «Cerrar vista previa».
- End-of-quiz board: new «Tiempo» column (m:ss) and column headings. Ranking: best score first;
  with the same score, the child who finished faster goes first. Only the same score and the same
  time share a place. The teacher's results page uses the same order.
- Voice type fix: «Hombre» now picks a man's voice in the quiz language even if its accent is not the
  preferred one (before, a US-Spanish woman's voice won over a Spain-Spanish man's voice). If the
  device has no man's voice in that language, the woman's voice is played with a deeper pitch (and a
  higher pitch for «Mujer» when only a man's voice exists). The editor shows which voice this device
  will use and plays a sample when you switch.
- Player (students): to leave an activity, hold ↩️ for 3 seconds; a ring fills up around it. A quick
  tap, Esc, or letting go early keeps the activity open (a short message explains how to leave).
  The teacher's preview still closes with a normal click.
- Mis actividades (teacher): drag an activity card onto a folder to move it there; onto «Carpeta
  anterior» to move it one level up; or onto a folder name at the top (e.g. «Mis actividades»).
  Mouse: drag the card. Touch: press and hold, then move (hold without moving still opens ⋯).
  Esc cancels. «⋯ → Mover a otra carpeta» still works.
- Player: tapping the question's picture reads the question, same as the 🔊 button (only when the
  question has sound). Works with the keyboard too.
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
