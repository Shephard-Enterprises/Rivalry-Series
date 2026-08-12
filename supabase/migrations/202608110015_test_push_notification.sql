create or replace function public.send_test_push_notification()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_week_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to test notifications'; end if;
  select id into v_week_id from public.weeks
    where not is_test and status in ('scheduled', 'drafting', 'captain_selection', 'live')
    order by draft_opens_at limit 1;
  insert into public.notifications (recipient_id, week_id, type, title, body, data)
  values (
    auth.uid(), v_week_id, 'push_test', 'Rivalry notifications are working',
    'You will get draft turns, messages, and matchup alerts here.',
    jsonb_build_object('test', true)
  ) returning id into v_notification_id;
  return v_notification_id;
end;
$$;

revoke all on function public.send_test_push_notification() from public;
grant execute on function public.send_test_push_notification() to authenticated;
