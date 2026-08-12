create table public.week_messages (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index week_messages_week_created_idx on public.week_messages (week_id, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid references public.weeks(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);

alter table public.week_messages enable row level security;
alter table public.notifications enable row level security;

create policy "managers read weekly messages" on public.week_messages
  for select to authenticated using (true);
create policy "managers send own weekly messages" on public.week_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and exists (
      select 1 from public.weeks w where w.id = week_id and not w.is_test
    )
  );
create policy "managers read own notifications" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy "managers update own notifications" on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace function public.notify_week_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sender_name text;
begin
  select display_name into v_sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications (recipient_id, week_id, type, title, body, data)
  select p.id, new.week_id, 'message', v_sender_name || ' sent a message',
    left(new.body, 160), jsonb_build_object('message_id', new.id)
  from public.profiles p where p.id <> new.sender_id;
  return new;
end;
$$;

create trigger notify_week_message_after_insert
after insert on public.week_messages for each row execute function public.notify_week_message();

create or replace function public.notify_draft_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_next_manager uuid; v_player_name text; v_picker_name text;
begin
  if exists (select 1 from public.weeks where id = new.week_id and is_test) then return new; end if;
  select full_name into v_player_name from public.nfl_players where id = new.player_id;
  select display_name into v_picker_name from public.profiles where id = new.manager_id;

  insert into public.notifications (recipient_id, week_id, type, title, body, data)
  select dq.manager_id, new.week_id, 'queue_stolen', 'Your queued player was drafted',
    v_picker_name || ' selected ' || v_player_name || '.', jsonb_build_object('player_id', new.player_id)
  from public.draft_queue dq
  where dq.week_id = new.week_id and dq.player_id = new.player_id and dq.manager_id <> new.manager_id;

  if new.pick_number < 14 then
    if mod(new.pick_number + 1, 2) = 1 then
      select first_manager_id into v_next_manager from public.weeks where id = new.week_id;
    else
      select p.id into v_next_manager from public.profiles p
      where p.id <> (select first_manager_id from public.weeks where id = new.week_id)
      order by p.created_at limit 1;
    end if;
    insert into public.notifications (recipient_id, week_id, type, title, body, data)
    values (v_next_manager, new.week_id, 'draft_turn', 'You are on the clock',
      'Pick ' || (new.pick_number + 1) || ' is yours.', jsonb_build_object('pick_number', new.pick_number + 1));
  end if;
  return new;
end;
$$;

create trigger notify_draft_activity_after_insert
after insert on public.draft_picks for each row execute function public.notify_draft_activity();

create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.notifications set read_at = now()
  where recipient_id = auth.uid() and read_at is null
    and (p_notification_ids is null or id = any(p_notification_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

alter publication supabase_realtime add table public.week_messages;
alter publication supabase_realtime add table public.notifications;
