import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useRecaps() {
  const [recaps, setRecaps] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const load = async () => {
      const { data, error: recapError } = await supabase.from('weekly_recaps')
        .select('*, weeks!inner(season, nfl_week)').eq('is_test', false).order('created_at', { ascending: false }).limit(18)
      if (!active) return
      if (recapError) setError(recapError.message)
      else setRecaps(data ?? [])
    }
    load()
    const channel = supabase.channel('scroober-reports').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'weekly_recaps' }, load).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [])
  return { recaps, error }
}
