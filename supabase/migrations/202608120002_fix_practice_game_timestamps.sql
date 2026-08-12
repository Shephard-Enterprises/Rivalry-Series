create or replace function public.normalize_practice_live_timestamps()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_test and new.status = 'live' and old.status <> 'live' then
    new.draft_closes_at := least(new.draft_closes_at, now() - interval '2 seconds');
    new.captain_locks_at := least(new.captain_locks_at, now() - interval '1 second');
  end if;
  return new;
end;
$$;

create trigger normalize_practice_timestamps_before_live
before update of status on public.weeks
for each row execute function public.normalize_practice_live_timestamps();
