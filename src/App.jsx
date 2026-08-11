import { useState } from 'react'
import AuthGate from './components/AuthGate'
import DraftRoom from './components/DraftRoom'
import Home from './components/Home'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [view, setView] = useState('home')
  return <AuthGate><main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <button className="sign-out-button" type="button" onClick={() => supabase?.auth.signOut()}>Sign out</button>
    {view === 'home' ? <Home onEnter={() => setView('draft')} /> : <DraftRoom onBack={() => setView('home')} />}
    <footer><span>Rivalry Series</span><p>Built for the weeks that matter.</p><span>Est. 2026</span></footer>
  </main></AuthGate>
}

export default App
