create or replace function public.select_captain(p_week_id uuid, p_player_id text)
returns public.captains
language plpgsql
security definer
set search_path = public
as $$
declare v_week public.weeks; v_result public.captains;
begin
  if auth.uid() is null then raise exception 'Sign in to choose a captain'; end if;
  select * into v_week from public.weeks where id = p_week_id for update;
  if not found or v_week.is_test or v_week.status <> 'captain_selection' or now() >= v_week.captain_locks_at then
    raise exception 'Captain selection is locked';
  end if;
  if exists (select 1 from public.captains where week_id = p_week_id and manager_id = auth.uid()) then
    raise exception 'Your captain is already locked';
  end if;
  if not exists (
    select 1 from public.draft_picks
    where week_id = p_week_id and manager_id = auth.uid() and player_id = p_player_id
  ) then raise exception 'Captain must be on your roster'; end if;
  insert into public.captains (week_id, manager_id, player_id)
  values (p_week_id, auth.uid(), p_player_id) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.select_captain(uuid, text) from public;
grant execute on function public.select_captain(uuid, text) to authenticated;

create or replace function public.practice_select_captain(p_manager_id uuid, p_player_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_week_id uuid;
begin
  perform public.require_test_commissioner();
  select id into v_week_id from public.weeks where is_test;
  if exists (select 1 from public.captains where week_id = v_week_id and manager_id = p_manager_id) then
    raise exception 'Practice captain is already locked';
  end if;
  if not exists (select 1 from public.draft_picks where week_id = v_week_id and manager_id = p_manager_id and player_id = p_player_id) then
    raise exception 'Captain must be on that practice roster';
  end if;
  insert into public.captains (week_id, manager_id, player_id) values (v_week_id, p_manager_id, p_player_id);
end;
$$;

revoke all on function public.practice_select_captain(uuid, text) from public;
grant execute on function public.practice_select_captain(uuid, text) to authenticated;

create or replace function public.practice_force_autodraft()
returns integer language plpgsql security definer set search_path = public as $$
declare v_week public.weeks; v_pick integer; v_manager uuid; v_player_id text; v_slot text; v_added integer := 0;
begin
  perform public.require_test_commissioner();
  select * into v_week from public.weeks where is_test for update;
  if not found then raise exception 'Start a practice week first'; end if;
  loop
    select count(*) + 1 into v_pick from public.draft_picks where week_id = v_week.id;
    exit when v_pick > 14;
    if mod(v_pick, 2) = 1 then v_manager := v_week.first_manager_id;
    else select id into v_manager from public.profiles where id <> v_week.first_manager_id order by created_at limit 1; end if;
    select wp.player_id into v_player_id
    from public.week_players wp join public.nfl_players np on np.id = wp.player_id
    where wp.week_id = v_week.id and wp.available and np.status not in ('out', 'inactive', 'bye')
      and not exists (select 1 from public.draft_picks dp where dp.week_id = v_week.id and dp.player_id = wp.player_id)
      and public.open_roster_slot(v_week.id, v_manager, wp.player_id) is not null
    order by wp.ranking nulls last, wp.projection desc nulls last, np.full_name offset 4 limit 1;
    if v_player_id is null then
      select wp.player_id into v_player_id
      from public.week_players wp join public.nfl_players np on np.id = wp.player_id
      where wp.week_id = v_week.id and wp.available and np.status not in ('out', 'inactive', 'bye')
        and not exists (select 1 from public.draft_picks dp where dp.week_id = v_week.id and dp.player_id = wp.player_id)
        and public.open_roster_slot(v_week.id, v_manager, wp.player_id) is not null
      order by wp.ranking nulls last, wp.projection desc nulls last, np.full_name limit 1;
    end if;
    if v_player_id is null then raise exception 'No legal practice auto-pick available for pick %', v_pick; end if;
    v_slot := public.open_roster_slot(v_week.id, v_manager, v_player_id);
    insert into public.draft_picks (week_id, pick_number, manager_id, player_id, roster_slot, is_auto_pick)
    values (v_week.id, v_pick, v_manager, v_player_id, v_slot, true);
    v_player_id := null; v_added := v_added + 1;
  end loop;
  update public.weeks set status = 'captain_selection' where id = v_week.id;
  return v_added;
end;
$$;

revoke all on function public.practice_force_autodraft() from public;
grant execute on function public.practice_force_autodraft() to authenticated;

create or replace function public.run_practice_readiness_test()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_week_id uuid; v_manager record; v_player_id text;
begin
  perform public.require_test_commissioner();
  delete from public.weeks where is_test;
  v_week_id := public.start_practice_week();
  perform public.practice_force_autodraft();
  for v_manager in select id from public.profiles order by created_at loop
    select player_id into v_player_id from public.draft_picks
      where week_id = v_week_id and manager_id = v_manager.id order by pick_number limit 1;
    perform public.practice_select_captain(v_manager.id, v_player_id);
  end loop;
  perform public.practice_simulate_game_stage('thursday');
  perform public.practice_simulate_game_stage('sunday');
  perform public.practice_simulate_game_stage('monday');
  return jsonb_build_object(
    'week_id', v_week_id,
    'picks', (select count(*) from public.draft_picks where week_id = v_week_id),
    'captains', (select count(*) from public.captains where week_id = v_week_id),
    'game_windows', (select count(*) from public.practice_simulation_events where week_id = v_week_id),
    'results', (select count(*) from public.weekly_results where week_id = v_week_id),
    'recap_ready', exists(select 1 from public.weekly_recaps where week_id = v_week_id),
    'status', (select status from public.weeks where id = v_week_id)
  );
end;
$$;

revoke all on function public.run_practice_readiness_test() from public;
grant execute on function public.run_practice_readiness_test() to authenticated;

-- The staged simulator superseded this older all-at-once practice helper.
-- Removing client execution prevents it from accidentally advancing a fake
-- 2099 season into the real-week lifecycle.
revoke execute on function public.practice_simulate_final_scores() from authenticated;
