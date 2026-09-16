-- =====================================================================
-- 0014 - n8n_run_log
--
-- Used to live as SQL to paste from n8n/README.md. Each workflow logs a run
-- here with the service role; a workflow that stops logging is how we notice
-- it stopped running. Written defensively in case the README version was
-- already applied by hand.
-- =====================================================================

create table if not exists public.n8n_run_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  workflow text not null,
  processed integer not null default 0,
  failed integer not null default 0,
  details jsonb
);

create index if not exists n8n_run_log_workflow_idx on public.n8n_run_log (workflow, ran_at desc);

alter table public.n8n_run_log enable row level security;

drop policy if exists "n8n_run_log_select_admin" on public.n8n_run_log;
drop policy if exists "n8n_run_log_insert_admin" on public.n8n_run_log;
drop policy if exists "n8n_run_log_update_admin" on public.n8n_run_log;
drop policy if exists "n8n_run_log_delete_admin" on public.n8n_run_log;

-- Staff read it. Nobody writes it through the API: n8n uses the service
-- role, which bypasses RLS.
create policy "n8n_run_log_select_staff" on public.n8n_run_log
  for select to authenticated
  using (public.is_platform_admin());

revoke insert, update, delete, truncate on public.n8n_run_log from anon, authenticated;
