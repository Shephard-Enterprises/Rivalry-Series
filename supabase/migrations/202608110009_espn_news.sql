create table public.news_articles (
  id text primary key,
  source text not null,
  headline text not null,
  description text,
  article_url text not null,
  image_url text,
  published_at timestamptz not null,
  categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index news_articles_published_at_idx on public.news_articles (published_at desc);

alter table public.news_articles enable row level security;
create policy "authenticated users read news"
  on public.news_articles for select to authenticated using (true);

select cron.schedule(
  'sync-espn-news',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/sync-espn-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Populate the first feed immediately; pg_net performs this asynchronously.
select net.http_post(
  url := 'https://wxjcbnjkauybclifquzm.supabase.co/functions/v1/sync-espn-news',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rivalry_sync_secret' order by created_at desc limit 1)
  ),
  body := '{}'::jsonb
);
