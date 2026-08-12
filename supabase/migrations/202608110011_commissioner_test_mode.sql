alter table public.weeks add column if not exists is_test boolean not null default false;
create unique index if not exists one_active_test_week_idx on public.weeks (is_test) where is_test;

create or replace function public.require_test_commissioner()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() <> 'ec754195-3838-4986-9b84-6d8b6d9dadcd'::uuid then
    raise exception 'Commissioner test mode is restricted';
  end if;
end;
$$;

create or replace function public.start_practice_week()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_source uuid;
begin
  perform public.require_test_commissioner();
  select id into v_id from public.weeks where is_test limit 1;
  if v_id is not null then return v_id; end if;
  select id into v_source from public.weeks where not is_test order by season desc, nfl_week desc limit 1;
  insert into public.weeks (season, nfl_week, status, first_manager_id, draft_opens_at, draft_closes_at, captain_locks_at, is_test)
  values (2099, 1, 'drafting', 'ec754195-3838-4986-9b84-6d8b6d9dadcd', now() - interval '1 minute', now() + interval '2 hours', now() + interval '3 hours', true)
  returning id into v_id;
  insert into public.week_players (week_id, player_id, opponent, projection, ranking, available, game_starts_at)
  select v_id, player_id, 'Practice game', projection, ranking, available, now() + interval '3 hours'
  from public.week_players where week_id = v_source and available
  on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.practice_make_pick(p_player_id text)
returns public.draft_picks language plpgsql security definer set search_path = public as $$
declare v_week public.weeks; v_pick integer; v_manager uuid; v_slot text; v_result public.draft_picks;
begin
  perform public.require_test_commissioner();
  select * into v_week from public.weeks where is_test for update;
  if not found then raise exception 'Start a practice week first'; end if;
  select count(*) + 1 into v_pick from public.draft_picks where week_id = v_week.id;
  if v_pick > 14 then raise exception 'Practice draft is complete'; end if;
  if mod(v_pick, 2) = 1 then v_manager := v_week.first_manager_id;
  else select id into v_manager from public.profiles where id <> v_week.first_manager_id order by created_at limit 1; end if;
  if not exists (select 1 from public.week_players where week_id = v_week.id and player_id = p_player_id and available)
    or exists (select 1 from public.draft_picks where week_id = v_week.id and player_id = p_player_id) then raise exception 'Player is unavailable'; end if;
  v_slot := public.open_roster_slot(v_week.id, v_manager, p_player_id);
  if v_slot is null then raise exception 'Player does not fit the next manager roster'; end if;
  insert into public.draft_picks (week_id, pick_number, manager_id, player_id, roster_slot)
  values (v_week.id, v_pick, v_manager, p_player_id, v_slot) returning * into v_result;
  if v_pick = 14 then update public.weeks set status = 'captain_selection' where id = v_week.id; end if;
  return v_result;
end;
$$;

create or replace function public.practice_force_autodraft()
returns integer language plpgsql security definer set search_path = public as $$
declare v_added integer;
begin
  perform public.require_test_commissioner();
  update public.weeks set draft_closes_at = now() - interval '1 second' where is_test and status in ('scheduled', 'drafting');
  select public.process_expired_drafts() into v_added;
  return v_added;
end;
$$;

create or replace function public.practice_select_captain(p_manager_id uuid, p_player_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_week_id uuid;
begin
  perform public.require_test_commissioner();
  select id into v_week_id from public.weeks where is_test;
  if not exists (select 1 from public.draft_picks where week_id = v_week_id and manager_id = p_manager_id and player_id = p_player_id)
    then raise exception 'Captain must be on that practice roster'; end if;
  insert into public.captains (week_id, manager_id, player_id) values (v_week_id, p_manager_id, p_player_id)
  on conflict (week_id, manager_id) do update set player_id = excluded.player_id, selected_at = now();
end;
$$;

create or replace function public.practice_simulate_final_scores()
returns void language plpgsql security definer set search_path = public as $$
declare v_week_id uuid;
begin
  perform public.require_test_commissioner();
  select id into v_week_id from public.weeks where is_test;
  if (select count(*) from public.draft_picks where week_id = v_week_id) <> 14 then raise exception 'Complete the practice draft first'; end if;
  insert into public.player_week_stats (
    week_id, player_id, passing_yards, passing_touchdowns, interceptions,
    rushing_yards, rushing_touchdowns, receptions, receiving_yards,
    receiving_touchdowns, fumbles_lost, two_point_conversions,
    game_status, source, source_game_id, is_official, updated_at
  )
  select v_week_id, dp.player_id,
    case when np.position = 'QB' then 225 + dp.pick_number * 2 else 0 end,
    case when np.position = 'QB' then 2 else 0 end, 0,
    case when np.position = 'RB' then 55 + dp.pick_number else 5 end,
    case when np.position = 'RB' and mod(dp.pick_number, 3) = 0 then 1 else 0 end,
    case when np.position in ('WR','TE') then 4 + mod(dp.pick_number, 4) else 0 end,
    case when np.position in ('WR','TE') then 45 + dp.pick_number * 2 else 0 end,
    case when np.position in ('WR','TE') and mod(dp.pick_number, 4) = 0 then 1 else 0 end,
    0, 0, 'final', 'practice', 'practice-game', true, now()
  from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id where dp.week_id = v_week_id
  on conflict (week_id, player_id) do update set
    passing_yards = excluded.passing_yards, passing_touchdowns = excluded.passing_touchdowns,
    rushing_yards = excluded.rushing_yards, rushing_touchdowns = excluded.rushing_touchdowns,
    receptions = excluded.receptions, receiving_yards = excluded.receiving_yards,
    receiving_touchdowns = excluded.receiving_touchdowns, game_status = 'final',
    source = 'practice', is_official = true, updated_at = now();
  update public.weeks set status = 'live', captain_locks_at = now() - interval '1 second' where id = v_week_id;
  perform public.advance_week_lifecycle();
end;
$$;

create or replace function public.reset_practice_week()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_test_commissioner();
  delete from public.weeks where is_test;
end;
$$;

revoke all on function public.require_test_commissioner() from public;
revoke all on function public.start_practice_week() from public;
revoke all on function public.practice_make_pick(text) from public;
revoke all on function public.practice_force_autodraft() from public;
revoke all on function public.practice_select_captain(uuid, text) from public;
revoke all on function public.practice_simulate_final_scores() from public;
revoke all on function public.reset_practice_week() from public;
grant execute on function public.start_practice_week() to authenticated;
grant execute on function public.practice_make_pick(text) to authenticated;
grant execute on function public.practice_force_autodraft() to authenticated;
grant execute on function public.practice_select_captain(uuid, text) to authenticated;
grant execute on function public.practice_simulate_final_scores() to authenticated;
grant execute on function public.reset_practice_week() to authenticated;
