-- 0002_quota_and_rls.sql
-- Quota enforcement function, message_requests idempotency table, and strict RLS policies

-- 1. message_requests table for reliable idempotency retry protection
create table if not exists public.message_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.message_requests enable row level security;
drop policy if exists "message_requests_own" on public.message_requests;
drop policy if exists "message_requests_select_own" on public.message_requests;
create policy "message_requests_select_own" on public.message_requests
  for select to authenticated
  using (user_id = auth.uid());

-- 2. Stored procedure: consume_daily_message
drop function if exists public.consume_daily_message();
drop function if exists public.consume_daily_message(uuid, integer, boolean);

create or replace function public.consume_daily_message(_user uuid, _limit integer, _unlimited boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if _unlimited then return true; end if;
  insert into public.daily_usage (user_id, day, messages_sent)
  values (_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set messages_sent = public.daily_usage.messages_sent + 1
    where public.daily_usage.messages_sent < _limit
  returning messages_sent into v_count;
  return v_count is not null;
end $$;

revoke all on function public.consume_daily_message(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.consume_daily_message(uuid, integer, boolean) to service_role;

-- Revoke execute on has_role from anon
revoke execute on function public.has_role(uuid, public.app_role) from anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- 3. Row Level Security for daily_usage
alter table public.daily_usage enable row level security;
drop policy if exists "daily_usage_select_own" on public.daily_usage;
create policy "daily_usage_select_own" on public.daily_usage
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
-- No insert/update/delete policy for authenticated users; service_role only.

-- 4. Projects RLS
alter table public.projects enable row level security;
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 5. Project Files RLS
alter table public.project_files enable row level security;
drop policy if exists "project_files_select" on public.project_files;
create policy "project_files_select" on public.project_files
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "project_files_insert" on public.project_files;
create policy "project_files_insert" on public.project_files
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "project_files_update" on public.project_files;
create policy "project_files_update" on public.project_files
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "project_files_delete" on public.project_files;
create policy "project_files_delete" on public.project_files
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 6. Project Versions RLS
alter table public.project_versions enable row level security;
drop policy if exists "project_versions_select" on public.project_versions;
create policy "project_versions_select" on public.project_versions
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "project_versions_insert" on public.project_versions;
create policy "project_versions_insert" on public.project_versions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "project_versions_delete" on public.project_versions;
create policy "project_versions_delete" on public.project_versions
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 7. Messages RLS
alter table public.messages enable row level security;
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 8. Build Runs RLS
alter table public.build_runs enable row level security;
drop policy if exists "build_runs_select" on public.build_runs;
create policy "build_runs_select" on public.build_runs
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "build_runs_insert" on public.build_runs;
create policy "build_runs_insert" on public.build_runs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "build_runs_update" on public.build_runs;
create policy "build_runs_update" on public.build_runs
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 9. Build Steps RLS
alter table public.build_steps enable row level security;
drop policy if exists "build_steps_select" on public.build_steps;
create policy "build_steps_select" on public.build_steps
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "build_steps_insert" on public.build_steps;
create policy "build_steps_insert" on public.build_steps
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "build_steps_update" on public.build_steps;
create policy "build_steps_update" on public.build_steps
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 10. Work Logs RLS
alter table public.work_logs enable row level security;
drop policy if exists "work_logs_select" on public.work_logs;
create policy "work_logs_select" on public.work_logs
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "work_logs_insert" on public.work_logs;
create policy "work_logs_insert" on public.work_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- 11. Publications RLS (Public read is done server-side via service role client; no anon policy)
alter table public.publications enable row level security;
drop policy if exists "publications_select" on public.publications;
create policy "publications_select" on public.publications
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "publications_insert" on public.publications;
create policy "publications_insert" on public.publications
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "publications_update" on public.publications;
create policy "publications_update" on public.publications
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "publications_delete" on public.publications;
create policy "publications_delete" on public.publications
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 12. User Roles RLS (No self-insert or self-update)
alter table public.user_roles enable row level security;
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_manage" on public.user_roles;
create policy "user_roles_admin_manage" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 13. App Settings RLS (Admin only)
alter table public.app_settings enable row level security;
drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all" on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 14. Custom API keys RLS (Admin only)
alter table public.custom_api_keys enable row level security;
drop policy if exists "custom_api_keys_admin" on public.custom_api_keys;
create policy "custom_api_keys_admin" on public.custom_api_keys
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
