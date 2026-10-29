-- V127: administrator account. Each teacher's data is already private (RLS); what is SHARED between
-- accounts is reserved to the administrator (gcobos79@gmail.com):
--   * «Compartir con invitados»: only the administrator's activities can be shared with guests
--     (save_quiz ignores the flag for others, and the guest catalog / pictures only include the
--     administrator's activities even if another account sets the column directly);
--   * the ElevenLabs voice (credits), checked in the ll-tts edge function.
create table if not exists public.ll_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.ll_admins enable row level security;
drop policy if exists ll_admins_self_read on public.ll_admins;
create policy ll_admins_self_read on public.ll_admins for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ll_admins from anon;
insert into public.ll_admins (user_id) select id from auth.users where lower(email) = 'gcobos79@gmail.com' on conflict do nothing;

create or replace function public.is_ll_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (select 1 from public.ll_admins a where a.user_id = (select auth.uid()));
$function$;
revoke all on function public.is_ll_admin() from public;
grant execute on function public.is_ll_admin() to authenticated;

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
    coalesce((p_quiz->>'shared_guest')::boolean, false) and public.is_ll_admin(),
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
    shared_guest = case when p_quiz ? 'shared_guest' and public.is_ll_admin() then (p_quiz->>'shared_guest')::boolean else q.shared_guest end,
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


create or replace function public.guest_catalog()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with recursive shared as (
    select * from public.quizzes q where q.visible and q.shared_guest and q.deleted_at is null
      and exists (select 1 from public.ll_admins a where a.user_id = q.teacher_id)
  ), live_folders as (
    select f.id, f.parent_id, f.name, f.color from public.folders f where f.deleted_at is null
      and exists (select 1 from public.ll_admins a where a.user_id = f.teacher_id)
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

create or replace function public.guest_media_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (select 1 from public.quizzes q where q.visible and q.shared_guest and q.deleted_at is null and exists (select 1 from public.ll_admins a where a.user_id = q.teacher_id) and q.cover_path = p_name)
      or exists (select 1 from public.quiz_questions x join public.quizzes q on q.id = x.quiz_id
                 where q.visible and q.shared_guest and q.deleted_at is null and exists (select 1 from public.ll_admins a where a.user_id = q.teacher_id) and (x.image_path = p_name or x.audio_path = p_name))
      or exists (select 1 from public.quiz_options o join public.quizzes q on q.id = o.quiz_id
                 where q.visible and q.shared_guest and q.deleted_at is null and exists (select 1 from public.ll_admins a where a.user_id = q.teacher_id) and (o.image_path = p_name or o.audio_path = p_name));
$function$;
