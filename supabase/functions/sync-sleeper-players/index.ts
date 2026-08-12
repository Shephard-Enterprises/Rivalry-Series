import { createClient } from 'npm:@supabase/supabase-js@2'

const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE'])
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function playerStatus(player: Record<string, unknown>) {
  if (player.active === false) return 'inactive'
  const injury = String(player.injury_status ?? '').toLowerCase()
  if (injury.includes('out') || injury === 'ir' || injury.includes('pup')) return 'out'
  if (injury.includes('doubtful')) return 'doubtful'
  if (injury.includes('questionable')) return 'questionable'
  return 'healthy'
}

function asText(value: unknown) {
  return value === null || value === undefined || value === '' ? null : String(value)
}

const teamAliases: Record<string, string> = { JAC: 'JAX', WAS: 'WSH' }
const normalizeTeam = (team: unknown) => teamAliases[String(team)] || String(team)
const normalizeName = (name: unknown) => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '')

async function espnRosterIds() {
  const ids = new Map<string, string>()
  try {
    const teamsResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40', { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
    if (!teamsResponse.ok) return ids
    const teamsPayload = await teamsResponse.json()
    const teams = teamsPayload?.sports?.[0]?.leagues?.[0]?.teams?.map((entry: any) => entry.team).filter(Boolean) ?? []
    const rosters = await Promise.all(teams.map(async (team: any) => {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`, { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
      return response.ok ? { team: normalizeTeam(team.abbreviation), payload: await response.json() } : null
    }))
    for (const roster of rosters) {
      if (!roster) continue
      for (const group of roster.payload?.athletes ?? []) {
        for (const athlete of group.items ?? []) {
          if (athlete?.id && athlete?.fullName) ids.set(`${roster.team}:${normalizeName(athlete.fullName)}`, String(athlete.id))
        }
      }
    }
  } catch { /* Sleeper data still syncs when ESPN is unavailable. */ }
  return ids
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const syncSecret = Deno.env.get('SLEEPER_SYNC_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !syncSecret) return new Response(JSON.stringify({ error: 'Missing Supabase environment' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (request.headers.get('x-sync-secret') !== syncSecret) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: log } = await admin.from('provider_sync_log').insert({ provider: 'sleeper', status: 'running' }).select('id').single()

  try {
    const response = await fetch('https://api.sleeper.app/v1/players/nfl?active=true', { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
    if (!response.ok) throw new Error(`Sleeper returned ${response.status}`)
    const catalog = await response.json() as Record<string, Record<string, unknown>>
    const espnIds = await espnRosterIds()
    const syncedAt = new Date().toISOString()
    const rows = Object.entries(catalog)
      .filter(([, player]) => fantasyPositions.has(String(player.position)) && player.active !== false && player.team)
      .map(([sleeperId, player]) => {
        const fullName = asText(player.full_name) || [player.first_name, player.last_name].filter(Boolean).join(' ')
        const espnId = asText(player.espn_id) || espnIds.get(`${normalizeTeam(player.team)}:${normalizeName(fullName)}`) || null
        return {
          id: `sleeper:${sleeperId}`,
          sleeper_id: sleeperId,
          full_name: fullName,
          first_name: asText(player.first_name), last_name: asText(player.last_name),
          position: String(player.position), nfl_team: String(player.team), status: playerStatus(player), active: true,
          espn_id: espnId, sportradar_id: asText(player.sportradar_id), gsis_id: asText(player.gsis_id),
          fantasy_data_id: asText(player.fantasy_data_id), yahoo_id: asText(player.yahoo_id),
          headshot_url: espnId ? `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png` : null,
          injury_body_part: asText(player.injury_body_part), injury_notes: asText(player.injury_notes),
          practice_participation: asText(player.practice_participation), search_rank: Number(player.search_rank) || null,
          depth_chart_order: Number(player.depth_chart_order) || null, last_synced_at: syncedAt,
          provider_payload: { source: 'sleeper', headshot_source: espnId ? (player.espn_id ? 'sleeper-espn-id' : 'espn-roster-match') : null, fantasy_positions: player.fantasy_positions, number: player.number },
        }
      })

    for (let index = 0; index < rows.length; index += 250) {
      const { error } = await admin.from('nfl_players').upsert(rows.slice(index, index + 250), { onConflict: 'id' })
      if (error) throw error
    }

    await admin.from('nfl_players').update({ active: false, status: 'inactive' }).like('id', 'sleeper:%').lt('last_synced_at', syncedAt)

    const { data: weeks } = await admin.from('weeks').select('id').in('status', ['scheduled', 'drafting'])
    const eligible = rows.filter((player) => !['out', 'inactive'].includes(player.status)).map((player) => ({
      player_id: player.id, ranking: player.search_rank, available: true,
    }))
    for (const week of weeks ?? []) {
      for (let index = 0; index < eligible.length; index += 250) {
        const weekRows = eligible.slice(index, index + 250).map((player) => ({ ...player, week_id: week.id }))
        const { error } = await admin.from('week_players').upsert(weekRows, { onConflict: 'week_id,player_id', ignoreDuplicates: true })
        if (error) throw error
      }
    }

    const { data: mockPlayers } = await admin.from('nfl_players').select('id').contains('provider_payload', { mock: true })
    const mockIds = (mockPlayers ?? []).map((player) => player.id)
    if (mockIds.length) {
      await admin.from('week_players').delete().in('player_id', mockIds)
      await admin.from('nfl_players').delete().in('id', mockIds)
    }

    if (log) await admin.from('provider_sync_log').update({ status: 'success', records_processed: rows.length, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: true, players: rows.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    if (log) await admin.from('provider_sync_log').update({ status: 'error', error_message: message, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
