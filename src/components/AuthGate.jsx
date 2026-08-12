import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

function isPasswordSetupLink() {
  const hashType = new URLSearchParams(window.location.hash.slice(1)).get('type')
  const queryType = new URLSearchParams(window.location.search).get('type')
  return ['invite', 'recovery'].includes(hashType) || ['invite', 'recovery'].includes(queryType)
}

function AuthCard({ eyebrow, title, description, children }) {
  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand"><div className="brand-mark brand-image"><img src={`${import.meta.env.BASE_URL}rivalry-logo.jpg`} alt="Rivalry Series" /></div><div><p className="company">Shephard Enterprises</p><h1>Rivalry <span>Series</span></h1></div></div>
      <div className="auth-copy"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>
      {children}
      <p className="auth-tagline">One week. One roster. One winner.</p>
    </section>
  </main>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) setError(authError.message)
    setBusy(false)
  }

  return <AuthCard eyebrow="Manager access" title="Welcome back." description="Sign in to enter this week’s Rivalry Series matchup.">
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </AuthCard>
}

function SetPassword({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault(); setError('')
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('The passwords do not match.'); return }
    setBusy(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (authError) { setError(authError.message); return }
    window.history.replaceState({}, document.title, window.location.pathname)
    onComplete()
  }

  return <AuthCard eyebrow="Invitation accepted" title="Create your password." description="Choose the private password you’ll use to access Rivalry Series.">
    <form className="auth-form" onSubmit={submit}>
      <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength="8" required /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Enter it again" minLength="8" required /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create password'}</button>
    </form>
  </AuthCard>
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [needsPassword, setNeedsPassword] = useState(isPasswordSetupLink)

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return children
  if (loading) return <AuthCard eyebrow="Rivalry Series" title="Loading…" description="Checking your manager session." />
  if (session && needsPassword) return <SetPassword onComplete={() => setNeedsPassword(false)} />
  if (!session) return <Login />
  return children
}
