create or replace function public.create_next_regular_week(p_finished_week_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finished public.weeks;
  v_next_number integer;
  v_first_game timestamptz;
  v_first_manager uuid;
  v_next_id uuid;
  v_local_monday date;
begin
  select * into v_finished from public.weeks where id = p_finished_week_id;
  if not found or v_finished.nfl_week >= 18 then return null; end if;
  v_next_number := v_finished.nfl_week + 1;

  select id into v_next_id from public.weeks
    where season = v_finished.season and nfl_week = v_next_number;
  if v_next_id is not null then return v_next_id; end if;

  select min(starts_at) into v_first_game from public.nfl_games
    where season = v_finished.season and season_type = 'REG' and nfl_week = v_next_number;
  if v_first_game is null then return null; end if;

  select id into v_first_manager from public.profiles
    where id <> v_finished.first_manager_id order by created_at limit 1;
  v_local_monday := date_trunc('week', v_first_game at time zone 'America/Los_Angeles')::date;

  insert into public.weeks (
    season, nfl_week, status, first_manager_id,
    draft_opens_at, draft_closes_at, captain_locks_at
  ) values (
    v_finished.season, v_next_number, 'scheduled', v_first_manager,
    (v_local_monday + time '00:00') at time zone 'America/Los_Angeles',
    (v_local_monday + 2 + time '23:59') at time zone 'America/Los_Angeles',
    v_first_game
  ) returning id into v_next_id;

  insert into public.week_players (week_id, player_id, ranking, available)
  select v_next_id, id,
    search_rank,
    active and status not in ('out', 'inactive', 'bye')
  from public.nfl_players where active and position in ('QB', 'RB', 'WR', 'TE')
  on conflict (week_id, player_id) do nothing;
  perform public.apply_week_schedule(v_next_id);
  return v_next_id;
end;
$$;

create or replace function public.advance_week_lifecycle()
returns table (weeks_advanced integer, weeks_finalized integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.weeks;
  v_score record;
  v_score_count integer;
  v_final_count integer;
  v_advanced integer := 0;
  v_finalized integer := 0;
begin
  update public.weeks set status = 'drafting'
    where status = 'scheduled' and now() >= draft_opens_at and now() < draft_closes_at;
  get diagnostics v_advanced = row_count;

  -- This fills every missing pick and changes expired drafts to captain selection.
  perform public.process_expired_drafts();

  update public.weeks w set status = 'captain_selection'
    where w.status = 'drafting'
      and (select count(*) from public.draft_picks dp where dp.week_id = w.id) = 14;
  get diagnostics v_final_count = row_count;
  v_advanced := v_advanced + v_final_count;

  update public.weeks set status = 'live'
    where status = 'captain_selection' and now() >= captain_locks_at;
  get diagnostics v_final_count = row_count;
  v_advanced := v_advanced + v_final_count;

  for v_week in select * from public.weeks where status = 'live' for update skip locked loop
    select count(*), count(*) filter (where roster_size = 7 and players_final = 7 and is_official)
      into v_score_count, v_final_count
      from public.manager_week_scores where week_id = v_week.id;
    if v_score_count = 2 and v_final_count = 2 then
      for v_score in select * from public.manager_week_scores where week_id = v_week.id loop
        insert into public.weekly_results (week_id, manager_id, fantasy_points, result)
        values (
          v_week.id,
          v_score.manager_id,
          v_score.fantasy_points,
          case
            when v_score.fantasy_points = (select fantasy_points from public.manager_week_scores where week_id = v_week.id and manager_id <> v_score.manager_id) then 'tie'
            when v_score.fantasy_points > (select fantasy_points from public.manager_week_scores where week_id = v_week.id and manager_id <> v_score.manager_id) then 'win'
            else 'loss'
          end
        )
        on conflict (week_id, manager_id) do update set
          fantasy_points = excluded.fantasy_points, result = excluded.result;
      end loop;
      update public.weeks set status = 'final', finalized_at = now() where id = v_week.id;
      perform public.create_next_regular_week(v_week.id);
      v_finalized := v_finalized + 1;
    end if;
  end loop;
  return query select v_advanced, v_finalized;
end;
$$;

revoke all on function public.create_next_regular_week(uuid) from public;
revoke all on function public.advance_week_lifecycle() from public;

select cron.schedule(
  'advance-week-lifecycle',
  '* * * * *',
  $$select * from public.advance_week_lifecycle();$$
);

alter publication supabase_realtime add table public.weeks;
alter publication supabase_realtime add table public.weekly_results;
