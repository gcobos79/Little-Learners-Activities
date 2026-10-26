# ✨ Little Learners Activities

Quizzes with pictures and sound for Pre-K classrooms. Teachers build activities;
children tap their animal, browse folders, and play on a tablet.

**Live site:** https://gcobos79.github.io/Little-Learners-Activities/ (after GitHub Pages is turned on)

Created by Geovanny Cobos.

## How it works

| Who | What they do |
| --- | --- |
| **Children** | Tap their animal → open a folder → tap a quiz. Big buttons, read-aloud questions, a magic chime for right answers and a buzzer for wrong ones. They can't change anything. |
| **Teacher** | Press and **hold 🔒 Maestro** for one second (plus a PIN, if set). Create folders and quizzes, mark a quiz *Visible* when it's ready, manage the student list, and back up or share activities. |

- After a mistake, the correct answer is shown. Each child's result is saved once per month (latest attempt) and the teacher sees a ranking per quiz (📊).
- Only quizzes marked **Visible para estudiantes** that have at least one question appear for children. Empty folders are hidden from them.
- The original **Sonidos iniciales** drag-and-drop activity is kept unchanged and can be turned on for students in the teacher area.

## Accounts and tablets (Supabase)

Teachers can sign in to keep their activities in the cloud. The class list comes from the
`students` table, and quizzes are stored in the `quizzes`, `quiz_questions` and `quiz_options`
tables, with pictures and audio in Supabase Storage (resized and compressed first). Sign in **once on each tablet**;
the tablet stays signed in and downloads new quizzes automatically. The site still works
offline from its local copy, and can also be used **without an account** on a single device.

Natural voices come from **ElevenLabs**: when a quiz is saved, each “Voz automática” text is
turned into audio once and stored, so replays cost no credits. Without credits or internet,
the device's built-in voice is used.

Setup steps for the Supabase project and ElevenLabs key: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

## Bringing over quizzes from V121 (the ChatGPT version)

Browsers keep each site's saved data separately, so quizzes made in the old file don't appear
on the new website by themselves. Easiest way:

1. On the **same computer** where you used the old version, open
   `versions/little-learners-activities-v125.html` in **Chrome** (double-click it).
   It sees the quizzes and folders saved by the old file.
2. Sign in with your teacher account and choose **“Subir a mi cuenta”**.
3. Open the website on any device and sign in — everything is there.

(Without an account: hold **Maestro → Ajustes → Descargar respaldo**, then on the other
device **Ajustes → Importar**.)

## Project layout

```
index.html            the app
css/app.css           all styles (phones, tablets, laptops, widescreen)
js/                   app code, one file per part (store, sync, player, editor, …)
supabase/             database migrations and the ElevenLabs edge function
tools/                build script for the single-file version
versions/             V121 original (untouched) and the V122 single-file build
HANDOFF.md            the original project handoff from ChatGPT
PRIVACY.md, TERMS.md  English versions of the in-app privacy policy and terms
```

No build step and no outside libraries: open `index.html` directly in Chrome, or serve the
folder with any static host. To rebuild the single-file version after changing the code:

```
python3 tools/build_single_file.py
```

## What has and hasn't been tested

- ✅ Automated browser tests (Chromium) of the student flow, teacher editor, folders, backup,
  delete, Sonidos iniciales, and sign-in / sync / PIN / voice against a **simulated** Supabase.
- ✅ Layout checks at iPhone, iPhone landscape, iPad, Chromebook tablet (portrait and
  landscape), laptop, 1080p and ultra-wide sizes.
- ✅ Database security rules checked directly in Supabase.
- ⏳ **Not yet tested:** real school tablets, real iPhones/iPads (Safari), and the live
  ElevenLabs voice (it needs the API key — see setup).
