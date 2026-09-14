-- Run independently of connected browsers. The week lock also serializes this
-- worker with manual picks and the existing draft-deadline worker.
create or replace function public.process_timed_queue_picks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week public.weeks;
  v_pick integer;
  v_turn_started_at timestamptz;
  v_manager uuid;
  v_player_id text;
  v_added integer := 0;
begin
  for v_week in
    select * from public.weeks
    where not is_test and status in ('scheduled', 'drafting')
      and draft_opens_at <= now() and draft_closes_at > now()
    order by draft_opens_at for update skip locked
  loop
    select count(*) + 1, greatest(v_week.draft_opens_at, max(picked_at))
      into v_pick, v_turn_started_at
      from public.draft_picks where week_id = v_week.id;
    if v_pick > 14 or now() < v_turn_started_at + interval '5 minutes' then
      continue;
    end if;

    if mod(v_pick, 2) = 1 then
      v_manager := v_week.first_manager_id;
    else
      select id into v_manager from public.profiles
        where id <> v_week.first_manager_id order by created_at limit 1;
    end if;

    select dq.player_id into v_player_id
      from public.draft_queue dq
      join public.week_players wp on wp.week_id = dq.week_id and wp.player_id = dq.player_id
      join public.nfl_players np on np.id = dq.player_id
      where dq.week_id = v_week.id and dq.manager_id = v_manager and wp.available
        and np.status not in ('out', 'inactive', 'bye')
        and (wp.game_starts_at is null or now() < wp.game_starts_at)
        and not exists (
          select 1 from public.draft_picks dp
          where dp.week_id = v_week.id and dp.player_id = dq.player_id
        )
        and public.open_roster_slot(v_week.id, v_manager, dq.player_id) is not null
      order by dq.priority limit 1;
    if v_player_id is null then continue; end if;

    insert into public.draft_picks (week_id, pick_number, manager_id, player_id, roster_slot, is_auto_pick)
      values (v_week.id, v_pick, v_manager, v_player_id,
        public.open_roster_slot(v_week.id, v_manager, v_player_id), true);
    delete from public.draft_queue where week_id = v_week.id and player_id = v_player_id;
    if v_pick = 14 then
      update public.weeks set status = 'captain_selection' where id = v_week.id;
    end if;
    -- Only one pick per week per run, so the next manager gets a fresh clock.
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

revoke all on function public.process_timed_queue_picks() from public;

-- Picks happen on the first minute tick at or after five minutes on the clock.
select cron.schedule(
  'process-timed-queue-picks',
  '* * * * *',
  $$select public.process_timed_queue_picks();$$
);
