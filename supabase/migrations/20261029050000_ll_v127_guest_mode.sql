-- V127: «Entrar como invitado» (guest mode). People without an account can try the activities a teacher
-- marked «Compartir con invitados» (and visible). Read only: guests never see students, results,
-- teacher ids or anything else, and nothing is saved.
alter table public.quizzes add column if not exists shared_guest boolean not null default false;

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

  insert into public.quizzes as q (id, folder_id, name, language, mode, question_order, answer_order, visible, cover_path, voice_gender, activity_type, settings, instructions, image_speaks, shared_guest, created_at, updated_at, deleted_at)
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
    coalesce((p_quiz->>'shared_guest')::boolean, false),
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
    shared_guest = case when p_quiz ? 'shared_guest' then excluded.shared_guest else q.shared_guest end,
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

/* Everything a guest needs, in the same shape the app downloads for a teacher: the shared activities
   with their questions and answers, and only the folders on the way to them. */
create or replace function public.guest_catalog()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with recursive shared as (
    select * from public.quizzes q where q.visible and q.shared_guest and q.deleted_at is null
  ), live_folders as (
    select f.id, f.parent_id, f.name, f.color from public.folders f where f.deleted_at is null
  ), trail as (
    select lf.* from live_folders lf where lf.id in (select s.folder_id from shared s where s.folder_id is not null)
    union
    select p.* from live_folders p join trail t on p.id = t.parent_id
  )
  select jsonb_build_object(
    'folders', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'parent_id', t.parent_id, 'name', t.name, 'color', t.color)) from trail t), '[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'folder_id', s.folder_id, 'name', s.name, 'language', s.language, 'question_order', s.question_order,
        'answer_order', s.answer_order, 'visible', true, 'cover_path', s.cover_path, 'voice_gender', s.voice_gender,
        'activity_type', s.activity_type, 'settings', s.settings, 'instructions', s.instructions, 'image_speaks', s.image_speaks,
        'created_at', s.created_at, 'updated_at', s.updated_at,
        'quiz_questions', coalesce((select jsonb_agg(jsonb_build_object(
            'id', x.id, 'position', x.position, 'prompt', x.prompt, 'emoji', x.emoji, 'image_path', x.image_path,
            'audio_mode', x.audio_mode, 'audio_path', x.audio_path, 'read_text_enabled', x.read_text_enabled, 'read_text', x.read_text,
            'quiz_options', coalesce((select jsonb_agg(jsonb_build_object(
                'id', o.id, 'position', o.position, 'text', o.text, 'image_path', o.image_path, 'audio_mode', o.audio_mode,
                'audio_path', o.audio_path, 'read_text_enabled', o.read_text_enabled, 'read_text', o.read_text, 'is_correct', o.is_correct))
              from public.quiz_options o where o.quiz_id = x.quiz_id and o.question_id = x.id), '[]'::jsonb)))
          from public.quiz_questions x where x.quiz_id = s.id), '[]'::jsonb)))
      from shared s), '[]'::jsonb));
$function$;
revoke all on function public.guest_catalog() from public;
grant execute on function public.guest_catalog() to anon, authenticated;

/* Pictures and audio of shared activities can be downloaded by guests; nothing else in the bucket. */
create or replace function public.guest_media_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (select 1 from public.quizzes q where q.visible and q.shared_guest and q.deleted_at is null and q.cover_path = p_name)
      or exists (select 1 from public.quiz_questions x join public.quizzes q on q.id = x.quiz_id
                 where q.visible and q.shared_guest and q.deleted_at is null and (x.image_path = p_name or x.audio_path = p_name))
      or exists (select 1 from public.quiz_options o join public.quizzes q on q.id = o.quiz_id
                 where q.visible and q.shared_guest and q.deleted_at is null and (o.image_path = p_name or o.audio_path = p_name));
$function$;
revoke all on function public.guest_media_allowed(text) from public;
grant execute on function public.guest_media_allowed(text) to anon, authenticated;

drop policy if exists quiz_media_guest_select on storage.objects;
create policy quiz_media_guest_select on storage.objects for select to anon
  using (bucket_id = 'quiz-media' and public.guest_media_allowed(name));
