import { useEffect, useState } from 'react'
import { managers, players, rosterLimits } from '../data/mockPlayers'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function useDraft(weekId = null) {
  const [picks, setPicks] = useState([])
  const [captains, setCaptains] = useState({})
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? 'connecting' : 'demo')

  useEffect(() => {
    if (!supabase || !weekId) return undefined
    let active = true
    const load = async () => {
      const { data, error } = await supabase.from('draft_picks').select('pick_number, manager_id, player_id').eq('week_id', weekId).order('pick_number')
      if (!active) return
      if (error) setSyncStatus('error')
      else { setPicks(data ?? []); setSyncStatus('live') }
    }
    load()
    const channel = supabase.channel(`draft:${weekId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `week_id=eq.${weekId}` }, load).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [weekId])

  const currentManager = managers[picks.length % 2]
  const complete = picks.length === 14
  const roster = (manager) => picks.filter((pick) => pick.manager === manager).map((pick) => players.find((player) => player.id === pick.playerId)).filter(Boolean)
  const canDraft = (player, manager = currentManager) => {
    if (complete || picks.some((pick) => pick.playerId === player.id)) return false
    const mine = roster(manager)
    const positionCount = mine.filter((item) => item.position === player.position).length
    if (positionCount < rosterLimits[player.position]) return true
    const flexUsed = mine.filter((item) => ['RB', 'WR', 'TE'].includes(item.position)).length >= 6
    return ['RB', 'WR', 'TE'].includes(player.position) && !flexUsed
  }
  const draft = async (player) => {
    if (!canDraft(player)) return
    const pick = { playerId: player.id, manager: currentManager }
    if (!supabase || !weekId) { setPicks((old) => [...old, pick]); return }
    const { error } = await supabase.rpc('make_draft_pick', { p_week_id: weekId, p_player_id: String(player.id) })
    if (error) setSyncStatus('error')
  }
  const chooseCaptain = (manager, playerId) => setCaptains((old) => ({ ...old, [manager]: playerId }))

  return { picks, captains, syncStatus, currentManager, complete, roster, canDraft, draft, chooseCaptain }
}
