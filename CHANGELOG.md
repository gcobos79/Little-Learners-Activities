# Changelog

## V126 — October 2026 (Clasificación rápida)
- Información shows «Versión instalada» (the build, in Chicago time) to check a tablet is up to date.
- An activity type this app version doesn't know (made with a newer app) is now kept hidden instead of
  showing as a broken quiz (an old tablet showed only the text of «7.1 Teclado»), and is never uploaded.
- Sign-in page: «Usar sin cuenta, solo en este dispositivo» removed (it confused visitors, who should
  use «Entrar como invitado»). It remains under Información → Acerca de → «Avanzado» when nobody is
  signed in.
- Folder cards count the activities inside the folder AND all its subfolders («2 carpetas · 15 actividades
  en total»); students and guests count only what they can see, the teacher counts everything.
- Guests can use the app in English: «Enter as guest (English)» on the sign-in page and a «🌐 English /
  🌐 Español» switch in the guest bar. Guide, folders, card details, end screen, Pantalla de Tablet and
  sorting texts follow it (`LL.ui.tr`). Spanish unless the guest chooses English (this tab only).
- Ajustes opens without the PIN. Actions that change, create, delete or take data out (Cerrar sesión,
  Crear/Cambiar/Quitar PIN, voz natural on/off and voices, Preparar voces, Descargar respaldo, Importar,
  Liberar espacio, Borrar este dispositivo, Borrar mis datos de la nube) ask for the PIN once per visit;
  leaving Ajustes locks them again. Looking around, «Sincronizar ahora», «Ver como invitado» and
  «Probar» voices need no PIN.
- Administrator account (gcobos79@gmail.com, table `ll_admins`, function `is_ll_admin()`): only the
  administrator can share activities with guests (save_quiz ignores the flag for others; the guest
  catalog and pictures only include the administrator's activities) and use the ElevenLabs voice (the
  ll-tts edge function answers «not_admin» to other accounts, which then use the device voice). Other
  teachers don't see those options. Each teacher's own data was already private.
- Guest guide: guests see a friendly note above the cards: activities are inside folders, a small map
  (📚 Actividades › 📁 Carpeta › 📂 Más carpetas › 🎮 Actividad), a bouncing 👆 on the folder to open,
  and, inside a folder, how to go back (⬅️, «Carpeta anterior», the names at the top). «Entendido ✓»
  folds it to one line («¿Cómo funciona?» opens it again).
- Guest mode: on the sign-in page, «Guest / Invitado» → «Entrar como invitado». Guests see only the
  activities marked «👋 Compartir con invitados» (new switch in each activity's Ajustes; it also has to
  be visible) and the folders on the way to them; they can play them (pictures included), see «Tu
  puntaje» at the end with «Otra vez» / «Salir» (back to the folder they were in). No students, no
  teacher tools, no class board, nothing saved (not in the database, not on the device; the device's own
  activities stay untouched). Ajustes → «👋 Ver como invitado» lets the teacher check the guest view and
  come back with «Volver al maestro». Database: `quizzes.shared_guest`, read-only `guest_catalog()`
  and a storage policy that lets guests read only the files of shared activities. Test: tests/guesttest.js.
- Students: a new student takes its alphabetical place in the list (before it got the next number and,
  since the others had none, jumped to the top). With a hand-made order (⬆️) it goes before the first
  name that comes after it. «Zone Guest» was fixed in the database.
- New activity type «Pantalla de Tablet» (`typing`): the child copies a word or phrase with an on-screen
  keyboard like the school tablets' (letters with ñ, Shift / double tap = CAPS LOCK, numbers row, «?123»
  page with signs, long press on a vowel for á é í ó ú ü, Space, ⌫, Enter). Modes for the whole
  activity: 1 = the letter to type is marked in yellow; 2 = not marked; 3 = only the picture (tap it to
  hear the word), written from memory. A wrong key buzzes and blinks red; a wrong letter appears in red
  and must be erased with ⌫; a second mistake on the same letter turns the right key green (⌫, Shift,
  ?123/ABC first when needed) and locks the rest. Enter ends each word. Points per word: 0 mistakes 1,
  1–2 0.75, 3–4 0.5, 5–6 0.25, more 0. Files: js/typing-game.js, js/typing-editor.js. Database:
  activity_type 'typing' (settings.mode), `quiz_results.score` numeric(8,2), `quiz_result_answers`
  + points, errors. Results show decimals (e.g. 3.5 / 4) and the mistakes per word.
- Pantalla de Tablet: the numbers row is as tall as the rows of letters and its numbers look like keys
  (easier for children to tap). The keyboard gives way on short screens so both cards stay visible.
- Quiz start: when the activity has instructions, they are read first when it starts (and on «Otra
  vez»), then question 1's sound (question, «Leer en voz alta» text or audio file). Only at the start,
  not before every question. `LL.ui.speak` takes an optional onDone callback for this.
- Quiz editor, activity options: «🔊 Al tocar la imagen, sonar la voz», one choice for the whole quiz.
  Marked (default, also for existing quizzes), tapping any question's picture plays that question's sound
  (the question, the «Leer en voz alta» text or the audio file); unmarked, no picture does anything. The
  automatic reading and the 🔊 button are unchanged. Column `quizzes.image_speaks` (default true);
  `save_quiz` keeps it when an older app saves without it. (It was briefly a per-question choice,
  `quiz_questions.image_speaks`, now unused; a quiz with a question turned off became off as a whole.)
- End music: when a child finishes any activity, an original, cheerful ~4-second «¡Lo lograste!» tune
  plays (made with Web Audio in js/ui.js `celebrateTune`, no audio file). It replaces the short ding
  at the end and stops if the child taps «Otra vez» or leaves.
- Work time: every activity shows ⏱️ m:ss next to the child's name in the top bar, from 0:00 when the
  activity appears. It stops (keeping the final time) when the activity ends and restarts with «Otra
  vez». Clasificación rápida no longer shows its own second clock.
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
