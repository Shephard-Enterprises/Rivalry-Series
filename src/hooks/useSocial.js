import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useSocial() {
  const [week, setWeek] = useState(null)
  const [profile, setProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async (activeWeek, currentProfile) => {
    if (!supabase || !currentProfile) return
    const messageQuery = activeWeek
      ? supabase.from('week_messages').select('id, sender_id, body, created_at, profiles!inner(display_name)').eq('week_id', activeWeek.id).order('created_at').limit(200)
      : Promise.resolve({ data: [], error: null })
    const [messageResult, notificationResult] = await Promise.all([
      messageQuery,
      supabase.from('notifications').select('id, week_id, type, title, body, data, read_at, created_at').order('created_at', { ascending: false }).limit(50),
    ])
    if (messageResult.error || notificationResult.error) { setError(messageResult.error?.message || notificationResult.error?.message); return }
    setMessages(messageResult.data ?? [])
    setNotifications(notificationResult.data ?? [])
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('weeks').select('id, season, nfl_week').eq('is_test', false).in('status', ['scheduled', 'drafting', 'captain_selection', 'live']).order('draft_opens_at').limit(1).maybeSingle(),
    ]).then(([userResult, profileResult, weekResult]) => {
      if (!active) return
      const currentProfile = profileResult.data?.find((item) => item.id === userResult.data.user?.id)
      setProfile(currentProfile ?? null); setWeek(weekResult.data ?? null)
      load(weekResult.data ?? null, currentProfile ?? null)
    })
    return () => { active = false }
  }, [load])

  useEffect(() => {
    if (!supabase || !profile) return undefined
    const refresh = () => load(week, profile)
    const channel = supabase.channel(`social:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'week_messages', filter: week ? `week_id=eq.${week.id}` : undefined }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [week, profile, load])

  const sendMessage = async (body) => {
    const message = body.trim()
    if (!message || !week || !profile) return false
    setError('')
    const { error: sendError } = await supabase.from('week_messages').insert({ week_id: week.id, sender_id: profile.id, body: message })
    if (sendError) { setError(sendError.message); return false }
    await load(week, profile); return true
  }
  const markRead = async () => {
    const unread = notifications.filter((item) => !item.read_at).map((item) => item.id)
    if (!unread.length) return
    await supabase.rpc('mark_notifications_read', { p_notification_ids: unread })
    await load(week, profile)
  }

  return { week, profile, messages, notifications, unreadCount: notifications.filter((item) => !item.read_at).length, error, sendMessage, markRead }
}
