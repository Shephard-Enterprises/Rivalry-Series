-- The Edge Function exits before contacting ESPN when no real matchup is near
-- kickoff, so a frequent cron is inexpensive outside the game-day window.
select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-espn-live-stats';

select cron.schedule(
  'sync-espn-live-stats',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/sync-espn-live-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
