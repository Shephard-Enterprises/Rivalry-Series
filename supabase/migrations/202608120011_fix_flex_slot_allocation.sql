create or replace function public.open_roster_slot(p_week_id uuid, p_manager_id uuid, p_player_id text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_position text;
  v_position_count integer;
  v_flex_open boolean;
begin
  select position into v_position from public.nfl_players where id = p_player_id;
  if not found then return null; end if;

  select count(*) into v_position_count
  from public.draft_picks dp join public.nfl_players np on np.id = dp.player_id
  where dp.week_id = p_week_id and dp.manager_id = p_manager_id and np.position = v_position;

  select not exists (
    select 1 from public.draft_picks
    where week_id = p_week_id and manager_id = p_manager_id and roster_slot = 'FLEX'
  ) into v_flex_open;

  return case
    when v_position = 'QB' and v_position_count = 0 then 'QB'
    when v_position = 'RB' and v_position_count = 0 then 'RB1'
    when v_position = 'RB' and v_position_count = 1 then 'RB2'
    when v_position = 'WR' and v_position_count = 0 then 'WR1'
    when v_position = 'WR' and v_position_count = 1 then 'WR2'
    when v_position = 'TE' and v_position_count = 0 then 'TE'
    when v_position in ('RB', 'WR', 'TE') and v_flex_open then 'FLEX'
    else null
  end;
end;
$$;
