create or replace view public.matchup_player_scores
with (security_invoker = true)
as
select
  dp.week_id,
  dp.manager_id,
  p.display_name as manager_name,
  dp.player_id,
  np.full_name,
  np.position,
  np.nfl_team,
  np.headshot_url,
  dp.roster_slot,
  (c.player_id = dp.player_id) as is_captain,
  coalesce(fs.fantasy_points, 0) as raw_points,
  round(coalesce(fs.fantasy_points, 0) * case when c.player_id = dp.player_id then 1.25 else 1 end, 2) as counted_points,
  wp.projection,
  wp.opponent,
  coalesce(fs.game_status, 'scheduled') as game_status,
  coalesce(fs.is_official, false) as is_official,
  case
    when coalesce(fs.game_status, 'scheduled') = 'final' then 0
    else greatest(coalesce(wp.projection, 0) - coalesce(fs.fantasy_points, 0), 0)
  end as projected_remaining
from public.draft_picks dp
join public.profiles p on p.id = dp.manager_id
join public.nfl_players np on np.id = dp.player_id
left join public.week_players wp on wp.week_id = dp.week_id and wp.player_id = dp.player_id
left join public.player_fantasy_scores fs on fs.week_id = dp.week_id and fs.player_id = dp.player_id
left join public.captains c on c.week_id = dp.week_id and c.manager_id = dp.manager_id;

create or replace view public.manager_win_probabilities
with (security_invoker = true)
as
with manager_estimates as (
  select
    week_id, manager_id, manager_name,
    sum(counted_points) as current_points,
    sum((raw_points + projected_remaining) * case when is_captain then 1.25 else 1 end) as projected_final,
    count(*) filter (where game_status <> 'final') as players_remaining
  from public.matchup_player_scores
  group by week_id, manager_id, manager_name
), paired as (
  select m.*, o.projected_final as opponent_projected_final,
    m.players_remaining + o.players_remaining as total_players_remaining
  from manager_estimates m
  join manager_estimates o on o.week_id = m.week_id and o.manager_id <> m.manager_id
)
select
  week_id, manager_id, manager_name,
  round(current_points, 2) as current_points,
  round(projected_final, 2) as projected_final,
  players_remaining,
  case when total_players_remaining = 0 then
    case when projected_final > opponent_projected_final then 100.0
         when projected_final < opponent_projected_final then 0.0 else 50.0 end
  else round((100.0 / (1.0 + exp(-((projected_final - opponent_projected_final) /
    greatest(8.0, sqrt(total_players_remaining::numeric) * 6.0)))))::numeric, 1)
  end as win_probability
from paired;

create table public.win_probability_snapshots (
  week_id uuid not null references public.weeks(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  probability numeric(5,1) not null,
  projected_final numeric(8,2) not null,
  updated_at timestamptz not null default now(),
  primary key (week_id, manager_id)
);

alter table public.win_probability_snapshots enable row level security;
create policy "authenticated users read win probabilities" on public.win_probability_snapshots
  for select to authenticated using (true);
grant select on public.matchup_player_scores to authenticated;
grant select on public.manager_win_probabilities to authenticated;

create or replace function public.refresh_win_probabilities(p_week_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_current record; v_previous numeric;
begin
  if exists (select 1 from public.weeks where id = p_week_id and is_test) then return; end if;
  for v_current in select * from public.manager_win_probabilities where week_id = p_week_id loop
    select probability into v_previous from public.win_probability_snapshots
      where week_id = p_week_id and manager_id = v_current.manager_id;
    if v_previous is not null and (
      (v_previous <= 50 and v_current.win_probability > 50)
      or v_current.win_probability - v_previous >= 20
    ) then
      insert into public.notifications (recipient_id, week_id, type, title, body, data)
      values (
        v_current.manager_id, p_week_id, 'win_probability',
        case when v_previous <= 50 and v_current.win_probability > 50 then 'You took the lead' else 'Your win odds just jumped' end,
        'You now have a ' || v_current.win_probability || '% chance to win.',
        jsonb_build_object('probability', v_current.win_probability, 'previous_probability', v_previous)
      );
    end if;
    insert into public.win_probability_snapshots (week_id, manager_id, probability, projected_final, updated_at)
    values (p_week_id, v_current.manager_id, v_current.win_probability, v_current.projected_final, now())
    on conflict (week_id, manager_id) do update set probability = excluded.probability,
      projected_final = excluded.projected_final, updated_at = now();
  end loop;
end;
$$;

revoke all on function public.refresh_win_probabilities(uuid) from public;
grant execute on function public.refresh_win_probabilities(uuid) to service_role;
alter publication supabase_realtime add table public.win_probability_snapshots;
