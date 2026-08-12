import { useCallback, useEffect, useState } from 'react'
import { managers, players as mockPlayers, rosterLimits } from '../data/mockPlayers'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function useDraft() {
  const [week, setWeek] = useState(null)
  const [picks, setPicks] = useState([])
  const [captains, setCaptains] = useState({})
  const [queue, setQueue] = useState([])
  const [profile, setProfile] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [playerPool, setPlayerPool] = useState(isSupabaseConfigured ? [] : mockPlayers)
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? 'connecting' : 'demo')
  const [error, setError] = useState('')
  const [clock, setClock] = useState(0)

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(Date.now()), 0)
    const timer = window.setInterval(() => setClock(Date.now()), 30000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [])

  const loadDraft = useCallback(async (activeWeek, managerProfiles) => {
    if (!supabase || !activeWeek) return
    const [{ data: pickRows, error: pickError }, { data: captainRows, error: captainError }, { data: queueRows, error: queueError }] = await Promise.all([
      supabase.from('draft_picks').select('pick_number, manager_id, player_id, roster_slot, is_auto_pick').eq('week_id', activeWeek.id).order('pick_number'),
      supabase.from('captains').select('manager_id, player_id').eq('week_id', activeWeek.id),
      supabase.from('draft_queue').select('player_id, priority').eq('week_id', activeWeek.id).order('priority'),
    ])
    if (pickError || captainError || queueError) { setError(pickError?.message || captainError?.message || queueError?.message); setSyncStatus('error'); return }
    const managerName = (id) => managerProfiles.find((item) => item.id === id)?.display_name
    setPicks((pickRows ?? []).map((pick) => ({ playerId: String(pick.player_id), manager: managerName(pick.manager_id), managerId: pick.manager_id, rosterSlot: pick.roster_slot, isAutoPick: pick.is_auto_pick })))
    setCaptains(Object.fromEntries((captainRows ?? []).map((captain) => [managerName(captain.manager_id), String(captain.player_id)])))
    setQueue((queueRows ?? []).map((item) => String(item.player_id)))
    setSyncStatus('live')
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const initialize = async () => {
      const [{ data: userData }, { data: managerProfiles, error: profilesError }, { data: activeWeek, error: weekError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('id, display_name'),
        supabase.from('weeks').select('*').eq('is_test', false).in('status', ['scheduled', 'drafting', 'captain_selection', 'live']).order('draft_opens_at').limit(1).maybeSingle(),
      ])
      if (!active) return
      if (profilesError || weekError) { setError(profilesError?.message || weekError?.message); setSyncStatus('error'); return }
      const foundProfile = managerProfiles?.find((item) => item.id === userData.user?.id)
      setProfile(foundProfile ?? null); setProfiles(managerProfiles ?? []); setWeek(activeWeek ?? null)
      if (activeWeek) {
        const [{ data: weekPlayerRows, error: playerError }, { data: scoreRows, error: scoreError }] = await Promise.all([
          supabase.from('week_players').select('player_id, opponent, projection, ranking, available, game_starts_at, nfl_players!inner(full_name, position, nfl_team, status, headshot_url, injury_notes)').eq('week_id', activeWeek.id).eq('available', true).order('ranking', { nullsFirst: false }),
          supabase.from('player_fantasy_scores').select('player_id, fantasy_points, nfl_week').eq('season', activeWeek.season).eq('is_test', false).eq('is_official', true).order('nfl_week', { ascending: false }),
        ])
        if (playerError || scoreError) { setError(playerError?.message || scoreError?.message); setSyncStatus('error'); return }
        const histories = new Map()
        for (const score of scoreRows ?? []) {
          const history = histories.get(String(score.player_id)) ?? []
          history.push({ points: Number(score.fantasy_points), week: score.nfl_week }); histories.set(String(score.player_id), history)
        }
        const positionRanks = new Map()
        setPlayerPool((weekPlayerRows ?? []).map((row) => {
          const position = row.nfl_players.position
          const positionRank = (positionRanks.get(position) ?? 0) + 1
          positionRanks.set(position, positionRank)
          const history = histories.get(String(row.player_id)) ?? []
          return {
          id: String(row.player_id), name: row.nfl_players.full_name, position: row.nfl_players.position,
          team: row.nfl_players.nfl_team, opponent: row.opponent || 'Matchup TBD', projection: row.projection, gameStartsAt: row.game_starts_at,
          status: row.nfl_players.status.charAt(0).toUpperCase() + row.nfl_players.status.slice(1),
          injuryNotes: row.nfl_players.injury_notes, headshotUrl: row.nfl_players.headshot_url,
          positionRank, gamesPlayed: history.length, recentScores: history.slice(0, 3),
          fantasyAverage: history.length ? history.reduce((sum, game) => sum + game.points, 0) / history.length : null,
        }}))
        await loadDraft(activeWeek, managerProfiles ?? [])
      }
      else setSyncStatus('live')
    }
    initialize()
    return () => { active = false }
  }, [loadDraft])

  useEffect(() => {
    if (!supabase || !week) return undefined
    const refresh = () => loadDraft(week, profiles)
    const channel = supabase.channel(`draft:${week.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `week_id=eq.${week.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'captains', filter: `week_id=eq.${week.id}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [week, profiles, loadDraft])

  const firstManager = profiles.find((item) => item.id === week?.first_manager_id)?.display_name || managers[0]
  const secondManager = managers.find((manager) => manager !== firstManager) || managers[1]
  const currentManager = picks.length % 2 === 0 ? firstManager : secondManager
  const complete = picks.length === 14
  const draftOpen = !supabase
    ? true
    : Boolean(week && profile && clock >= new Date(week.draft_opens_at).getTime() && clock <= new Date(week.draft_closes_at).getTime())
  const queueOpen = !supabase || Boolean(week && profile && clock < new Date(week.draft_closes_at).getTime() && !complete)
  const roster = (manager) => picks.filter((pick) => pick.manager === manager).map((pick) => playerPool.find((player) => String(player.id) === String(pick.playerId))).filter(Boolean)
  const canFitRoster = (player, manager = profile?.display_name ?? currentManager) => {
    const mine = roster(manager)
    const positionCount = mine.filter((item) => item.position === player.position).length
    if (positionCount < rosterLimits[player.position]) return true
    const flexUsed = mine.filter((item) => item.position === 'RB').length > 2
      || mine.filter((item) => item.position === 'WR').length > 2
      || mine.filter((item) => item.position === 'TE').length > 1
    return ['RB', 'WR', 'TE'].includes(player.position) && !flexUsed
  }
  const canDraft = (player, manager = currentManager) => {
    if (!draftOpen || complete || (supabase && profile?.display_name !== currentManager) || picks.some((pick) => String(pick.playerId) === String(player.id))) return false
    return canFitRoster(player, manager)
  }
  const draft = async (player) => {
    if (!canDraft(player)) return
    setError('')
    if (!supabase) { setPicks((old) => [...old, { playerId: player.id, manager: currentManager }]); return }
    if (!week || !profile) { setError('Your live manager profile is not ready. Refresh and sign in again.'); return }
    const { error: pickError } = await supabase.rpc('make_draft_pick', { p_week_id: week.id, p_player_id: String(player.id) })
    if (pickError) setError(pickError.message)
    else await loadDraft(week, profiles)
  }
  const chooseCaptain = async (manager, playerId) => {
    if (supabase && profile?.display_name !== manager) return
    setError('')
    if (!supabase) { setCaptains((old) => ({ ...old, [manager]: playerId })); return }
    if (!week || !profile) { setError('Your live manager profile is not ready. Refresh and sign in again.'); return }
    const { error: captainError } = await supabase.rpc('select_captain', { p_week_id: week.id, p_player_id: String(playerId) })
    if (captainError) setError(captainError.message)
    else await loadDraft(week, profiles)
  }

  const saveQueue = async (playerIds) => {
    if (!queueOpen) return
    setError('')
    if (!supabase) { setQueue(playerIds); return }
    const previous = queue
    setQueue(playerIds)
    const { error: queueError } = await supabase.rpc('set_draft_queue', { p_week_id: week.id, p_player_ids: playerIds })
    if (queueError) { setQueue(previous); setError(queueError.message) }
  }
  const toggleQueue = (playerId) => {
    const id = String(playerId)
    saveQueue(queue.includes(id) ? queue.filter((item) => item !== id) : [...queue, id])
  }
  const moveQueue = (playerId, direction) => {
    const index = queue.indexOf(String(playerId))
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= queue.length) return
    const next = [...queue]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    saveQueue(next)
  }

  return { week, players: playerPool, picks, captains, queue, profile, syncStatus, error, currentManager, complete, draftOpen, queueOpen, roster, canFitRoster, canDraft, draft, chooseCaptain, toggleQueue, moveQueue }
}
