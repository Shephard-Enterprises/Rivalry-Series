import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useSocial() {
  const [week, setWeek] = useState(null)
  const [profile, setProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [notifications, setNotifications] = useState([])
  const [reactions, setReactions] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async (activeWeek, currentProfile) => {
    if (!supabase || !currentProfile) return
    const messageQuery = activeWeek
      ? supabase.from('week_messages').select('id, week_id, sender_id, body, message_type, gif_id, gif_url, gif_title, reply_to_id, edited_at, created_at, profiles!week_messages_sender_id_fkey(display_name), weeks!inner(season)').eq('weeks.season', activeWeek.season).eq('weeks.is_test', false).order('created_at').limit(500)
      : Promise.resolve({ data: [], error: null })
    const messageResult = await messageQuery
    const messageIds = messageResult.data?.map((item) => item.id) ?? []
    const [notificationResult, reactionResult] = await Promise.all([
      supabase.from('notifications').select('id, week_id, type, title, body, data, read_at, created_at').order('created_at', { ascending: false }).limit(50),
      activeWeek && messageIds.length ? supabase.from('message_reactions').select('message_id, user_id, emoji, profiles!message_reactions_user_id_fkey(display_name)').in('message_id', messageIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (messageResult.error || notificationResult.error || reactionResult.error) { setError(messageResult.error?.message || notificationResult.error?.message || reactionResult.error?.message); return }
    setMessages(messageResult.data ?? [])
    setNotifications(notificationResult.data ?? [])
    setReactions(reactionResult.data ?? [])
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'week_messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [week, profile, load])

  const sendMessage = async (body, options = {}) => {
    const message = body.trim()
    if ((!message && !options.gif) || !week || !profile) return false
    setError('')
    const payload = options.gif ? { week_id: week.id, sender_id: profile.id, body: null, message_type: 'gif', gif_id: options.gif.id, gif_url: options.gif.image_url, gif_title: options.gif.title, reply_to_id: options.replyToId || null } : { week_id: week.id, sender_id: profile.id, body: message, message_type: 'text', reply_to_id: options.replyToId || null }
    const { error: sendError } = await supabase.from('week_messages').insert(payload)
    if (sendError) { setError(sendError.message); return false }
    await load(week, profile); return true
  }
  const editMessage = async (id, body) => {
    const message = body.trim()
    if (!message) return false
    const { error: editError } = await supabase.from('week_messages').update({ body: message, edited_at: new Date().toISOString() }).eq('id', id).eq('sender_id', profile.id)
    if (editError) { setError(editError.message); return false }
    await load(week, profile); return true
  }
  const deleteMessage = async (id) => {
    const { error: deleteError } = await supabase.from('week_messages').delete().eq('id', id).eq('sender_id', profile.id)
    if (deleteError) { setError(deleteError.message); return false }
    await load(week, profile); return true
  }
  const toggleReaction = async (messageId, emoji) => {
    const existing = reactions.find((item) => item.message_id === messageId && item.user_id === profile.id && item.emoji === emoji)
    const result = existing
      ? await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', profile.id).eq('emoji', emoji)
      : await supabase.from('message_reactions').insert({ message_id: messageId, user_id: profile.id, emoji })
    if (result.error) setError(result.error.message)
    else await load(week, profile)
  }
  const markRead = async () => {
    const unread = notifications.filter((item) => !item.read_at).map((item) => item.id)
    if (!unread.length) return
    await supabase.rpc('mark_notifications_read', { p_notification_ids: unread })
    await load(week, profile)
  }

  return { week, profile, messages, reactions, notifications, unreadCount: notifications.filter((item) => !item.read_at).length, error, sendMessage, editMessage, deleteMessage, toggleReaction, markRead }
}
