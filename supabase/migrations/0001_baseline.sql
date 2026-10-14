-- REVIEW BEFORE APPLYING
-- Baseline schema for DevLoadable generated from src/integrations/supabase/types.ts

create extension if not exists "uuid-ossp";

-- Enums
do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception
  when duplicate_object then null;
end $$;

-- 1. App settings
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- 2. User profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  agent_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Build runs
create table if not exists public.build_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  mode text not null,
  kind text not null default 'manual',
  status text not null,
  error text,
  parent_run_id uuid references public.build_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 5. Build steps
create table if not exists public.build_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.build_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx integer not null,
  title text not null,
  description text not null,
  status text not null default 'pending',
  summary text,
  started_at timestamptz,
  finished_at timestamptz
);

-- 6. Project files
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  content text not null default '',
  is_upload boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(project_id, path)
);

-- 7. Project versions
create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.build_runs(id) on delete set null,
  label text not null,
  file_count integer not null default 0,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 8. Publications
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  entry_path text not null default 'index.html',
  show_badge boolean not null default true,
  allow_indexing boolean not null default false,
  published_at timestamptz not null default now()
);

-- 9. User roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

-- 10. Daily usage
create table if not exists public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  messages_sent integer not null default 0,
  primary key (user_id, day)
);

-- 11. Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  kind text not null default 'text',
  meta jsonb,
  created_at timestamptz not null default now()
);

-- 12. Work logs
create table if not exists public.work_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.build_runs(id) on delete set null,
  step_idx integer,
  kind text not null,
  label text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- 13. Custom API keys
create table if not exists public.custom_api_keys (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  provider text not null,
  label text,
  key_ciphertext text not null,
  created_at timestamptz not null default now()
);

-- Function: has_role
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
end $$;
