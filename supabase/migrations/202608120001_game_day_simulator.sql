create table public.practice_simulation_events (
  id bigint generated always as identity primary key,
  week_id uuid not null references public.weeks(id) on delete cascade,
  stage text not null check (stage in ('thursday', 'sunday', 'monday')),
  summary text not null,
  created_at timestamptz not null default now(),
  unique (week_id, stage)
);

alter table public.practice_simulation_events enable row level security;
create policy "commissioner reads practice events" on public.practice_simulation_events
  for select to authenticated using (auth.uid() = 'ec754195-3838-4986-9b84-6d8b6d9dadcd'::uuid);

create or replace function public.practice_simulate_game_stage(p_stage text)
returns void language plpgsql security definer set search_path = public as $$
declare v_week_id uuid; v_stage_number integer; v_manager record; v_other_score numeric;
begin
  perform public.require_test_commissioner();
  if p_stage not in ('thursday', 'sunday', 'monday') then raise exception 'Unknown game stage'; end if;
  select id into v_week_id from public.weeks where is_test;
  if v_week_id is null then raise exception 'Start a practice week first'; end if;
  if (select count(*) from public.draft_picks where week_id = v_week_id) <> 14 then raise exception 'Complete the practice draft first'; end if;
  if (select count(*) from public.captains where week_id = v_week_id) <> 2 then raise exception 'Choose both captains first'; end if;
  v_stage_number := case p_stage when 'thursday' then 1 when 'sunday' then 2 else 3 end;

  update public.weeks set status = 'live', captain_locks_at = least(captain_locks_at, now() - interval '1 second') where id = v_week_id and status <> 'final';
  insert into public.player_week_stats (
    week_id, player_id, passing_yards, passing_touchdowns, interceptions,
    rushing_yards, rushing_touchdowns, receptions, receiving_yards,
    receiving_touchdowns, fumbles_lost, two_point_conversions,
    game_status, source, source_game_id, is_official, updated_at
  )
  select v_week_id, dp.player_id,
    case when np.position = 'QB' then 205 + dp.pick_number * 7 else 0 end,
    case when np.position = 'QB' then 1 + mod(dp.pick_number, 3) else 0 end,
    case when np.position = 'QB' and mod(dp.pick_number, 4) = 0 then 1 else 0 end,
    case when np.position = 'RB' then 42 + dp.pick_number * 4 else 3 + mod(dp.pick_number, 8) end,
    case when np.position = 'RB' and mod(dp.pick_number, 3) <> 1 then 1 else 0 end,
    case when np.position in ('WR','TE') then 3 + mod(dp.pick_number, 6) else 1 end,
    case when np.position in ('WR','TE') then 35 + dp.pick_number * 5 else 4 end,
    case when np.position in ('WR','TE') and mod(dp.pick_number, 4) in (0, 1) then 1 else 0 end,
    case when dp.pick_number = 11 then 1 else 0 end, 0,
    'final', 'practice', 'practice-' || p_stage, true, now()
  from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id
  where dp.week_id = v_week_id and (
    (v_stage_number >= 1 and dp.pick_number in (1, 4, 8, 11))
    or (v_stage_number >= 2 and dp.pick_number in (2, 3, 5, 6, 9, 10, 12, 13))
    or (v_stage_number >= 3 and dp.pick_number in (7, 14))
  )
  on conflict (week_id, player_id) do update set
    passing_yards = excluded.passing_yards, passing_touchdowns = excluded.passing_touchdowns,
    interceptions = excluded.interceptions, rushing_yards = excluded.rushing_yards,
    rushing_touchdowns = excluded.rushing_touchdowns, receptions = excluded.receptions,
    receiving_yards = excluded.receiving_yards, receiving_touchdowns = excluded.receiving_touchdowns,
    fumbles_lost = excluded.fumbles_lost, game_status = 'final', source = 'practice',
    source_game_id = excluded.source_game_id, is_official = true, updated_at = now();

  insert into public.practice_simulation_events (week_id, stage, summary) values (
    v_week_id, p_stage,
    case p_stage when 'thursday' then 'Thursday night is final. Four players are in the books.'
      when 'sunday' then 'The Sunday slate is complete. Only the Monday night players remain.'
      else 'Monday night is final. The practice matchup and recap are complete.' end
  ) on conflict (week_id, stage) do nothing;

  if p_stage = 'monday' then
    delete from public.weekly_results where week_id = v_week_id;
    for v_manager in select manager_id, fantasy_points from public.manager_week_scores where week_id = v_week_id loop
      select fantasy_points into v_other_score from public.manager_week_scores where week_id = v_week_id and manager_id <> v_manager.manager_id;
      insert into public.weekly_results (week_id, manager_id, fantasy_points, result) values (
        v_week_id, v_manager.manager_id, v_manager.fantasy_points,
        case when v_manager.fantasy_points > v_other_score then 'win' when v_manager.fantasy_points < v_other_score then 'loss' else 'tie' end
      );
    end loop;
    update public.weeks set status = 'final', finalized_at = now() where id = v_week_id;
  end if;
end;
$$;

revoke all on function public.practice_simulate_game_stage(text) from public;
grant execute on function public.practice_simulate_game_stage(text) to authenticated;
