create or replace view public.matchup_player_scores
with (security_invoker = true)
as
select
  dp.week_id, dp.manager_id, p.display_name as manager_name, dp.player_id,
  np.full_name, np.position, np.nfl_team, np.headshot_url, dp.roster_slot,
  (c.player_id = dp.player_id) as is_captain,
  coalesce(fs.fantasy_points, 0) as raw_points,
  round(coalesce(fs.fantasy_points, 0) * case when c.player_id = dp.player_id then 1.25 else 1 end, 2) as counted_points,
  wp.projection, wp.opponent,
  coalesce(fs.game_status, 'scheduled') as game_status,
  coalesce(fs.is_official, false) as is_official,
  case when coalesce(fs.game_status, 'scheduled') = 'final' then 0
    else greatest(coalesce(wp.projection, 0) - coalesce(fs.fantasy_points, 0), 0) end as projected_remaining,
  wp.game_starts_at,
  coalesce(s.passing_yards, 0) as passing_yards,
  coalesce(s.passing_touchdowns, 0) as passing_touchdowns,
  coalesce(s.interceptions, 0) as interceptions,
  coalesce(s.rushing_yards, 0) as rushing_yards,
  coalesce(s.rushing_touchdowns, 0) as rushing_touchdowns,
  coalesce(s.receptions, 0) as receptions,
  coalesce(s.receiving_yards, 0) as receiving_yards,
  coalesce(s.receiving_touchdowns, 0) as receiving_touchdowns,
  coalesce(s.fumbles_lost, 0) as fumbles_lost,
  coalesce(s.two_point_conversions, 0) as two_point_conversions
from public.draft_picks dp
join public.profiles p on p.id = dp.manager_id
join public.nfl_players np on np.id = dp.player_id
left join public.week_players wp on wp.week_id = dp.week_id and wp.player_id = dp.player_id
left join public.player_fantasy_scores fs on fs.week_id = dp.week_id and fs.player_id = dp.player_id
left join public.player_week_stats s on s.week_id = dp.week_id and s.player_id = dp.player_id
left join public.captains c on c.week_id = dp.week_id and c.manager_id = dp.manager_id;

grant select on public.matchup_player_scores to authenticated;
