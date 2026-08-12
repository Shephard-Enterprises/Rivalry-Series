import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const giphyKey = Deno.env.get('GIPHY_API_KEY')
  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!url || !serviceKey || !giphyKey || !token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const client = createClient(url, serviceKey)
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const body = await request.json().catch(() => ({}))
  const query = String(body.query ?? '').trim().slice(0, 50)
  const endpoint = query ? 'search' : 'trending'
  const params = new URLSearchParams({ api_key: giphyKey, limit: '24', rating: 'pg', bundle: 'messaging_non_clips', country_code: 'US' })
  if (query) params.set('q', query)
  const response = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`)
  if (!response.ok) return new Response(JSON.stringify({ error: `GIPHY returned ${response.status}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const payload = await response.json()
  const gifs = (payload.data ?? []).flatMap((gif: any) => {
    const preview = gif?.images?.fixed_width_small?.webp || gif?.images?.fixed_width_small?.url
    const chat = gif?.images?.fixed_width?.webp || gif?.images?.fixed_width?.url
    if (!gif?.id || !preview || !chat) return []
    return [{ id: gif.id, title: gif.title || 'GIPHY GIF', preview_url: preview, image_url: chat, page_url: gif.url }]
  })
  return new Response(JSON.stringify({ gifs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' } })
})
