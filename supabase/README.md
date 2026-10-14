# Supabase Database Migrations

This directory contains the database schema and security migrations for **DevLoadable**.

## Migration Files

1. `0001_baseline.sql` — Base tables, enums, relationships, and helper functions (`has_role`).
2. `0002_quota_and_rls.sql` — Atomic `consume_daily_message` stored procedure, `message_requests` table for idempotency, and Row Level Security (RLS) policies for all tables.

## How to Apply Migrations

### Option A: Using the Supabase Dashboard SQL Editor (Recommended)
1. Open your Supabase project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Navigate to the **SQL Editor** in the left sidebar.
3. Open `migrations/0001_baseline.sql`, paste its contents into the SQL Editor, and click **Run**.
4. Open `migrations/0002_quota_and_rls.sql`, paste its contents, and click **Run**.

### Option B: Using the Supabase CLI
If you have the Supabase CLI installed and linked to your project:
```bash
# Link your project
supabase link --project-ref <your-project-id>

# Push the migrations
supabase db push
```

## Security Verification Checklist
- [ ] `consume_daily_message` is granted only to `service_role` and revoked from `public`, `anon`, and `authenticated`.
- [ ] RLS is enabled on `daily_usage`, `projects`, `project_files`, `project_versions`, `messages`, `work_logs`, `build_runs`, `build_steps`, `publications`, `user_roles`, `app_settings`, and `custom_api_keys`.
- [ ] Authenticated users cannot self-assign `admin` role or directly insert/update `daily_usage`.
