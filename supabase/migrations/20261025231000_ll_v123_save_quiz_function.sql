-- Saves one quiz with all its questions and answers in a single, all-or-nothing step.
-- Runs with the caller's permissions, so row-level security still applies.
create or replace function public.save_quiz(p_quiz jsonb, p_questions jsonb, p_options jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text := p_quiz->>'id';
begin
  if v_id is null or length(v_id) = 0 or length(v_id) > 120 then
    raise exception 'quiz id required';
  end if;

  insert into public.quizzes as q (id, folder_id, name, language, mode, question_order, answer_order, visible, cover_path, created_at, updated_at, deleted_at)
  values (
    v_id,
    nullif(p_quiz->>'folder_id', ''),
    left(coalesce(p_quiz->>'name', ''), 200),
    case when p_quiz->>'language' = 'en' then 'en' else 'es' end,
    case when p_quiz->>'mode' = 'assessment' then 'assessment' else 'practice' end,
    case when p_quiz->>'question_order' = 'random' then 'random' else 'fixed' end,
    case when p_quiz->>'answer_order' = 'random' then 'random' else 'fixed' end,
    coalesce((p_quiz->>'visible')::boolean, false),
    nullif(p_quiz->>'cover_path', ''),
    coalesce((p_quiz->>'created_at')::timestamptz, now()),
    coalesce((p_quiz->>'updated_at')::timestamptz, now()),
    null
  )
  on conflict (id) do update set
    folder_id = excluded.folder_id, name = excluded.name, language = excluded.language, mode = excluded.mode,
    question_order = excluded.question_order, answer_order = excluded.answer_order, visible = excluded.visible,
    cover_path = excluded.cover_path, updated_at = excluded.updated_at, deleted_at = null;

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
end $$;

revoke execute on function public.save_quiz(jsonb, jsonb, jsonb) from anon, public;
grant execute on function public.save_quiz(jsonb, jsonb, jsonb) to authenticated;
