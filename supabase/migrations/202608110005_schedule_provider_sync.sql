create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-sleeper-players-daily',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/sync-sleeper-players',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-nfl-schedule-daily',
  '15 10 * * *',
  $$
  select net.http_post(
    url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/sync-nfl-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
