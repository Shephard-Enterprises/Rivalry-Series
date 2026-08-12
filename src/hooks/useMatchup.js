import { useCallback, useEffect, useState } from 'react'
import { managers } from '../data/mockPlayers'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const emptyManager = (name) => ({ name, score: 0, playersFinal: 0, rosterSize: 0, official: false, wins: 0, losses: 0, ties: 0 })

export function useMatchup() {
  const [week, setWeek] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [matchup, setMatchup] = useState(managers.map(emptyManager))
  const [error, setError] = useState('')

  const loadScores = useCallback(async (activeWeek, managerProfiles) => {
    if (!supabase || !activeWeek) return
    const [{ data: scores, error: scoreError }, { data: results, error: resultError }] = await Promise.all([
      supabase.from('manager_week_scores').select('manager_id, fantasy_points, players_final, roster_size, is_official').eq('week_id', activeWeek.id),
      supabase.from('weekly_results').select('manager_id, result'),
    ])
    if (scoreError || resultError) { setError(scoreError?.message || resultError?.message); return }
    setMatchup(managers.map((name) => {
      const profile = managerProfiles.find((item) => item.display_name === name)
      const score = scores?.find((item) => item.manager_id === profile?.id)
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
      }
    }))
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    Promise.all([
      supabase.from('profiles').select('id, display_name'),
      supabase.from('weeks').select('*').in('status', ['scheduled', 'drafting', 'captain_selection', 'live']).order('draft_opens_at').limit(1).maybeSingle(),
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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [week, profiles, loadScores])

  return { week, matchup, error, connected: isSupabaseConfigured }
}
