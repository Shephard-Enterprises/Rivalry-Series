import { createClient } from 'npm:@supabase/supabase-js@2'

const espnBase = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const jsonHeaders = { 'Content-Type': 'application/json' }

type StatLine = {
  passing_yards: number
  passing_touchdowns: number
  interceptions: number
  rushing_yards: number
  rushing_touchdowns: number
  receptions: number
  receiving_yards: number
  receiving_touchdowns: number
  fumbles_lost: number
  two_point_conversions: number
}

const emptyLine = (): StatLine => ({
  passing_yards: 0,
  passing_touchdowns: 0,
  interceptions: 0,
  rushing_yards: 0,
  rushing_touchdowns: 0,
  receptions: 0,
  receiving_yards: 0,
  receiving_touchdowns: 0,
  fumbles_lost: 0,
  two_point_conversions: 0,
})

const numberAt = (labels: string[], stats: string[], label: string) => {
  const value = Number(stats[labels.indexOf(label)])
  return Number.isFinite(value) ? value : 0
}

function readBoxScore(payload: any) {
  const lines = new Map<string, StatLine>()
  const aliases = new Map<string, string>()
  for (const team of payload?.boxscore?.players ?? []) {
    for (const category of team.statistics ?? []) {
      if (!['passing', 'rushing', 'receiving', 'fumbles'].includes(category.name)) continue
      for (const entry of category.athletes ?? []) {
        const espnId = entry?.athlete?.id
        if (!espnId) continue
        const firstName = String(entry?.athlete?.firstName ?? '')
        const lastName = String(entry?.athlete?.lastName ?? '').replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i, '')
        if (firstName && lastName) aliases.set(`${firstName[0]}.${lastName}`.toLowerCase(), espnId)
        const line = lines.get(espnId) ?? emptyLine()
        const labels: string[] = category.labels ?? []
        const stats: string[] = entry.stats ?? []
        if (category.name === 'passing') {
          line.passing_yards = numberAt(labels, stats, 'YDS')
          line.passing_touchdowns = numberAt(labels, stats, 'TD')
          line.interceptions = numberAt(labels, stats, 'INT')
        } else if (category.name === 'rushing') {
          line.rushing_yards = numberAt(labels, stats, 'YDS')
          line.rushing_touchdowns = numberAt(labels, stats, 'TD')
        } else if (category.name === 'receiving') {
          line.receptions = numberAt(labels, stats, 'REC')
          line.receiving_yards = numberAt(labels, stats, 'YDS')
          line.receiving_touchdowns = numberAt(labels, stats, 'TD')
        } else if (category.name === 'fumbles') {
          line.fumbles_lost = numberAt(labels, stats, 'LOST')
        }
        lines.set(espnId, line)
      }
    }
  }

  // ESPN's box score omits conversions. Detailed plays identify successful
  // attempts as "A.Player pass to B.Player ... ATTEMPT SUCCEEDS" (or a run).
  for (const drive of payload?.drives?.previous ?? []) {
    for (const play of drive?.plays ?? []) {
      const text = String(play?.text ?? '')
      const marker = text.toUpperCase().lastIndexOf('TWO-POINT CONVERSION ATTEMPT.')
      if (marker < 0 || !/ATTEMPT SUCCEEDS/i.test(text.slice(marker))) continue
      const conversion = text.slice(marker).toLowerCase()
      const credited = new Set<string>()
      for (const [alias, espnId] of aliases) {
        if (conversion.includes(alias) && !credited.has(espnId)) {
          const line = lines.get(espnId) ?? emptyLine()
          line.two_point_conversions += 1
          lines.set(espnId, line)
          credited.add(espnId)
        }
      }
    }
  }
  return lines
}

function gameState(event: any) {
  const state = event?.status?.type?.state
  if (state === 'post') return { game_status: 'final', is_official: true }
  if (state === 'in') return { game_status: 'in_progress', is_official: false }
  return { game_status: 'scheduled', is_official: false }
}

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('SLEEPER_SYNC_SECRET')
  if (!url || !key || !secret) return new Response(JSON.stringify({ error: 'Missing environment' }), { status: 500, headers: jsonHeaders })
  if (request.method !== 'POST' || request.headers.get('x-sync-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
  }

  const admin = createClient(url, key)
  const { data: log } = await admin.from('provider_sync_log').insert({ provider: 'espn-live-stats', status: 'running' }).select('id').single()
  try {
    const now = new Date()
    const earliestLock = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const latestLock = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString()
    const { data: weeks, error: weekError } = await admin.from('weeks')
      .select('id, season, nfl_week, captain_locks_at')
      .neq('status', 'final')
      .gte('captain_locks_at', earliestLock)
      .lte('captain_locks_at', latestLock)
    if (weekError) throw weekError

    let gamesProcessed = 0
    let statsUpserted = 0
    for (const week of weeks ?? []) {
      const scoreboardUrl = `${espnBase}/scoreboard?dates=${week.season}&seasontype=2&week=${week.nfl_week}&limit=20`
      const boardResponse = await fetch(scoreboardUrl, { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
      if (!boardResponse.ok) throw new Error(`ESPN scoreboard returned ${boardResponse.status}`)
      const board = await boardResponse.json()
      for (const event of board.events ?? []) {
        if (event?.status?.type?.state === 'pre') continue
        const summaryResponse = await fetch(`${espnBase}/summary?event=${event.id}`, { headers: { 'User-Agent': 'Rivalry-Series/1.0' } })
        if (!summaryResponse.ok) throw new Error(`ESPN summary ${event.id} returned ${summaryResponse.status}`)
        const lines = readBoxScore(await summaryResponse.json())
        const espnIds = [...lines.keys()]
        if (!espnIds.length) continue
        const { data: players, error: playerError } = await admin.from('nfl_players').select('id, espn_id').in('espn_id', espnIds)
        if (playerError) throw playerError
        const playerIds = new Map((players ?? []).map((player) => [player.espn_id, player.id]))
        const state = gameState(event)
        const rows = [...lines.entries()].flatMap(([espnId, stats]) => {
          const playerId = playerIds.get(espnId)
          return playerId ? [{ week_id: week.id, player_id: playerId, ...stats, ...state, source: 'espn', source_game_id: event.id, updated_at: new Date().toISOString() }] : []
        })
        if (rows.length) {
          const { error } = await admin.from('player_week_stats').upsert(rows, { onConflict: 'week_id,player_id' })
          if (error) throw error
          statsUpserted += rows.length
        }
        gamesProcessed += 1
      }
    }
    if (log) await admin.from('provider_sync_log').update({ status: 'success', records_processed: statsUpserted, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: true, weeks: weeks?.length ?? 0, games: gamesProcessed, player_stats: statsUpserted }), { headers: jsonHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ESPN sync error'
    if (log) await admin.from('provider_sync_log').update({ status: 'error', error_message: message, finished_at: new Date().toISOString() }).eq('id', log.id)
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: jsonHeaders })
  }
})
