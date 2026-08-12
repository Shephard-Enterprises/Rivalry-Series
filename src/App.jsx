import { useEffect, useState } from 'react'
import AuthGate from './components/AuthGate'
import DraftRoom from './components/DraftRoom'
import Home from './components/Home'
import TestLab from './components/TestLab'
import Chat from './components/Chat'
import NotificationPanel from './components/NotificationPanel'
import RivalryHistory from './components/RivalryHistory'
import AdminControlPanel from './components/AdminControlPanel'
import { useSocial } from './hooks/useSocial'
import { usePushNotifications } from './hooks/usePushNotifications'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view')
    return ['draft', 'chat', 'history'].includes(requested) ? requested : 'home'
  })
  const [commissioner, setCommissioner] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const social = useSocial()
  const push = usePushNotifications(social.profile, social.unreadCount)
  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setCommissioner(data.user?.id === 'ec754195-3838-4986-9b84-6d8b6d9dadcd')) }, [])
  return <AuthGate><main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className="app-actions"><button className="chat-button" type="button" onClick={() => setView('chat')} aria-label="Open rivalry chat">💬</button><button className="notification-button" type="button" onClick={() => setNotificationsOpen(true)} aria-label={`${social.unreadCount} unread notifications`}>♢{social.unreadCount > 0 && <span>{social.unreadCount > 9 ? '9+' : social.unreadCount}</span>}</button><button className="sign-out-button" type="button" onClick={() => supabase?.auth.signOut()}>Sign out</button></div>
    {view === 'home' ? <Home onEnter={() => setView('draft')} onHistory={() => setView('history')} onTest={commissioner ? () => setView('test') : null} onAdmin={commissioner ? () => setView('admin') : null} /> : view === 'admin' ? <AdminControlPanel onBack={() => setView('home')} /> : view === 'test' ? <TestLab onBack={() => setView('home')} /> : view === 'chat' ? <Chat social={social} onBack={() => setView('home')} /> : view === 'history' ? <RivalryHistory onBack={() => setView('home')} /> : <DraftRoom onBack={() => setView('home')} />}
    {notificationsOpen && <NotificationPanel social={social} push={push} onClose={() => setNotificationsOpen(false)} onOpenChat={() => setView('chat')} onOpenDraft={() => setView('draft')} />}
    <footer><span>Rivalry Series</span><p>Built on endless friendship</p><span>Est. 2026</span></footer>
  </main></AuthGate>
}

export default App
