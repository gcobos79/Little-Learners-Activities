-- V126: new activity type «Selecciona y empareja» (sort cards from a conveyor belt into groups).
-- It reuses the quiz tables: each group is a row in quiz_questions (prompt = group name) and each
-- card a row in quiz_options of that group. quizzes.activity_type tells them apart and
-- quizzes.settings keeps the belt settings (speed, cards per group, show words, read aloud, instruction).
alter table public.quizzes add column if not exists activity_type text not null default 'quiz'
  check (activity_type in ('quiz', 'sort'));
alter table public.quizzes add column if not exists settings jsonb not null default '{}'::jsonb;

-- save_quiz(): same as V125 plus activity_type and settings. When an older copy of the app saves
-- (without those keys) the stored type and settings are kept, so it can't turn a sort into a quiz.
create or replace function public.save_quiz(p_quiz jsonb, p_questions jsonb, p_options jsonb)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_id text := p_quiz->>'id';
begin
  if v_id is null or length(v_id) = 0 or length(v_id) > 120 then
    raise exception 'quiz id required';
  end if;

  insert into public.quizzes as q (id, folder_id, name, language, mode, question_order, answer_order, visible, cover_path, voice_gender, activity_type, settings, created_at, updated_at, deleted_at)
  values (
    v_id,
    nullif(p_quiz->>'folder_id', ''),
    left(coalesce(p_quiz->>'name', ''), 200),
    case when p_quiz->>'language' = 'en' then 'en' else 'es' end,
    'practice',
    case when p_quiz->>'question_order' = 'random' then 'random' else 'fixed' end,
    case when p_quiz->>'answer_order' = 'random' then 'random' else 'fixed' end,
    coalesce((p_quiz->>'visible')::boolean, false),
    nullif(p_quiz->>'cover_path', ''),
    case when p_quiz->>'voice_gender' = 'male' then 'male' else 'female' end,
    case when p_quiz->>'activity_type' = 'sort' then 'sort' else 'quiz' end,
    case when jsonb_typeof(p_quiz->'settings') = 'object' then p_quiz->'settings' else '{}'::jsonb end,
    coalesce((p_quiz->>'created_at')::timestamptz, now()),
    coalesce((p_quiz->>'updated_at')::timestamptz, now()),
    null
  )
  on conflict (id) do update set
    folder_id = excluded.folder_id, name = excluded.name, language = excluded.language, mode = excluded.mode,
    question_order = excluded.question_order, answer_order = excluded.answer_order, visible = excluded.visible,
    cover_path = excluded.cover_path, voice_gender = excluded.voice_gender,
    activity_type = case when p_quiz ? 'activity_type' then excluded.activity_type else q.activity_type end,
    settings = case when p_quiz ? 'settings' then excluded.settings else q.settings end,
    updated_at = excluded.updated_at, deleted_at = null;

  delete from public.quiz_questions where quiz_id = v_id;

  insert into public.quiz_questions (quiz_id, id, position, prompt, emoji, image_path, audio_mode, audio_path, read_text_enabled, read_text, tts)
  select v_id, x.id, coalesce(x.position, 0), coalesce(x.prompt, ''), coalesce(x.emoji, ''), nullif(x.image_path, ''),
         case when x.audio_mode in ('none','voice','file') then x.audio_mode else 'voice' end,
         nullif(x.audio_path, ''), coalesce(x.read_text_enabled, false), coalesce(x.read_text, ''), x.tts
  from jsonb_to_recordset(coalesce(p_questions, '[]'::jsonb)) as x(id text, position int, prompt text, emoji text, image_path text, audio_mode text, audio_path text, read_text_enabled boolean, read_text text, tts jsonb);

  insert into public.quiz_options (quiz_id, question_id, id, position, text, image_path, audio_mode, audio_path, read_text_enabled, read_text, tts, is_correct)
  select v_id, x.question_id, x.id, coalesce(x.position, 0), coalesce(x.text, ''), nullif(x.image_path, ''),
         case when x.audio_mode in ('none','voice','file') then x.audio_mode else 'none' end,
         nullif(x.audio_path, ''), coalesce(x.read_text_enabled, false), coalesce(x.read_text, ''), x.tts, coalesce(x.is_correct, false)
  from jsonb_to_recordset(coalesce(p_options, '[]'::jsonb)) as x(question_id text, id text, position int, text text, image_path text, audio_mode text, audio_path text, read_text_enabled boolean, read_text text, tts jsonb, is_correct boolean);
end $function$;
