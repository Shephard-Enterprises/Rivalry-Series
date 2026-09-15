-- Serialize queue saves with manual and automatic picks.
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
  select draft_closes_at into v_closes_at from public.weeks where id = p_week_id for update;
  if not found or now() >= v_closes_at then raise exception 'The draft queue is locked'; end if;
  if coalesce(array_length(p_player_ids, 1), 0) > 50 then raise exception 'Queue is limited to 50 players'; end if;
  if (select count(*) from unnest(coalesce(p_player_ids, array[]::text[]))) <>
     (select count(distinct item) from unnest(coalesce(p_player_ids, array[]::text[])) item) then
    raise exception 'A player can only appear once in your queue';
  end if;

  delete from public.draft_queue where week_id = p_week_id and manager_id = v_manager;
  foreach v_player_id in array coalesce(p_player_ids, array[]::text[]) loop
    -- A manual pick can leave a stale entry in a client's submitted queue.
    -- Drop it rather than rejecting an unrelated addition or reorder.
    if exists (
      select 1 from public.draft_picks
      where week_id = p_week_id and player_id = v_player_id
    ) then continue; end if;
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

-- Remove historical entries hidden by the draft board.
delete from public.draft_queue dq
where exists (
  select 1 from public.draft_picks dp
  where dp.week_id = dq.week_id and dp.player_id = dq.player_id
);
