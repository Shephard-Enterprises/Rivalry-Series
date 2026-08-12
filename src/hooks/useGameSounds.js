import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const notificationCue = (type) => {
  if (['message', 'reaction'].includes(type)) return 'chat'
  if (['draft_open', 'draft_turn', 'draft_deadline'].includes(type)) return 'clock'
  if (['draft_auto_pick', 'queue_stolen'].includes(type)) return 'pick'
  if (['captain_selection', 'captain_reminder'].includes(type)) return 'captain'
  if (type === 'win_probability') return 'lead'
  if (['matchup_final', 'recap_ready'].includes(type)) return 'victory'
  return null
}

const patterns = {
  chat: [[660, 0, .08, 'sine'], [880, .07, .11, 'sine']],
  clock: [[440, 0, .09, 'square'], [440, .14, .09, 'square'], [660, .28, .14, 'square']],
  pick: [[330, 0, .07, 'triangle'], [495, .07, .08, 'triangle'], [740, .15, .2, 'triangle']],
  captain: [[392, 0, .12, 'triangle'], [523, .1, .12, 'triangle'], [659, .2, .12, 'triangle'], [784, .3, .28, 'triangle']],
  touchdown: [[196, 0, .1, 'sawtooth'], [294, .09, .1, 'sawtooth'], [392, .18, .1, 'sawtooth'], [587, .27, .3, 'sawtooth']],
  lead: [[523, 0, .11, 'square'], [659, .11, .11, 'square'], [523, .22, .11, 'square'], [784, .33, .22, 'square']],
  victory: [[262, 0, .18, 'triangle'], [330, .13, .18, 'triangle'], [392, .26, .18, 'triangle'], [523, .39, .45, 'triangle'], [659, .39, .45, 'triangle']],
}

export function useGameSounds(profile, week) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('rivalry-sounds') !== 'off')
  const contextRef = useRef(null)

  const context = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    contextRef.current ??= new AudioContext()
    return contextRef.current
  }, [])

  const play = useCallback((cue, force = false) => {
    if ((!enabled && !force) || !patterns[cue]) return
    const audio = context()
    if (!audio) return
    const perform = () => {
      const start = audio.currentTime + .015
      for (const [frequency, delay, duration, wave] of patterns[cue]) {
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        oscillator.type = wave; oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(.0001, start + delay)
        gain.gain.exponentialRampToValueAtTime(.075, start + delay + .012)
        gain.gain.exponentialRampToValueAtTime(.0001, start + delay + duration)
        oscillator.connect(gain).connect(audio.destination)
        oscillator.start(start + delay); oscillator.stop(start + delay + duration + .02)
      }
    }
    if (audio.state === 'suspended') audio.resume().then(perform).catch(() => {})
    else if (audio.state === 'running') perform()
  }, [context, enabled])

  useEffect(() => {
    const unlock = () => context()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [context])

  useEffect(() => {
    if (!supabase || !profile || !week) return undefined
    const channel = supabase.channel(`sounds:${profile.id}:${week.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, ({ new: item }) => { const cue = notificationCue(item.type); if (cue) play(cue) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `week_id=eq.${week.id}` }, () => play('pick'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'captains', filter: `week_id=eq.${week.id}` }, () => play('captain'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_day_events', filter: `week_id=eq.${week.id}` }, ({ new: item }) => play(item.type === 'touchdown' ? 'touchdown' : item.type === 'lead_change' ? 'lead' : item.type === 'matchup_final' ? 'victory' : null))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, week, play])

  const toggle = () => {
    const next = !enabled
    setEnabled(next); localStorage.setItem('rivalry-sounds', next ? 'on' : 'off')
    if (next) window.setTimeout(() => { context(); }, 0)
  }

  const preview = () => play('touchdown', true)
  return { enabled, toggle, preview }
}
