import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const vapidPublicKey = 'BNfVd1vCVClNOdPH2Z-A2tcX4IF0ONTy-X7pGTvU8lGBRUwL5bfRF6OQet5PyZu1zFy6d4V9qevIXG6w95fIW18'

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}

export function usePushNotifications(profile, unreadCount) {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const isiPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const [status, setStatus] = useState(supported ? 'checking' : 'unsupported')
  const [error, setError] = useState('')

  const syncSubscription = useCallback(async (subscription) => {
    if (!profile || !subscription) return
    const json = subscription.toJSON()
    const { error: saveError } = await supabase.from('push_subscriptions').upsert({
      user_id: profile.id, endpoint: json.endpoint, p256dh: json.keys.p256dh,
      auth: json.keys.auth, user_agent: navigator.userAgent, updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })
    if (saveError) throw saveError
  }, [profile])

  useEffect(() => {
    if (!supported || !profile) return undefined
    let active = true
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await syncSubscription(subscription)
      if (active) setStatus(subscription ? 'enabled' : Notification.permission === 'denied' ? 'denied' : 'available')
    }).catch((registrationError) => { if (active) { setError(registrationError.message); setStatus('error') } })
    return () => { active = false }
  }, [profile, supported, syncSubscription])

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (unreadCount > 0) navigator.setAppBadge(unreadCount).catch(() => {})
    else navigator.clearAppBadge().catch(() => {})
  }, [unreadCount])

  const enable = async () => {
    setError('')
    if (isiPhone && !standalone) { setStatus('install_required'); return }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); return }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(vapidPublicKey) })
      await syncSubscription(subscription); setStatus('enabled')
    } catch (pushError) { setError(pushError.message); setStatus('error') }
  }

  return { status, error, enable, isiPhone, standalone }
}
