alter table public.nfl_players
  add column if not exists sleeper_id text unique,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists espn_id text,
  add column if not exists sportradar_id text,
  add column if not exists gsis_id text,
  add column if not exists fantasy_data_id text,
  add column if not exists yahoo_id text,
  add column if not exists headshot_url text,
  add column if not exists active boolean not null default true,
  add column if not exists injury_body_part text,
  add column if not exists injury_notes text,
  add column if not exists practice_participation text,
  add column if not exists search_rank integer,
  add column if not exists depth_chart_order integer,
  add column if not exists last_synced_at timestamptz;

create index if not exists nfl_players_sleeper_id_idx on public.nfl_players (sleeper_id);
create index if not exists nfl_players_draft_pool_idx on public.nfl_players (active, position, search_rank);

create table if not exists public.provider_sync_log (
  id bigint generated always as identity primary key,
  provider text not null,
  status text not null check (status in ('running', 'success', 'error')),
  records_processed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.provider_sync_log enable row level security;
create policy "authenticated users read sync status"
  on public.provider_sync_log for select to authenticated using (true);
