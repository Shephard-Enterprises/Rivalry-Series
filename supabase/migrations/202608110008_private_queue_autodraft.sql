create or replace function public.open_roster_slot(p_week_id uuid, p_manager_id uuid, p_player_id text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_position text;
  v_position_count integer;
  v_skill_count integer;
begin
  select position into v_position from public.nfl_players where id = p_player_id;
  if not found then return null; end if;

  select count(*) into v_position_count
    from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id
    where dp.week_id = p_week_id and dp.manager_id = p_manager_id and np.position = v_position;
  select count(*) into v_skill_count
    from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id
    where dp.week_id = p_week_id and dp.manager_id = p_manager_id and np.position in ('RB', 'WR', 'TE');

  return case
    when v_position = 'QB' and v_position_count = 0 then 'QB'
    when v_position = 'RB' and v_position_count = 0 then 'RB1'
    when v_position = 'RB' and v_position_count = 1 then 'RB2'
    when v_position = 'WR' and v_position_count = 0 then 'WR1'
    when v_position = 'WR' and v_position_count = 1 then 'WR2'
    when v_position = 'TE' and v_position_count = 0 then 'TE'
    when v_position in ('RB', 'WR', 'TE') and v_skill_count < 6 then 'FLEX'
    else null
  end;
end;
$$;

create or replace function public.set_draft_queue(p_week_id uuid, p_player_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager uuid := auth.uid();
  v_closes_at timestamptz;
  v_player_id text;
  v_priority integer := 0;
begin
  if v_manager is null then raise exception 'Sign in to manage your queue'; end if;
  select draft_closes_at into v_closes_at from public.weeks where id = p_week_id;
  if not found or now() >= v_closes_at then raise exception 'The draft queue is locked'; end if;
  if coalesce(array_length(p_player_ids, 1), 0) > 50 then raise exception 'Queue is limited to 50 players'; end if;
  if (select count(*) from unnest(coalesce(p_player_ids, array[]::text[]))) <>
     (select count(distinct item) from unnest(coalesce(p_player_ids, array[]::text[])) item) then
    raise exception 'A player can only appear once in your queue';
  end if;

  delete from public.draft_queue where week_id = p_week_id and manager_id = v_manager;
  foreach v_player_id in array coalesce(p_player_ids, array[]::text[]) loop
    if not exists (
      select 1 from public.week_players wp join public.nfl_players np on np.id = wp.player_id
      where wp.week_id = p_week_id and wp.player_id = v_player_id and wp.available
        and np.status not in ('out', 'inactive', 'bye')
        and not exists (select 1 from public.draft_picks dp where dp.week_id = p_week_id and dp.player_id = v_player_id)
    ) then raise exception 'Queued player is unavailable'; end if;
    v_priority := v_priority + 1;
    insert into public.draft_queue (week_id, manager_id, player_id, priority)
      values (p_week_id, v_manager, v_player_id, v_priority);
  end loop;
end;
$$;

revoke all on function public.set_draft_queue(uuid, text[]) from public;
grant execute on function public.set_draft_queue(uuid, text[]) to authenticated;

create or replace function public.process_expired_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.weeks;
  v_pick_number integer;
  v_manager uuid;
  v_player_id text;
  v_slot text;
  v_added integer := 0;
begin
  for v_week in
    select * from public.weeks
    where draft_closes_at <= now() and status in ('scheduled', 'drafting')
    order by draft_closes_at for update skip locked
  loop
    loop
      select count(*) + 1 into v_pick_number from public.draft_picks where week_id = v_week.id;
      exit when v_pick_number > 14;
      if mod(v_pick_number, 2) = 1 then v_manager := v_week.first_manager_id;
      else select id into v_manager from public.profiles where id <> v_week.first_manager_id order by created_at limit 1;
      end if;

      select dq.player_id into v_player_id
        from public.draft_queue dq
        join public.week_players wp on wp.week_id = dq.week_id and wp.player_id = dq.player_id
        join public.nfl_players np on np.id = dq.player_id
        where dq.week_id = v_week.id and dq.manager_id = v_manager and wp.available
          and np.status not in ('out', 'inactive', 'bye')
          and (wp.game_starts_at is null or now() < wp.game_starts_at)
          and not exists (select 1 from public.draft_picks dp where dp.week_id = v_week.id and dp.player_id = dq.player_id)
          and public.open_roster_slot(v_week.id, v_manager, dq.player_id) is not null
        order by dq.priority limit 1;

      if v_player_id is null then
        select candidate.player_id into v_player_id from (
          select wp.player_id
          from public.week_players wp join public.nfl_players np on np.id = wp.player_id
          where wp.week_id = v_week.id and wp.available and np.status not in ('out', 'inactive', 'bye')
            and (wp.game_starts_at is null or now() < wp.game_starts_at)
            and not exists (select 1 from public.draft_picks dp where dp.week_id = v_week.id and dp.player_id = wp.player_id)
            and public.open_roster_slot(v_week.id, v_manager, wp.player_id) is not null
          order by wp.ranking nulls last, wp.projection desc nulls last, np.full_name
          offset 4 limit 1
        ) candidate;
      end if;

      -- Small late-season pools may have fewer than five legal options.
      if v_player_id is null then
        select wp.player_id into v_player_id
          from public.week_players wp join public.nfl_players np on np.id = wp.player_id
          where wp.week_id = v_week.id and wp.available and np.status not in ('out', 'inactive', 'bye')
            and (wp.game_starts_at is null or now() < wp.game_starts_at)
            and not exists (select 1 from public.draft_picks dp where dp.week_id = v_week.id and dp.player_id = wp.player_id)
            and public.open_roster_slot(v_week.id, v_manager, wp.player_id) is not null
          order by wp.ranking nulls last, wp.projection desc nulls last, np.full_name limit 1;
      end if;
      if v_player_id is null then raise exception 'No legal auto-pick available for pick %', v_pick_number; end if;

      v_slot := public.open_roster_slot(v_week.id, v_manager, v_player_id);
      insert into public.draft_picks (week_id, pick_number, manager_id, player_id, roster_slot, is_auto_pick)
        values (v_week.id, v_pick_number, v_manager, v_player_id, v_slot, true);
      delete from public.draft_queue where week_id = v_week.id and player_id = v_player_id;
      v_player_id := null;
      v_added := v_added + 1;
    end loop;
    update public.weeks set status = 'captain_selection' where id = v_week.id;
  end loop;
  return v_added;
end;
$$;

revoke all on function public.process_expired_drafts() from public;

select cron.schedule(
  'process-expired-drafts',
  '* * * * *',
  $$select public.process_expired_drafts();$$
);
