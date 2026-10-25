-- Little Learners V123: real tables for students' icons and for quiz activities.
-- Additive only: existing data in students / assessments / letter_results and the
-- ll_* tables is kept as it is.

-- 1) Students: an animal icon and an optional picture.
alter table public.students add column if not exists animal text;
alter table public.students add column if not exists avatar_path text;
alter table public.students add column if not exists sort_order integer;
alter table public.students add column if not exists updated_at timestamptz not null default now();
alter table public.students add constraint students_name_len check (char_length(name) between 1 and 60) not valid;

-- Random animal for every student that doesn't have one (different animals within a class when possible).
with animals as (
  select a, row_number() over () as n
  from unnest(array['🐱','🐶','🦖','🦆','🐸','🐼','🦋','🦁','🐰','🐻','🐨','🐯','🐵','🐧','🐢','🐙','🦄','🐝','🐞','🦊','🐮','🐷','🐳','🦒']) as a
), pick as (
  select s.id, row_number() over (partition by s.teacher_id order by random()) as n
  from public.students s where s.animal is null
)
update public.students s
set animal = (select a from animals where animals.n = ((pick.n - 1) % 24) + 1)
from pick where pick.id = s.id;

-- 2) Folders
create table public.folders (
  id                text primary key default gen_random_uuid()::text,
  teacher_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id         text,
  name              text not null check (char_length(name) <= 120),
  color             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- 3) Quizzes, questions and answer options
create table public.quizzes (
  id                text primary key default gen_random_uuid()::text,
  teacher_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id         text,
  name              text not null check (char_length(name) <= 200),
  language          text not null default 'es' check (language in ('es','en')),
  mode              text not null default 'practice' check (mode in ('practice','assessment')),
  question_order    text not null default 'fixed' check (question_order in ('fixed','random')),
  answer_order      text not null default 'fixed' check (answer_order in ('fixed','random')),
  visible           boolean not null default false,
  cover_path        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.quiz_questions (
  quiz_id           text not null references public.quizzes(id) on delete cascade,
  id                text not null,
  teacher_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position          integer not null default 0,
  prompt            text not null default '',
  emoji             text not null default '',
  image_path        text,
  audio_mode        text not null default 'voice' check (audio_mode in ('none','voice','file')),
  audio_path        text,
  read_text_enabled boolean not null default false,
  read_text         text not null default '',
  tts               jsonb,
  primary key (quiz_id, id)
);

create table public.quiz_options (
  quiz_id           text not null,
  question_id       text not null,
  id                text not null,
  teacher_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position          integer not null default 0,
  text              text not null default '',
  image_path        text,
  audio_mode        text not null default 'none' check (audio_mode in ('none','voice','file')),
  audio_path        text,
  read_text_enabled boolean not null default false,
  read_text         text not null default '',
  tts               jsonb,
  is_correct        boolean not null default false,
  primary key (quiz_id, question_id, id),
  foreign key (quiz_id, question_id) references public.quiz_questions(quiz_id, id) on delete cascade
);

create index folders_teacher_server   on public.folders (teacher_id, server_updated_at);
create index quizzes_teacher_server   on public.quizzes (teacher_id, server_updated_at);
create index quiz_questions_teacher   on public.quiz_questions (teacher_id);
create index quiz_options_teacher     on public.quiz_options (teacher_id);
create index students_teacher         on public.students (teacher_id);

create trigger folders_touch  before insert or update on public.folders  for each row execute function public.ll_touch_server_updated_at();
create trigger quizzes_touch  before insert or update on public.quizzes  for each row execute function public.ll_touch_server_updated_at();

create or replace function public.ll_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke execute on function public.ll_touch_updated_at() from anon, authenticated, public;
create trigger students_touch before update on public.students for each row execute function public.ll_touch_updated_at();

alter table public.folders        enable row level security;
alter table public.quizzes        enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['folders','quizzes','quiz_questions','quiz_options'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = teacher_id)', t || '_own_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = teacher_id)', t || '_own_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id)', t || '_own_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = teacher_id)', t || '_own_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 4) Pictures and audio: private bucket, one folder per teacher.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-media', 'quiz-media', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/x-m4a'])
on conflict (id) do nothing;

create policy quiz_media_own_select on storage.objects for select to authenticated
  using (bucket_id = 'quiz-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy quiz_media_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'quiz-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy quiz_media_own_update on storage.objects for update to authenticated
  using (bucket_id = 'quiz-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy quiz_media_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quiz-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
