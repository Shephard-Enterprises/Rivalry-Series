create table public.weekly_recaps (
  week_id uuid primary key references public.weeks(id) on delete cascade,
  headline text not null,
  winner_id uuid references public.profiles(id),
  winner_name text,
  loser_name text,
  winner_score numeric(8,2) not null,
  loser_score numeric(8,2) not null,
  margin numeric(8,2) not null,
  mvp_player_id text references public.nfl_players(id),
  mvp_name text not null,
  mvp_manager_name text not null,
  mvp_points numeric(8,2) not null,
  best_value_name text not null,
  best_value_manager_name text not null,
  best_value_points numeric(8,2) not null,
  disappointment_name text not null,
  disappointment_manager_name text not null,
  disappointment_points numeric(8,2) not null,
  captain_name text,
  captain_manager_name text,
  captain_bonus numeric(8,2) not null default 0,
  summary text not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.weekly_recaps enable row level security;
create policy "authenticated users read weekly recaps" on public.weekly_recaps
  for select to authenticated using (true);

create or replace function public.generate_scroober_scrimage_report(p_week_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_week public.weeks;
  v_winner record;
  v_loser record;
  v_mvp record;
  v_value record;
  v_disappointment record;
  v_captain record;
  v_headline text;
  v_summary text;
  v_margin numeric;
  v_tie boolean;
begin
  if exists (select 1 from public.weekly_recaps where week_id = p_week_id) then return; end if;
  select * into v_week from public.weeks where id = p_week_id;
  if not found then return; end if;

  select wr.manager_id, p.display_name, wr.fantasy_points
    into v_winner from public.weekly_results wr join public.profiles p on p.id = wr.manager_id
    where wr.week_id = p_week_id order by wr.fantasy_points desc, p.display_name limit 1;
  select wr.manager_id, p.display_name, wr.fantasy_points
    into v_loser from public.weekly_results wr join public.profiles p on p.id = wr.manager_id
    where wr.week_id = p_week_id order by wr.fantasy_points asc, p.display_name desc limit 1;
  if v_winner.manager_id is null or v_loser.manager_id is null then return; end if;
  v_tie := v_winner.fantasy_points = v_loser.fantasy_points;
  v_margin := abs(v_winner.fantasy_points - v_loser.fantasy_points);

  select mps.player_id, mps.full_name, mps.manager_name, mps.counted_points
    into v_mvp from public.matchup_player_scores mps where mps.week_id = p_week_id
    order by mps.counted_points desc, mps.full_name limit 1;
  select mps.full_name, mps.manager_name, mps.counted_points,
      (mps.counted_points - coalesce(mps.projection, 0)) as value_over_projection
    into v_value from public.matchup_player_scores mps where mps.week_id = p_week_id
    order by value_over_projection desc, mps.counted_points desc limit 1;
  select mps.full_name, mps.manager_name, mps.counted_points,
      (coalesce(mps.projection, 0) - mps.counted_points) as missed_projection
    into v_disappointment from public.matchup_player_scores mps where mps.week_id = p_week_id
    order by missed_projection desc, mps.full_name limit 1;
  select mps.full_name, mps.manager_name, round(mps.raw_points * .25, 2) as bonus
    into v_captain from public.matchup_player_scores mps
    where mps.week_id = p_week_id and mps.is_captain
    order by bonus desc limit 1;

  if v_tie then
    v_headline := 'Nobody blinked: ' || v_winner.display_name || ' and ' || v_loser.display_name || ' finish dead even';
    v_summary := 'The rivalry refused to choose a winner. Both managers finished on ' || v_winner.fantasy_points || ' points, so the week ends as a true tie with no win awarded.';
  elsif v_margin <= 5 then
    v_headline := v_winner.display_name || ' survives a Scroober squeaker';
    v_summary := v_winner.display_name || ' escaped ' || v_loser.display_name || ' by only ' || v_margin || ' points. ' || v_mvp.full_name || ' delivered the week’s biggest performance at ' || v_mvp.counted_points || ' points.';
  elsif v_margin >= 30 then
    v_headline := v_winner.display_name || ' delivers a full Scroober demolition';
    v_summary := v_winner.display_name || ' rolled to a ' || v_margin || '-point victory over ' || v_loser.display_name || '. ' || v_mvp.full_name || ' led the damage with ' || v_mvp.counted_points || ' points.';
  else
    v_headline := v_winner.display_name || ' claims the week and the bragging rights';
    v_summary := v_winner.display_name || ' defeated ' || v_loser.display_name || ' by ' || v_margin || ' points. ' || v_mvp.full_name || ' was the matchup MVP with ' || v_mvp.counted_points || ' points.';
  end if;

  insert into public.weekly_recaps (
    week_id, headline, winner_id, winner_name, loser_name, winner_score, loser_score, margin,
    mvp_player_id, mvp_name, mvp_manager_name, mvp_points,
    best_value_name, best_value_manager_name, best_value_points,
    disappointment_name, disappointment_manager_name, disappointment_points,
    captain_name, captain_manager_name, captain_bonus, summary, is_test
  ) values (
    p_week_id, v_headline, case when v_tie then null else v_winner.manager_id end,
    case when v_tie then null else v_winner.display_name end,
    case when v_tie then null else v_loser.display_name end,
    v_winner.fantasy_points, v_loser.fantasy_points, v_margin,
    v_mvp.player_id, v_mvp.full_name, v_mvp.manager_name, v_mvp.counted_points,
    v_value.full_name, v_value.manager_name, v_value.counted_points,
    v_disappointment.full_name, v_disappointment.manager_name, v_disappointment.counted_points,
    v_captain.full_name, v_captain.manager_name, coalesce(v_captain.bonus, 0), v_summary, v_week.is_test
  );

  if not v_week.is_test then
    insert into public.notifications (recipient_id, week_id, type, title, body, data)
    select p.id, p_week_id, 'recap_ready', 'The Scroober Scrimage Report is in',
      v_headline, jsonb_build_object('week_id', p_week_id)
    from public.profiles p;
  end if;
end;
$$;

create or replace function public.generate_recap_when_week_finalizes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'final' and old.status <> 'final' then
    perform public.generate_scroober_scrimage_report(new.id);
  end if;
  return new;
end;
$$;

create trigger generate_recap_after_week_final
after update of status on public.weeks for each row execute function public.generate_recap_when_week_finalizes();

revoke all on function public.generate_scroober_scrimage_report(uuid) from public;
alter publication supabase_realtime add table public.weekly_recaps;
