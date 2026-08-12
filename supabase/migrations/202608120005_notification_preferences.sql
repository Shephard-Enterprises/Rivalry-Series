create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_messages boolean not null default true,
  gif_messages boolean not null default true,
  reactions boolean not null default true,
  draft_alerts boolean not null default true,
  scoring_alerts boolean not null default true,
  recap_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_preferences (user_id) select id from public.profiles on conflict do nothing;
alter table public.notification_preferences enable row level security;
create policy "managers read own notification preferences" on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy "managers update own notification preferences" on public.notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "managers create own notification preferences" on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());

create or replace function public.notify_message_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_message public.week_messages; v_reactor text;
begin
  select * into v_message from public.week_messages where id = new.message_id;
  if v_message.sender_id = new.user_id or exists (select 1 from public.weeks where id = v_message.week_id and is_test) then return new; end if;
  select display_name into v_reactor from public.profiles where id = new.user_id;
  insert into public.notifications (recipient_id, week_id, type, title, body, data)
  values (v_message.sender_id, v_message.week_id, 'reaction', v_reactor || ' reacted ' || new.emoji,
    case when v_message.message_type = 'gif' then 'To your GIF' else 'To your message: ' || left(v_message.body, 100) end,
    jsonb_build_object('message_id', new.message_id, 'emoji', new.emoji));
  return new;
end;
$$;

create trigger notify_message_reaction_after_insert
after insert on public.message_reactions for each row execute function public.notify_message_reaction();
