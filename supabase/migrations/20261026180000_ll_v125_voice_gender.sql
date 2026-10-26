-- V125: each quiz can suggest a female or male voice; the teacher can pick one
-- ElevenLabs voice of each kind. (save_quiz now also stores voice_gender and always 'practice'.)
alter table public.quizzes add column if not exists voice_gender text not null default 'female' check (voice_gender in ('female','male'));
alter table public.ll_settings add column if not exists male_voice_id text;
-- save_quiz(): same as 20261025231000 plus voice_gender (see that file); mode is always 'practice'.
