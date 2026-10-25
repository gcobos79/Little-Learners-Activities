-- Little Learners Activities V122: cloud copy of each teacher's library.
-- New tables only; the older students / assessments / letter_results tables are not touched.

create table public.ll_quizzes (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  family_id  text,
  type       text not null default 'quiz',
  name       text not null default '',
  version    integer not null default 1,
  folder_id  text,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id),
  constraint ll_quizzes_id_len check (char_length(id) between 1 and 120),
  constraint ll_quizzes_name_len check (char_length(name) <= 200)
);

create table public.ll_folders (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  name       text not null default '',
  parent_id  text,
  color      text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id),
  constraint ll_folders_id_len check (char_length(id) between 1 and 120),
  constraint ll_folders_name_len check (char_length(name) <= 200)
);

-- One row per teacher: student list, Sonidos iniciales settings, tablet PIN (hashed), voice choice.
create table public.ll_settings (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  roster     jsonb,
  sonidos    jsonb,
  pin_hash   text,
  voice_id   text,
  updated_at timestamptz not null default now()
);

create index ll_quizzes_owner_updated on public.ll_quizzes (owner_id, updated_at);
create index ll_folders_owner_updated on public.ll_folders (owner_id, updated_at);

alter table public.ll_quizzes  enable row level security;
alter table public.ll_folders  enable row level security;
alter table public.ll_settings enable row level security;

-- Each signed-in teacher can only see and change their own rows.
create policy ll_quizzes_owner_select on public.ll_quizzes for select to authenticated using ((select auth.uid()) = owner_id);
create policy ll_quizzes_owner_insert on public.ll_quizzes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy ll_quizzes_owner_update on public.ll_quizzes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy ll_quizzes_owner_delete on public.ll_quizzes for delete to authenticated using ((select auth.uid()) = owner_id);

create policy ll_folders_owner_select on public.ll_folders for select to authenticated using ((select auth.uid()) = owner_id);
create policy ll_folders_owner_insert on public.ll_folders for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy ll_folders_owner_update on public.ll_folders for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy ll_folders_owner_delete on public.ll_folders for delete to authenticated using ((select auth.uid()) = owner_id);

create policy ll_settings_owner_select on public.ll_settings for select to authenticated using ((select auth.uid()) = owner_id);
create policy ll_settings_owner_insert on public.ll_settings for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy ll_settings_owner_update on public.ll_settings for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy ll_settings_owner_delete on public.ll_settings for delete to authenticated using ((select auth.uid()) = owner_id);

-- Anonymous visitors get nothing.
revoke all on public.ll_quizzes, public.ll_folders, public.ll_settings from anon;
grant select, insert, update, delete on public.ll_quizzes, public.ll_folders, public.ll_settings to authenticated;

-- Private bucket for ElevenLabs audio, one folder per teacher: <owner_id>/<hash>.mp3
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ll-tts', 'll-tts', false, 2097152, array['audio/mpeg'])
on conflict (id) do nothing;

create policy ll_tts_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'll-tts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy ll_tts_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'll-tts' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Uploads happen only from the edge function (service role), so no insert policy for users.
