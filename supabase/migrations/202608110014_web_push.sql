alter table public.notifications add column if not exists push_sent_at timestamptz;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "managers read own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "managers create own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "managers update own push subscriptions" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "managers delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

select cron.schedule(
  'send-push-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
