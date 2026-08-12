alter table public.nfl_players
  add column if not exists api_sports_id text;

create unique index if not exists nfl_players_api_sports_id_idx
  on public.nfl_players (api_sports_id) where api_sports_id is not null;

create table public.player_week_stats (
  week_id uuid not null references public.weeks(id) on delete cascade,
  player_id text not null references public.nfl_players(id) on delete cascade,
  passing_yards numeric not null default 0,
  passing_touchdowns integer not null default 0,
  interceptions integer not null default 0,
  rushing_yards numeric not null default 0,
  rushing_touchdowns integer not null default 0,
  receptions integer not null default 0,
  receiving_yards numeric not null default 0,
  receiving_touchdowns integer not null default 0,
  fumbles_lost integer not null default 0,
  two_point_conversions integer not null default 0,
  game_status text not null default 'scheduled',
  source text not null,
  source_game_id text,
  is_official boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (week_id, player_id)
);

create or replace function public.half_ppr_points(
  passing_yards numeric,
  passing_touchdowns integer,
  interceptions integer,
  rushing_yards numeric,
  rushing_touchdowns integer,
  receptions integer,
  receiving_yards numeric,
  receiving_touchdowns integer,
  fumbles_lost integer,
  two_point_conversions integer
)
returns numeric
language sql
immutable
parallel safe
return round((
  coalesce(passing_yards, 0) / 25.0
  + coalesce(passing_touchdowns, 0) * 4
  - coalesce(interceptions, 0) * 2
  + coalesce(rushing_yards, 0) / 10.0
  + coalesce(rushing_touchdowns, 0) * 6
  + coalesce(receptions, 0) * 0.5
  + coalesce(receiving_yards, 0) / 10.0
  + coalesce(receiving_touchdowns, 0) * 6
  - coalesce(fumbles_lost, 0) * 2
  + coalesce(two_point_conversions, 0) * 2
)::numeric, 2);

create view public.player_fantasy_scores
with (security_invoker = true)
as
select
  s.week_id,
  s.player_id,
  public.half_ppr_points(
    s.passing_yards, s.passing_touchdowns, s.interceptions,
    s.rushing_yards, s.rushing_touchdowns, s.receptions,
    s.receiving_yards, s.receiving_touchdowns, s.fumbles_lost,
    s.two_point_conversions
  ) as fantasy_points,
  s.game_status,
  s.is_official,
  s.updated_at
from public.player_week_stats s;

create view public.manager_week_scores
with (security_invoker = true)
as
select
  dp.week_id,
  dp.manager_id,
  round(coalesce(sum(
    coalesce(fs.fantasy_points, 0)
    * case when c.player_id = dp.player_id then 1.25 else 1 end
  ), 0), 2) as fantasy_points,
  count(*) filter (where fs.game_status = 'final') as players_final,
  count(*) as roster_size,
  bool_and(coalesce(fs.is_official, false)) as is_official
from public.draft_picks dp
left join public.player_fantasy_scores fs on fs.week_id = dp.week_id and fs.player_id = dp.player_id
left join public.captains c on c.week_id = dp.week_id and c.manager_id = dp.manager_id
group by dp.week_id, dp.manager_id;

alter table public.player_week_stats enable row level security;
create policy "authenticated users read player stats"
  on public.player_week_stats for select to authenticated using (true);

grant select on public.player_fantasy_scores to authenticated;
grant select on public.manager_week_scores to authenticated;
