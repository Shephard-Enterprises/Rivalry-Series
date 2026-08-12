create table public.weekly_notification_events (
  week_id uuid not null references public.weeks(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  primary key (week_id, recipient_id, event_key)
);

alter table public.weekly_notification_events enable row level security;

create or replace function public.process_weekly_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_week public.weeks;
  v_manager record;
  v_score numeric;
  v_opponent_score numeric;
  v_added integer := 0;
begin
  -- Announce every real draft to both managers. The event ledger makes this
  -- reliable even if the minute of midnight is missed.
  for v_week in
    select * from public.weeks
    where not is_test and status = 'drafting' and now() >= draft_opens_at and now() < draft_closes_at
  loop
    for v_manager in select id from public.profiles loop
      insert into public.weekly_notification_events (week_id, recipient_id, event_key)
      values (v_week.id, v_manager.id, 'draft_open') on conflict do nothing;
      if found then
        insert into public.notifications (recipient_id, week_id, type, title, body, data)
        values (v_manager.id, v_week.id, 'draft_open', 'The weekly draft is open',
          'Build your seven-player roster before Wednesday at 11:59 PM.',
          jsonb_build_object('nfl_week', v_week.nfl_week));
        v_added := v_added + 1;
      end if;
    end loop;
  end loop;

  -- Only managers who still need a captain receive the one-hour warning.
  for v_week in
    select * from public.weeks
    where not is_test and status = 'captain_selection'
      and now() >= captain_locks_at - interval '1 hour' and now() < captain_locks_at
  loop
    for v_manager in
      select p.id from public.profiles p
      where not exists (select 1 from public.captains c where c.week_id = v_week.id and c.manager_id = p.id)
    loop
      insert into public.weekly_notification_events (week_id, recipient_id, event_key)
      values (v_week.id, v_manager.id, 'captain_lock_60') on conflict do nothing;
      if found then
        insert into public.notifications (recipient_id, week_id, type, title, body, data)
        values (v_manager.id, v_week.id, 'captain_reminder', 'Captain locks in one hour',
          'Choose your captain before the first game kicks off. Your selection is final.', '{}'::jsonb);
        v_added := v_added + 1;
      end if;
    end loop;
  end loop;

  -- captain_locks_at is the scheduled kickoff of the week's first NFL game.
  for v_week in
    select * from public.weeks
    where not is_test and status = 'live'
      and now() >= captain_locks_at and now() < captain_locks_at + interval '10 minutes'
  loop
    for v_manager in select id from public.profiles loop
      insert into public.weekly_notification_events (week_id, recipient_id, event_key)
      values (v_week.id, v_manager.id, 'kickoff') on conflict do nothing;
      if found then
        insert into public.notifications (recipient_id, week_id, type, title, body, data)
        values (v_manager.id, v_week.id, 'kickoff', 'The matchup is live',
          'Kickoff is here. Follow every score, swing, and rivalry moment live.',
          jsonb_build_object('nfl_week', v_week.nfl_week));
        v_added := v_added + 1;
      end if;
    end loop;
  end loop;

  -- The recap has its own alert; this one announces the official result.
  for v_week in
    select * from public.weeks
    where not is_test and status = 'final' and finalized_at >= now() - interval '1 day'
  loop
    for v_manager in select id from public.profiles loop
      select fantasy_points into v_score from public.manager_week_scores
        where week_id = v_week.id and manager_id = v_manager.id;
      select fantasy_points into v_opponent_score from public.manager_week_scores
        where week_id = v_week.id and manager_id <> v_manager.id limit 1;
      insert into public.weekly_notification_events (week_id, recipient_id, event_key)
      values (v_week.id, v_manager.id, 'matchup_final') on conflict do nothing;
      if found then
        insert into public.notifications (recipient_id, week_id, type, title, body, data)
        values (v_manager.id, v_week.id, 'matchup_final', 'The final score is official',
          'Week ' || v_week.nfl_week || ' ends ' || coalesce(v_score, 0) || '–' || coalesce(v_opponent_score, 0) || '.',
          jsonb_build_object('score', coalesce(v_score, 0), 'opponent_score', coalesce(v_opponent_score, 0)));
        v_added := v_added + 1;
      end if;
    end loop;
  end loop;
  return v_added;
end;
$$;

revoke all on function public.process_weekly_reminders() from public;

-- Draft opening is handled above for both managers; keep this existing worker
-- focused on the one-hour and fifteen-minute deadline warnings.
create or replace function public.process_draft_deadline_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare v_week public.weeks; v_manager uuid; v_pick integer; v_key text; v_title text; v_body text; v_count integer := 0;
begin
  for v_week in select * from public.weeks where not is_test and status in ('scheduled', 'drafting')
    and now() between draft_opens_at and draft_closes_at loop
    select count(*) + 1 into v_pick from public.draft_picks where week_id = v_week.id;
    if v_pick > 14 then continue; end if;
    if mod(v_pick, 2) = 1 then v_manager := v_week.first_manager_id;
    else select id into v_manager from public.profiles where id <> v_week.first_manager_id order by created_at limit 1; end if;

    if v_week.draft_closes_at - now() <= interval '15 minutes' then
      v_key := 'deadline_15_pick_' || v_pick; v_title := '15 minutes left to draft'; v_body := 'Pick ' || v_pick || ' is yours. Make a selection or your private queue will be used.';
    elsif v_week.draft_closes_at - now() <= interval '1 hour' then
      v_key := 'deadline_60_pick_' || v_pick; v_title := 'One hour left to draft'; v_body := 'You are on the clock for pick ' || v_pick || '. Your queue is ready as a backup.';
    else continue; end if;

    insert into public.draft_notification_events (week_id, manager_id, event_key) values (v_week.id, v_manager, v_key)
    on conflict do nothing;
    if found then
      insert into public.notifications (recipient_id, week_id, type, title, body, data)
      values (v_manager, v_week.id, 'draft_deadline', v_title, v_body, jsonb_build_object('pick_number', v_pick));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

select cron.schedule(
  'weekly-matchup-reminders',
  '* * * * *',
  $$select public.process_weekly_reminders();$$
);
