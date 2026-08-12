create table public.draft_notification_events (
  week_id uuid not null references public.weeks(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  primary key (week_id, manager_id, event_key)
);

alter table public.draft_notification_events enable row level security;

create or replace function public.notify_draft_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_next_manager uuid; v_player_name text; v_picker_name text;
begin
  if exists (select 1 from public.weeks where id = new.week_id and is_test) then return new; end if;
  select full_name into v_player_name from public.nfl_players where id = new.player_id;
  select display_name into v_picker_name from public.profiles where id = new.manager_id;

  insert into public.notifications (recipient_id, week_id, type, title, body, data)
  select dq.manager_id, new.week_id, 'queue_stolen', 'Your queued player was drafted',
    v_picker_name || ' selected ' || v_player_name || '.', jsonb_build_object('player_id', new.player_id, 'pick_number', new.pick_number)
  from public.draft_queue dq
  where dq.week_id = new.week_id and dq.player_id = new.player_id and dq.manager_id <> new.manager_id;

  if new.is_auto_pick then
    insert into public.notifications (recipient_id, week_id, type, title, body, data)
    values (new.manager_id, new.week_id, 'draft_auto_pick', 'Your pick was made automatically',
      v_player_name || ' was added to your ' || new.roster_slot || ' slot.',
      jsonb_build_object('player_id', new.player_id, 'pick_number', new.pick_number, 'roster_slot', new.roster_slot));
  end if;

  if new.pick_number < 14 then
    if mod(new.pick_number + 1, 2) = 1 then
      select first_manager_id into v_next_manager from public.weeks where id = new.week_id;
    else
      select p.id into v_next_manager from public.profiles p
      where p.id <> (select first_manager_id from public.weeks where id = new.week_id)
      order by p.created_at limit 1;
    end if;
    insert into public.notifications (recipient_id, week_id, type, title, body, data)
    values (v_next_manager, new.week_id, 'draft_turn', v_picker_name || ' drafted ' || v_player_name,
      'You are on the clock for pick ' || (new.pick_number + 1) || ' of 14.',
      jsonb_build_object('player_id', new.player_id, 'pick_number', new.pick_number + 1));
  else
    insert into public.notifications (recipient_id, week_id, type, title, body, data)
    select p.id, new.week_id, 'captain_selection', 'The draft is complete',
      'Choose your captain before kickoff of the first game.', jsonb_build_object('pick_number', 14)
    from public.profiles p;
  end if;
  return new;
end;
$$;

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

    if now() < v_week.draft_opens_at + interval '2 minutes' then
      v_key := 'draft_open_pick_' || v_pick; v_title := 'The draft is open'; v_body := 'You have the first pick. Build your roster before Wednesday at 11:59 PM.';
    elsif v_week.draft_closes_at - now() <= interval '15 minutes' then
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

revoke all on function public.process_draft_deadline_notifications() from public;

select cron.schedule(
  'draft-deadline-notifications',
  '* * * * *',
  $$select public.process_draft_deadline_notifications();$$
);
