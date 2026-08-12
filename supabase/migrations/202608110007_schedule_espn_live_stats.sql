-- Polling is cheap when no week is live: the Edge Function checks Supabase first
-- and only contacts ESPN from six hours before kickoff through the end of the week.
select cron.schedule(
  'sync-espn-live-stats',
  '*/5 * * * *',
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

alter publication supabase_realtime add table public.player_week_stats;
