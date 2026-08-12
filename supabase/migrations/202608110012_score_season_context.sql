create or replace view public.player_fantasy_scores
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
  s.updated_at,
  w.season,
  w.nfl_week,
  w.is_test
from public.player_week_stats s
join public.weeks w on w.id = s.week_id;

grant select on public.player_fantasy_scores to authenticated;
