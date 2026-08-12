alter table public.notifications add column if not exists push_not_before timestamptz not null default now();

create or replace function public.send_test_push_notification()
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_notification_id uuid;
  v_week_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to test notifications'; end if;
  select id into v_week_id from public.weeks
    where not is_test and status in ('scheduled', 'drafting', 'captain_selection', 'live')
    order by draft_opens_at limit 1;
  insert into public.notifications (recipient_id, week_id, type, title, body, data, push_not_before)
  values (
    auth.uid(), v_week_id, 'push_test', 'Rivalry notifications are working',
    'You will get draft turns, messages, and matchup alerts here.',
    jsonb_build_object('test', true), now() + interval '5 seconds'
  ) returning id into v_notification_id;

  perform net.http_post(
    url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
    ),
    body := jsonb_build_object('notification_id', v_notification_id, 'delay_seconds', 5)
  );
  return v_notification_id;
end;
$$;

revoke all on function public.send_test_push_notification() from public;
grant execute on function public.send_test_push_notification() to authenticated;
