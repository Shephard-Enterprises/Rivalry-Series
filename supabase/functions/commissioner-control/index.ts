import { createClient } from 'npm:@supabase/supabase-js@2'

const commissionerId = 'ec754195-3838-4986-9b84-6d8b6d9dadcd'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const providers: Record<string, string> = {
  players: 'sync-sleeper-players',
  schedule: 'sync-nfl-schedule',
  news: 'sync-espn-news',
  scores: 'sync-espn-live-stats',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const syncSecret = Deno.env.get('SLEEPER_SYNC_SECRET')
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!url || !serviceKey || !syncSecret || !token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const admin = createClient(url, serviceKey)
  const { data, error } = await admin.auth.getUser(token)
  if (error || data.user?.id !== commissionerId) return new Response(JSON.stringify({ error: 'Commissioner access required' }), { status: 403, headers: corsHeaders })

  const body = await request.json().catch(() => ({}))
  const target = providers[String(body.action ?? '')]
  if (!target) return new Response(JSON.stringify({ error: 'Unknown sync action' }), { status: 400, headers: corsHeaders })

  const response = await fetch(`${url}/functions/v1/${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
    body: '{}',
  })
  const result = await response.json().catch(() => ({}))
  return new Response(JSON.stringify(result), { status: response.status, headers: corsHeaders })
})
