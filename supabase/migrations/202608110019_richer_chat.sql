alter table public.week_messages alter column body drop not null;
alter table public.week_messages drop constraint if exists week_messages_body_check;
alter table public.week_messages
  add column message_type text not null default 'text' check (message_type in ('text', 'gif')),
  add column gif_id text,
  add column gif_url text,
  add column gif_title text,
  add column reply_to_id uuid references public.week_messages(id) on delete set null,
  add column edited_at timestamptz;
alter table public.week_messages add constraint week_messages_content_check check (
  (message_type = 'text' and char_length(trim(body)) between 1 and 1000 and gif_url is null)
  or (message_type = 'gif' and gif_id is not null and gif_url ~ '^https://media[0-9]*\.giphy\.com/' and body is null)
);

create table public.message_reactions (
  message_id uuid not null references public.week_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('😂', '🔥', '😤', '👏', '💀', '🏆')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;
create policy "managers read message reactions" on public.message_reactions for select to authenticated using (true);
create policy "managers add own reactions" on public.message_reactions for insert to authenticated with check (user_id = auth.uid());
create policy "managers remove own reactions" on public.message_reactions for delete to authenticated using (user_id = auth.uid());
create policy "managers edit own messages" on public.week_messages for update to authenticated
  using (sender_id = auth.uid() and message_type = 'text') with check (sender_id = auth.uid() and message_type = 'text');
create policy "managers delete own messages" on public.week_messages for delete to authenticated using (sender_id = auth.uid());

create or replace function public.notify_week_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sender_name text; v_preview text;
begin
  select display_name into v_sender_name from public.profiles where id = new.sender_id;
  v_preview := case when new.message_type = 'gif' then 'Sent a GIF' else left(new.body, 160) end;
  insert into public.notifications (recipient_id, week_id, type, title, body, data)
  select p.id, new.week_id, 'message', v_sender_name || ' sent a message',
    v_preview, jsonb_build_object('message_id', new.id, 'message_type', new.message_type)
  from public.profiles p where p.id <> new.sender_id;
  return new;
end;
$$;

alter publication supabase_realtime add table public.message_reactions;
