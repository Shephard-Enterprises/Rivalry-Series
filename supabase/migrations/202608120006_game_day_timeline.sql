create table public.game_day_events (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  event_key text not null,
  type text not null check (type in ('touchdown', 'milestone', 'captain', 'lead_change', 'player_final', 'matchup_final')),
  title text not null,
  body text not null,
  manager_id uuid references public.profiles(id),
  player_id text references public.nfl_players(id),
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (week_id, event_key)
);

create table public.game_day_player_snapshots (
  week_id uuid not null references public.weeks(id) on delete cascade,
  player_id text not null references public.nfl_players(id) on delete cascade,
  raw_points numeric not null default 0,
  counted_points numeric not null default 0,
  touchdowns integer not null default 0,
  game_status text not null default 'scheduled',
  primary key (week_id, player_id)
);

create table public.game_day_matchup_snapshots (
  week_id uuid primary key references public.weeks(id) on delete cascade,
  leader_id uuid references public.profiles(id),
  leader_score numeric not null default 0,
  opponent_score numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.game_day_events enable row level security;
alter table public.game_day_player_snapshots enable row level security;
alter table public.game_day_matchup_snapshots enable row level security;
create policy "managers read game day events" on public.game_day_events for select to authenticated using (true);

create or replace function public.record_game_day_timeline(p_week_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_player record; v_old public.game_day_player_snapshots; v_threshold integer; v_added integer := 0;
  v_leader record; v_opponent record; v_previous public.game_day_matchup_snapshots; v_final_count integer;
begin
  if exists (select 1 from public.weeks where id = p_week_id and is_test) then return 0; end if;
  for v_player in
    select mps.*, (coalesce(mps.passing_touchdowns,0) + coalesce(mps.rushing_touchdowns,0) + coalesce(mps.receiving_touchdowns,0))::integer as touchdowns
    from public.matchup_player_scores mps where mps.week_id = p_week_id
  loop
    select * into v_old from public.game_day_player_snapshots where week_id = p_week_id and player_id = v_player.player_id;
    if v_player.touchdowns > coalesce(v_old.touchdowns, 0) then
      insert into public.game_day_events (week_id, event_key, type, title, body, manager_id, player_id, data)
      values (p_week_id, 'td:' || v_player.player_id || ':' || v_player.touchdowns, 'touchdown', v_player.full_name || ' finds the end zone',
        v_player.manager_name || ' gets a touchdown from ' || v_player.full_name || '. ' || v_player.counted_points || ' fantasy points and counting.',
        v_player.manager_id, v_player.player_id, jsonb_build_object('points', v_player.counted_points, 'touchdowns', v_player.touchdowns)) on conflict do nothing;
      if found then v_added := v_added + 1; end if;
    end if;
    foreach v_threshold in array array[10,20,30] loop
      if v_player.raw_points >= v_threshold and coalesce(v_old.raw_points, 0) < v_threshold then
        insert into public.game_day_events (week_id, event_key, type, title, body, manager_id, player_id, data)
        values (p_week_id, 'milestone:' || v_player.player_id || ':' || v_threshold, case when v_player.is_captain then 'captain' else 'milestone' end,
          case when v_player.is_captain then 'Captain swing for ' || v_player.manager_name else v_player.full_name || ' reaches ' || v_threshold end,
          v_player.full_name || ' has crossed ' || v_threshold || ' raw points' || case when v_player.is_captain then ', worth ' || v_player.counted_points || ' with the captain boost.' else '.' end,
          v_player.manager_id, v_player.player_id, jsonb_build_object('raw_points', v_player.raw_points, 'counted_points', v_player.counted_points, 'threshold', v_threshold)) on conflict do nothing;
        if found then v_added := v_added + 1; end if;
      end if;
    end loop;
    if v_player.game_status = 'final' and coalesce(v_old.game_status, 'scheduled') <> 'final' then
      insert into public.game_day_events (week_id, event_key, type, title, body, manager_id, player_id, data)
      values (p_week_id, 'final:' || v_player.player_id, 'player_final', v_player.full_name || ' is final',
        v_player.manager_name || ' banks ' || v_player.counted_points || ' points from the ' || v_player.roster_slot || ' slot.',
        v_player.manager_id, v_player.player_id, jsonb_build_object('points', v_player.counted_points)) on conflict do nothing;
      if found then v_added := v_added + 1; end if;
    end if;
    insert into public.game_day_player_snapshots (week_id, player_id, raw_points, counted_points, touchdowns, game_status)
    values (p_week_id, v_player.player_id, v_player.raw_points, v_player.counted_points, v_player.touchdowns, v_player.game_status)
    on conflict (week_id, player_id) do update set raw_points = excluded.raw_points, counted_points = excluded.counted_points,
      touchdowns = excluded.touchdowns, game_status = excluded.game_status;
  end loop;

  select mws.manager_id, p.display_name, mws.fantasy_points into v_leader
    from public.manager_week_scores mws join public.profiles p on p.id = mws.manager_id
    where mws.week_id = p_week_id order by mws.fantasy_points desc, p.display_name limit 1;
  select mws.manager_id, p.display_name, mws.fantasy_points into v_opponent
    from public.manager_week_scores mws join public.profiles p on p.id = mws.manager_id
    where mws.week_id = p_week_id order by mws.fantasy_points asc, p.display_name desc limit 1;
  select * into v_previous from public.game_day_matchup_snapshots where week_id = p_week_id;
  if v_leader.fantasy_points > v_opponent.fantasy_points and v_previous.leader_id is not null and v_previous.leader_id <> v_leader.manager_id then
    insert into public.game_day_events (week_id, event_key, type, title, body, manager_id, data)
    values (p_week_id, 'lead:' || extract(epoch from now())::bigint, 'lead_change', v_leader.display_name || ' takes the lead',
      v_leader.display_name || ' moves ahead ' || v_leader.fantasy_points || '–' || v_opponent.fantasy_points || '.', v_leader.manager_id,
      jsonb_build_object('leader_score', v_leader.fantasy_points, 'opponent_score', v_opponent.fantasy_points)) on conflict do nothing;
    if found then v_added := v_added + 1; end if;
  end if;
  insert into public.game_day_matchup_snapshots (week_id, leader_id, leader_score, opponent_score, updated_at)
  values (p_week_id, case when v_leader.fantasy_points > v_opponent.fantasy_points then v_leader.manager_id else null end,
    v_leader.fantasy_points, v_opponent.fantasy_points, now()) on conflict (week_id) do update set
    leader_id = excluded.leader_id, leader_score = excluded.leader_score, opponent_score = excluded.opponent_score, updated_at = now();

  select count(*) into v_final_count from public.matchup_player_scores where week_id = p_week_id and game_status = 'final';
  if v_final_count = 14 then
    insert into public.game_day_events (week_id, event_key, type, title, body, manager_id, data)
    values (p_week_id, 'matchup-final', 'matchup_final', 'Final whistle',
      case when v_leader.fantasy_points = v_opponent.fantasy_points then 'The rivalry ends in a ' || v_leader.fantasy_points || '–' || v_opponent.fantasy_points || ' tie.'
      else v_leader.display_name || ' wins ' || v_leader.fantasy_points || '–' || v_opponent.fantasy_points || '.' end,
      case when v_leader.fantasy_points > v_opponent.fantasy_points then v_leader.manager_id else null end,
      jsonb_build_object('winner_score', v_leader.fantasy_points, 'loser_score', v_opponent.fantasy_points)) on conflict do nothing;
    if found then v_added := v_added + 1; end if;
  end if;
  return v_added;
end;
$$;

revoke all on function public.record_game_day_timeline(uuid) from public;
grant execute on function public.record_game_day_timeline(uuid) to service_role;
alter publication supabase_realtime add table public.game_day_events;
