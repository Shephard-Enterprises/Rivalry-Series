import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const jsonHeaders = { 'Content-Type': 'application/json' }

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('SLEEPER_SYNC_SECRET')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!url || !key || !secret || !publicKey || !privateKey) return new Response(JSON.stringify({ error: 'Missing environment' }), { status: 500, headers: jsonHeaders })
  if (request.method !== 'POST' || request.headers.get('x-sync-secret') !== secret) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })

  webpush.setVapidDetails('mailto:justinshephard8@gmail.com', publicKey, privateKey)
  const admin = createClient(url, key)
  const body = await request.json().catch(() => ({}))
  const delaySeconds = Math.min(Math.max(Number(body.delay_seconds) || 0, 0), 10)
  if (delaySeconds) await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000))
  let notificationQuery = admin.from('notifications')
    .select('id, recipient_id, type, title, body, data').is('push_sent_at', null).lte('push_not_before', new Date().toISOString()).order('created_at').limit(50)
  if (body.notification_id) notificationQuery = notificationQuery.eq('id', body.notification_id)
  const { data: notifications, error } = await notificationQuery
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders })

  let delivered = 0
  for (const notification of notifications ?? []) {
    const { data: preferences } = await admin.from('notification_preferences').select('*').eq('user_id', notification.recipient_id).maybeSingle()
    const enabled = notification.type === 'message'
      ? (notification.data?.message_type === 'gif' ? preferences?.gif_messages : preferences?.chat_messages)
      : notification.type === 'reaction' ? preferences?.reactions
      : ['draft_open', 'draft_turn', 'draft_auto_pick', 'draft_deadline', 'captain_selection', 'captain_reminder', 'queue_stolen'].includes(notification.type) ? preferences?.draft_alerts
      : ['kickoff', 'matchup_final', 'win_probability'].includes(notification.type) ? preferences?.scoring_alerts
      : notification.type === 'recap_ready' ? preferences?.recap_alerts
      : true
    if (preferences && enabled === false) {
      await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', notification.id)
      continue
    }
    const { data: subscriptions } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', notification.recipient_id)
    for (const subscription of subscriptions ?? []) {
      try {
        const destination = ['message', 'reaction'].includes(notification.type) ? './?view=chat'
          : ['draft_open', 'draft_turn', 'draft_auto_pick', 'draft_deadline', 'captain_selection', 'captain_reminder', 'queue_stolen'].includes(notification.type) ? './?view=draft'
          : notification.type === 'recap_ready' ? './?view=history' : './'
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
          title: notification.title, body: notification.body, tag: `${notification.type}:${notification.id}`, url: destination,
        }))
        delivered += 1
      } catch (pushError: any) {
        if ([404, 410].includes(pushError?.statusCode)) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      }
    }
    await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', notification.id)
  }
  return new Response(JSON.stringify({ success: true, notifications: notifications?.length ?? 0, delivered }), { headers: jsonHeaders })
})
