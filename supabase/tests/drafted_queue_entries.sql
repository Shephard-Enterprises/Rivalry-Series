-- Run against a database with an open, partially drafted week. Always rolls back.
begin;
do $$
declare
  v_week public.weeks;
  v_drafted text;
  v_players text[];
  v_saved text[];
begin
  select * into v_week from public.weeks
    where not is_test and draft_closes_at > now()
      and exists (select 1 from public.draft_picks where week_id = weeks.id)
    order by draft_opens_at limit 1 for update;
  if not found then raise exception 'Test requires an open, partially drafted week'; end if;
  perform set_config('request.jwt.claim.sub', v_week.first_manager_id::text, true);
  select player_id into v_drafted from public.draft_picks where week_id = v_week.id limit 1;
  select array_agg(player_id order by player_id) into v_players from (
    select wp.player_id from public.week_players wp
    join public.nfl_players np on np.id = wp.player_id
    where wp.week_id = v_week.id and wp.available
      and np.status not in ('out', 'inactive', 'bye')
      and not exists (select 1 from public.draft_picks dp where dp.week_id = wp.week_id and dp.player_id = wp.player_id)
    order by wp.player_id limit 2
  ) candidates;
  if array_length(v_players, 1) is distinct from 2 then raise exception 'Test requires two available players'; end if;

  perform public.set_draft_queue(v_week.id, array[v_drafted, v_players[2], v_players[1]]);
  select array_agg(player_id order by priority) into v_saved from public.draft_queue
    where week_id = v_week.id and manager_id = v_week.first_manager_id;
  if v_saved is distinct from array[v_players[2], v_players[1]] then
    raise exception 'Drafted entry was not discarded or priority order changed';
  end if;

  begin
    perform public.set_draft_queue(v_week.id, array['__nonexistent_queue_test_player__']);
    raise exception 'Unavailable player was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Queued player is unavailable' then raise; end if;
  end;
  select array_agg(player_id order by priority) into v_saved from public.draft_queue
    where week_id = v_week.id and manager_id = v_week.first_manager_id;
  if v_saved is distinct from array[v_players[2], v_players[1]] then
    raise exception 'Rejected update changed the saved queue';
  end if;

  perform public.set_draft_queue(v_week.id, array[]::text[]);
  if exists (select 1 from public.draft_queue where week_id = v_week.id and manager_id = v_week.first_manager_id) then
    raise exception 'Clearing queue failed';
  end if;
end;
$$;
rollback;
