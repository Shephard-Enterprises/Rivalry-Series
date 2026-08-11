-- Rivalry Series initial schema. Run with the Supabase CLI or SQL editor.
create extension if not exists pgcrypto;

create type public.week_status as enum ('scheduled', 'drafting', 'captain_selection', 'live', 'final');
create type public.player_status as enum ('healthy', 'questionable', 'doubtful', 'out', 'inactive', 'bye');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique check (display_name in ('Justin', 'Luke')),
  created_at timestamptz not null default now()
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  nfl_week integer not null check (nfl_week between 1 and 22),
  status public.week_status not null default 'scheduled',
  first_manager_id uuid not null references public.profiles(id),
  draft_opens_at timestamptz not null,
  draft_closes_at timestamptz not null,
  captain_locks_at timestamptz not null,
  finalized_at timestamptz,
  unique (season, nfl_week),
  check (draft_closes_at > draft_opens_at and captain_locks_at > draft_closes_at)
);

create table public.nfl_players (
  id text primary key,
  full_name text not null,
  position text not null check (position in ('QB', 'RB', 'WR', 'TE')),
  nfl_team text not null,
  status public.player_status not null default 'healthy',
  provider_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.week_players (
  week_id uuid not null references public.weeks(id) on delete cascade,
  player_id text not null references public.nfl_players(id),
  opponent text,
  projection numeric(6,2),
  ranking integer,
  available boolean not null default true,
  game_starts_at timestamptz,
  primary key (week_id, player_id)
);

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  pick_number integer not null check (pick_number between 1 and 14),
  manager_id uuid not null references public.profiles(id),
  player_id text not null references public.nfl_players(id),
  roster_slot text not null check (roster_slot in ('QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX')),
  is_auto_pick boolean not null default false,
  picked_at timestamptz not null default now(),
  unique (week_id, pick_number),
  unique (week_id, player_id),
  unique (week_id, manager_id, roster_slot)
);

create table public.draft_queue (
  week_id uuid not null references public.weeks(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  player_id text not null references public.nfl_players(id),
  priority integer not null check (priority > 0),
  created_at timestamptz not null default now(),
  primary key (week_id, manager_id, player_id),
  unique (week_id, manager_id, priority)
);

create table public.captains (
  week_id uuid not null references public.weeks(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  player_id text not null references public.nfl_players(id),
  selected_at timestamptz not null default now(),
  primary key (week_id, manager_id)
);

create table public.weekly_results (
  week_id uuid not null references public.weeks(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  fantasy_points numeric(8,2) not null default 0,
  result text check (result in ('win', 'loss', 'tie')),
  primary key (week_id, manager_id)
);

alter table public.profiles enable row level security;
alter table public.weeks enable row level security;
alter table public.nfl_players enable row level security;
alter table public.week_players enable row level security;
alter table public.draft_picks enable row level security;
alter table public.draft_queue enable row level security;
alter table public.captains enable row level security;
alter table public.weekly_results enable row level security;

create policy "authenticated users read profiles" on public.profiles for select to authenticated using (true);
create policy "authenticated users read weeks" on public.weeks for select to authenticated using (true);
create policy "authenticated users read players" on public.nfl_players for select to authenticated using (true);
create policy "authenticated users read weekly player data" on public.week_players for select to authenticated using (true);
create policy "authenticated users read picks" on public.draft_picks for select to authenticated using (true);
create policy "managers read own queue" on public.draft_queue for select to authenticated using (manager_id = auth.uid());
create policy "managers manage own queue" on public.draft_queue for all to authenticated using (manager_id = auth.uid()) with check (manager_id = auth.uid());
create policy "authenticated users read captains" on public.captains for select to authenticated using (true);
create policy "manager selects own captain before lock" on public.captains for insert to authenticated with check (
  manager_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and now() < w.captain_locks_at)
);
create policy "authenticated users read results" on public.weekly_results for select to authenticated using (true);

-- Picks intentionally have no direct INSERT policy. A security-definer transaction
-- will validate turn order, deadlines, eligibility, and roster shape atomically.
create or replace function public.make_draft_pick(p_week_id uuid, p_player_id text)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.weeks;
  v_pick_number integer;
  v_expected_manager uuid;
  v_position text;
  v_slot text;
  v_result public.draft_picks;
  v_position_count integer;
  v_skill_count integer;
begin
  select * into v_week from public.weeks where id = p_week_id for update;
  if not found or now() < v_week.draft_opens_at or now() > v_week.draft_closes_at then raise exception 'Draft is not open'; end if;
  select count(*) + 1 into v_pick_number from public.draft_picks where week_id = p_week_id;
  if v_pick_number > 14 then raise exception 'Draft is complete'; end if;
  if mod(v_pick_number, 2) = 1 then v_expected_manager := v_week.first_manager_id;
  else select id into v_expected_manager from public.profiles where id <> v_week.first_manager_id order by created_at limit 1;
  end if;
  if auth.uid() <> v_expected_manager then raise exception 'It is not your turn'; end if;
  select np.position into v_position
    from public.week_players wp join public.nfl_players np on np.id = wp.player_id
    where wp.week_id = p_week_id and wp.player_id = p_player_id and wp.available
      and np.status not in ('out', 'inactive', 'bye') and (wp.game_starts_at is null or now() < wp.game_starts_at);
  if not found then raise exception 'Player is unavailable'; end if;
  select count(*) into v_position_count from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id
    where dp.week_id = p_week_id and dp.manager_id = auth.uid() and np.position = v_position;
  select count(*) into v_skill_count from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id
    where dp.week_id = p_week_id and dp.manager_id = auth.uid() and np.position in ('RB', 'WR', 'TE');
  v_slot := case
    when v_position = 'QB' and v_position_count = 0 then 'QB'
    when v_position = 'RB' and v_position_count = 0 then 'RB1'
    when v_position = 'RB' and v_position_count = 1 then 'RB2'
    when v_position = 'WR' and v_position_count = 0 then 'WR1'
    when v_position = 'WR' and v_position_count = 1 then 'WR2'
    when v_position = 'TE' and v_position_count = 0 then 'TE'
    when v_position in ('RB', 'WR', 'TE') and v_skill_count < 6 then 'FLEX'
    else null end;
  if v_slot is null then raise exception 'Player does not fit an open roster slot'; end if;
  insert into public.draft_picks (week_id, pick_number, manager_id, player_id, roster_slot)
    values (p_week_id, v_pick_number, auth.uid(), p_player_id, v_slot) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.make_draft_pick(uuid, text) from public;
grant execute on function public.make_draft_pick(uuid, text) to authenticated;

alter publication supabase_realtime add table public.draft_picks;
