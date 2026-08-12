import { useCallback, useEffect, useState } from 'react'
import { managers } from '../data/mockPlayers'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const emptyManager = (name) => ({ name, score: 0, playersFinal: 0, rosterSize: 0, official: false, wins: 0, losses: 0, ties: 0, probability: 50, projectedFinal: 0, players: [] })

export function useMatchup() {
  const [week, setWeek] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [matchup, setMatchup] = useState(managers.map(emptyManager))
  const [timeline, setTimeline] = useState([])
  const [lastScoreSync, setLastScoreSync] = useState(null)
  const [progress, setProgress] = useState({ pickCount: 0, captainCount: 0, currentManager: null })
  const [error, setError] = useState('')

  const loadScores = useCallback(async (activeWeek, managerProfiles) => {
    if (!supabase || !activeWeek) return
    const [{ data: scores, error: scoreError }, { data: results, error: resultError }, { data: playerScores, error: playerError }, { data: probabilities, error: probabilityError }, { data: events, error: timelineError }, { data: syncLog }, { data: picks }, { data: captains }] = await Promise.all([
      supabase.from('manager_week_scores').select('manager_id, fantasy_points, players_final, roster_size, is_official').eq('week_id', activeWeek.id),
      supabase.from('weekly_results').select('manager_id, result'),
      supabase.from('matchup_player_scores').select('*').eq('week_id', activeWeek.id).order('roster_slot'),
      supabase.from('manager_win_probabilities').select('manager_id, projected_final, players_remaining, win_probability').eq('week_id', activeWeek.id),
      supabase.from('game_day_events').select('id, type, title, body, manager_id, player_id, data, occurred_at').eq('week_id', activeWeek.id).order('occurred_at', { ascending: false }).limit(30),
      supabase.from('provider_sync_log').select('finished_at, started_at').eq('provider', 'espn-live-stats').eq('status', 'success').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('draft_picks').select('manager_id').eq('week_id', activeWeek.id),
      supabase.from('captains').select('manager_id').eq('week_id', activeWeek.id),
    ])
    if (scoreError || resultError || playerError || probabilityError) { setError(scoreError?.message || resultError?.message || playerError?.message || probabilityError?.message); return }
    setError('')
    setTimeline(timelineError ? [] : (events ?? []))
    setLastScoreSync(syncLog?.finished_at ?? syncLog?.started_at ?? null)
    const pickCount = picks?.length ?? 0
    const nextManagerId = pickCount % 2 === 0 ? activeWeek.first_manager_id : managerProfiles.find((profile) => profile.id !== activeWeek.first_manager_id)?.id
    setProgress({ pickCount, captainCount: captains?.length ?? 0, currentManager: managerProfiles.find((profile) => profile.id === nextManagerId)?.display_name ?? null })
    setMatchup(managers.map((name) => {
      const profile = managerProfiles.find((item) => item.display_name === name)
      const score = scores?.find((item) => item.manager_id === profile?.id)
      const probability = probabilities?.find((item) => item.manager_id === profile?.id)
      const record = (results ?? []).filter((item) => item.manager_id === profile?.id)
      return {
        name,
        score: Number(score?.fantasy_points ?? 0),
        playersFinal: score?.players_final ?? 0,
        rosterSize: score?.roster_size ?? 0,
        official: Boolean(score?.is_official),
        wins: record.filter((item) => item.result === 'win').length,
        losses: record.filter((item) => item.result === 'loss').length,
        ties: record.filter((item) => item.result === 'tie').length,
        probability: Number(probability?.win_probability ?? 50),
        projectedFinal: Number(probability?.projected_final ?? score?.fantasy_points ?? 0),
        players: (playerScores ?? []).filter((item) => item.manager_id === profile?.id).map((item) => ({
          ...item, raw_points: Number(item.raw_points), counted_points: Number(item.counted_points),
          projected_remaining: Number(item.projected_remaining), projection: item.projection == null ? null : Number(item.projection),
          passing_yards: Number(item.passing_yards), passing_touchdowns: Number(item.passing_touchdowns), interceptions: Number(item.interceptions),
          rushing_yards: Number(item.rushing_yards), rushing_touchdowns: Number(item.rushing_touchdowns), receptions: Number(item.receptions),
          receiving_yards: Number(item.receiving_yards), receiving_touchdowns: Number(item.receiving_touchdowns),
          fumbles_lost: Number(item.fumbles_lost), two_point_conversions: Number(item.two_point_conversions),
        })),
      }
    }))
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    Promise.all([
      supabase.from('profiles').select('id, display_name'),
      supabase.from('weeks').select('*').eq('is_test', false).in('status', ['scheduled', 'drafting', 'captain_selection', 'live']).order('draft_opens_at').limit(1).maybeSingle(),
    ]).then(([profileResult, weekResult]) => {
      if (!active) return
      if (profileResult.error || weekResult.error) { setError(profileResult.error?.message || weekResult.error?.message); return }
      setProfiles(profileResult.data ?? [])
      setWeek(weekResult.data ?? null)
      if (weekResult.data) loadScores(weekResult.data, profileResult.data ?? [])
    })
    return () => { active = false }
  }, [loadScores])

  useEffect(() => {
    if (!supabase || !week) return undefined
    const refresh = () => loadScores(week, profiles)
    const channel = supabase.channel(`matchup:${week.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_week_stats', filter: `week_id=eq.${week.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `week_id=eq.${week.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'captains', filter: `week_id=eq.${week.id}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'weeks', filter: `id=eq.${week.id}` }, (payload) => { setWeek(payload.new); loadScores(payload.new, profiles) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'win_probability_snapshots', filter: `week_id=eq.${week.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_day_events', filter: `week_id=eq.${week.id}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [week, profiles, loadScores])

  return { week, matchup, timeline, lastScoreSync, progress, error, connected: isSupabaseConfigured }
}
