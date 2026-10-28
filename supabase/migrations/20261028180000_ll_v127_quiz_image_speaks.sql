-- V127 (change): «🔊 Al tocar la imagen, sonar la voz» is one choice for the whole quiz, not per
-- question. Column quizzes.image_speaks (default true: tapping a question picture plays its sound).
-- Quizzes where a question had already been turned off become off as a whole. Kept when an older app
-- version saves without the field. (quiz_questions.image_speaks stays, unused, for older V127 builds.)
alter table public.quizzes add column if not exists image_speaks boolean not null default true;

update public.quizzes z set image_speaks = false
  where exists (select 1 from public.quiz_questions q where q.quiz_id = z.id and q.image_speaks = false);

create or replace function public.save_quiz(p_quiz jsonb, p_questions jsonb, p_options jsonb)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_id text := p_quiz->>'id';
  v_old jsonb;
begin
  if v_id is null or length(v_id) = 0 or length(v_id) > 120 then
    raise exception 'quiz id required';
  end if;

  insert into public.quizzes as q (id, folder_id, name, language, mode, question_order, answer_order, visible, cover_path, voice_gender, activity_type, settings, instructions, image_speaks, created_at, updated_at, deleted_at)
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
    left(coalesce(p_quiz->>'instructions', ''), 300),
    coalesce((p_quiz->>'image_speaks')::boolean, true),
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
    instructions = case when p_quiz ? 'instructions' then excluded.instructions else q.instructions end,
    image_speaks = case when p_quiz ? 'image_speaks' then excluded.image_speaks else q.image_speaks end,
    updated_at = excluded.updated_at, deleted_at = null;

  -- Remember each question's «tocar la imagen» choice, for older app versions that don't send it.
  select coalesce(jsonb_object_agg(id, image_speaks), '{}'::jsonb) into v_old from public.quiz_questions where quiz_id = v_id;

  delete from public.quiz_questions where quiz_id = v_id;

  insert into public.quiz_questions (quiz_id, id, position, prompt, emoji, image_path, audio_mode, audio_path, read_text_enabled, read_text, tts, image_speaks)
  select v_id, x.id, coalesce(x.position, 0), coalesce(x.prompt, ''), coalesce(x.emoji, ''), nullif(x.image_path, ''),
         case when x.audio_mode in ('none','voice','file') then x.audio_mode else 'voice' end,
         nullif(x.audio_path, ''), coalesce(x.read_text_enabled, false), coalesce(x.read_text, ''), x.tts,
         coalesce(x.image_speaks, (v_old->>x.id)::boolean, true)
  from jsonb_to_recordset(coalesce(p_questions, '[]'::jsonb)) as x(id text, position int, prompt text, emoji text, image_path text, audio_mode text, audio_path text, read_text_enabled boolean, read_text text, tts jsonb, image_speaks boolean);

  insert into public.quiz_options (quiz_id, question_id, id, position, text, image_path, audio_mode, audio_path, read_text_enabled, read_text, tts, is_correct)
  select v_id, x.question_id, x.id, coalesce(x.position, 0), coalesce(x.text, ''), nullif(x.image_path, ''),
         case when x.audio_mode in ('none','voice','file') then x.audio_mode else 'none' end,
         nullif(x.audio_path, ''), coalesce(x.read_text_enabled, false), coalesce(x.read_text, ''), x.tts, coalesce(x.is_correct, false)
  from jsonb_to_recordset(coalesce(p_options, '[]'::jsonb)) as x(question_id text, id text, position int, text text, image_path text, audio_mode text, audio_path text, read_text_enabled boolean, read_text text, tts jsonb, is_correct boolean);
end $function$;
