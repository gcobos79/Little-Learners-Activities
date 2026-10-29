-- V127: new activity type «Pantalla de Tablet» (activity_type 'typing'): the child copies a word or
-- phrase with an on-screen tablet keyboard. Each word is a quiz_question (prompt = the word, optional
-- picture); quizzes.settings holds { mode: 1 | 2 | 3 }.
-- Scoring: each word is worth 1 point minus 0.25 per pair of mistakes, so results can have quarters:
-- quiz_results.score becomes numeric(8,2); quiz_result_answers gets points and errors.
alter table public.quizzes drop constraint if exists quizzes_activity_type_check;
alter table public.quizzes add constraint quizzes_activity_type_check check (activity_type in ('quiz', 'sort', 'typing'));

alter table public.quiz_results alter column score type numeric(8,2);
alter table public.quiz_result_answers add column if not exists points numeric(4,2);
alter table public.quiz_result_answers add column if not exists errors integer;

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
    case when p_quiz->>'activity_type' in ('sort', 'typing') then p_quiz->>'activity_type' else 'quiz' end,
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


create or replace function public.save_quiz_result(p_result jsonb, p_answers jsonb)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_finished timestamptz := (p_result->>'finished_at')::timestamptz;
  v_month    date := date_trunc('month', (p_result->>'month')::date)::date;
  v_id       bigint;
  v_existing timestamptz;
begin
  select id, finished_at into v_id, v_existing from public.quiz_results
   where student_id = (p_result->>'student_id')::bigint and quiz_id = p_result->>'quiz_id' and month = v_month;

  if v_id is not null and v_existing >= v_finished then
    return;
  end if;

  if v_id is null then
    insert into public.quiz_results (student_id, quiz_id, month, score, total, started_at, finished_at, duration_seconds)
    values ((p_result->>'student_id')::bigint, p_result->>'quiz_id', v_month, round((p_result->>'score')::numeric, 2), (p_result->>'total')::int,
            (p_result->>'started_at')::timestamptz, v_finished, (p_result->>'duration_seconds')::int)
    returning id into v_id;
  else
    update public.quiz_results set score = round((p_result->>'score')::numeric, 2), total = (p_result->>'total')::int,
      started_at = (p_result->>'started_at')::timestamptz, finished_at = v_finished,
      duration_seconds = (p_result->>'duration_seconds')::int, updated_at = now()
    where id = v_id;
    delete from public.quiz_result_answers where result_id = v_id;
  end if;

  insert into public.quiz_result_answers (result_id, position, question_id, prompt, chosen_option_ids, chosen_text, correct, response_ms, points, errors)
  select v_id, x.position, x.question_id, left(coalesce(x.prompt, ''), 300), coalesce(x.chosen_option_ids, '{}'), left(coalesce(x.chosen_text, ''), 200), x.correct, x.response_ms,
         x.points, x.errors
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as x(position int, question_id text, prompt text, chosen_option_ids text[], chosen_text text, correct boolean, response_ms int, points numeric, errors int);
end $function$;
