create table public.nfl_games (
  id text primary key,
  season integer not null,
  season_type text not null,
  nfl_week integer not null,
  starts_at timestamptz not null,
  away_team text not null,
  home_team text not null,
  status text not null default 'scheduled',
  source text not null default 'nflverse',
  updated_at timestamptz not null default now()
);

create index nfl_games_week_idx on public.nfl_games (season, season_type, nfl_week);
alter table public.nfl_games enable row level security;
create policy "authenticated users read games" on public.nfl_games for select to authenticated using (true);

create or replace function public.apply_week_schedule(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_season integer; v_week integer;
begin
  select season, nfl_week into v_season, v_week from public.weeks where id = p_week_id;

  update public.week_players wp
  set opponent = case when np.nfl_team = g.home_team then 'vs ' || g.away_team else '@ ' || g.home_team end,
      game_starts_at = g.starts_at,
      available = np.active and np.status not in ('out', 'inactive', 'bye') and now() < g.starts_at
  from public.nfl_players np, public.nfl_games g
  where wp.week_id = p_week_id and wp.player_id = np.id
    and g.season = v_season and g.season_type = 'REG' and g.nfl_week = v_week
    and np.nfl_team in (g.home_team, g.away_team);

  update public.week_players wp
  set available = false, opponent = 'BYE', game_starts_at = null
  from public.nfl_players np
  where wp.week_id = p_week_id and wp.player_id = np.id
    and not exists (
      select 1 from public.nfl_games g where g.season = v_season and g.season_type = 'REG'
        and g.nfl_week = v_week and np.nfl_team in (g.home_team, g.away_team)
    );
end;
$$;

revoke all on function public.apply_week_schedule(uuid) from public;
grant execute on function public.apply_week_schedule(uuid) to service_role;
