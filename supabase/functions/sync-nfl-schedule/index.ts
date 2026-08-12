import { createClient } from 'npm:@supabase/supabase-js@2'

const scheduleUrl = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-sync-secret, content-type' }

function easternKickoff(date: string, time: string) {
  const probe = new Date(`${date}T${time}:00Z`)
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(probe).find((part) => part.type === 'timeZoneName')?.value || 'GMT-5'
  const hours = Number(zone.replace('GMT', ''))
  const offset = `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`
  return new Date(`${date}T${time}:00${offset}`).toISOString()
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const secret = Deno.env.get('SLEEPER_SYNC_SECRET')
  if (!url || !key || !secret) return new Response(JSON.stringify({ error: 'Missing environment' }), { status: 500 })
  if (request.method !== 'POST' || request.headers.get('x-sync-secret') !== secret) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const admin = createClient(url, key)
  const { data: log } = await admin.from('provider_sync_log').insert({ provider: 'nflverse-schedule', status: 'running' }).select('id').single()
  try {
    const response = await fetch(scheduleUrl, { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
    if (!response.ok) throw new Error(`nflverse returned ${response.status}`)
    const lines = (await response.text()).split('\n').slice(1)
    const games = lines.map((line) => line.split(',')).filter((row) => row[1] === '2026' && row[2] === 'REG' && row[7] && row[9]).map((row) => ({
      id: row[0], season: Number(row[1]), season_type: row[2], nfl_week: Number(row[3]), starts_at: easternKickoff(row[4], row[6]),
      away_team: row[7], home_team: row[9], status: row[8] === '' ? 'scheduled' : 'final', source: 'nflverse', updated_at: new Date().toISOString(),
    }))
    const { error: gameError } = await admin.from('nfl_games').upsert(games, { onConflict: 'id' })
    if (gameError) throw gameError
    const { data: weeks } = await admin.from('weeks').select('id').eq('season', 2026)
    for (const week of weeks ?? []) {
      const { error } = await admin.rpc('apply_week_schedule', { p_week_id: week.id })
      if (error) throw error
    }
    if (log) await admin.from('provider_sync_log').update({ status: 'success', records_processed: games.length, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: true, games: games.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown schedule error'
    if (log) await admin.from('provider_sync_log').update({ status: 'error', error_message: message, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
