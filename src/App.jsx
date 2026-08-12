import { useEffect, useState } from 'react'
import AuthGate from './components/AuthGate'
import DraftRoom from './components/DraftRoom'
import Home from './components/Home'
import TestLab from './components/TestLab'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [view, setView] = useState('home')
  const [commissioner, setCommissioner] = useState(false)
  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setCommissioner(data.user?.id === 'ec754195-3838-4986-9b84-6d8b6d9dadcd')) }, [])
  return <AuthGate><main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <button className="sign-out-button" type="button" onClick={() => supabase?.auth.signOut()}>Sign out</button>
    {view === 'home' ? <Home onEnter={() => setView('draft')} onTest={commissioner ? () => setView('test') : null} /> : view === 'test' ? <TestLab onBack={() => setView('home')} /> : <DraftRoom onBack={() => setView('home')} />}
    <footer><span>Rivalry Series</span><p>Built for the weeks that matter.</p><span>Est. 2026</span></footer>
  </main></AuthGate>
}

export default App
