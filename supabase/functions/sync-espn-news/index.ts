import { createClient } from 'npm:@supabase/supabase-js@2'

const newsUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=20'
const jsonHeaders = { 'Content-Type': 'application/json' }

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('SLEEPER_SYNC_SECRET')
  if (!url || !key || !secret) return new Response(JSON.stringify({ error: 'Missing environment' }), { status: 500, headers: jsonHeaders })
  if (request.method !== 'POST' || request.headers.get('x-sync-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
  }

  const admin = createClient(url, key)
  const { data: log } = await admin.from('provider_sync_log').insert({ provider: 'espn-news', status: 'running' }).select('id').single()
  try {
    const response = await fetch(newsUrl, { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
    if (!response.ok) throw new Error(`ESPN news returned ${response.status}`)
    const payload = await response.json()
    const now = new Date().toISOString()
    const articles = (payload.articles ?? []).flatMap((article: any) => {
      const articleUrl = article?.links?.web?.href
      if (!article?.id || !article?.headline || !articleUrl) return []
      return [{
        id: String(article.id),
        source: 'ESPN',
        headline: String(article.headline),
        description: article.description ? String(article.description) : null,
        article_url: String(articleUrl),
        image_url: article?.images?.[0]?.url ? String(article.images[0].url) : null,
        published_at: article.published || now,
        categories: (article.categories ?? []).map((category: any) => category.description).filter(Boolean).slice(0, 12),
        updated_at: now,
      }]
    })
    if (articles.length) {
      const { error } = await admin.from('news_articles').upsert(articles, { onConflict: 'id' })
      if (error) throw error
    }
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    await admin.from('news_articles').delete().lt('published_at', cutoff)
    if (log) await admin.from('provider_sync_log').update({ status: 'success', records_processed: articles.length, finished_at: now }).eq('id', log.id)
    return new Response(JSON.stringify({ success: true, articles: articles.length }), { headers: jsonHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ESPN news error'
    if (log) await admin.from('provider_sync_log').update({ status: 'error', error_message: message, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: jsonHeaders })
  }
})
