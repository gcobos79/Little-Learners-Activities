-- Server-side change time, used by tablets to download only what changed
-- (device clocks can be wrong, so we don't rely on updated_at for that).
alter table public.ll_quizzes  add column server_updated_at timestamptz not null default now();
alter table public.ll_folders  add column server_updated_at timestamptz not null default now();
alter table public.ll_settings add column server_updated_at timestamptz not null default now();

create or replace function public.ll_touch_server_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

create trigger ll_quizzes_touch  before insert or update on public.ll_quizzes  for each row execute function public.ll_touch_server_updated_at();
create trigger ll_folders_touch  before insert or update on public.ll_folders  for each row execute function public.ll_touch_server_updated_at();
create trigger ll_settings_touch before insert or update on public.ll_settings for each row execute function public.ll_touch_server_updated_at();

revoke execute on function public.ll_touch_server_updated_at() from anon, authenticated, public;

create index ll_quizzes_owner_server on public.ll_quizzes (owner_id, server_updated_at);
create index ll_folders_owner_server on public.ll_folders (owner_id, server_updated_at);
