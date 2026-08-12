import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const providerConfig = [
  { id: 'sleeper', action: 'players', label: 'Player catalog', source: 'Sleeper', maxAge: 26 * 60 * 60 * 1000 },
  { id: 'nflverse-schedule', action: 'schedule', label: 'NFL schedule', source: 'nflverse', maxAge: 26 * 60 * 60 * 1000 },
  { id: 'espn-news', action: 'news', label: 'Fantasy news', source: 'ESPN', maxAge: 60 * 60 * 1000 },
  { id: 'espn-live-stats', action: 'scores', label: 'Live scoring', source: 'ESPN', maxAge: 12 * 60 * 1000 },
]

const formatDate = (value) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Never'
const relative = (value, now) => {
  if (!value) return 'No successful run yet'
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000))
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`
}

export default function AdminControlPanel({ onBack }) {
  const [state, setState] = useState({ week: null, logs: [], players: [], picks: [], captains: [] })
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [checkedAt, setCheckedAt] = useState(() => Date.now())

  const load = useCallback(async () => {
    setError('')
    const [weekResult, logsResult] = await Promise.all([
      supabase.from('weeks').select('*').eq('is_test', false).in('status', ['scheduled', 'drafting', 'captain_selection', 'live']).order('draft_opens_at').limit(1).maybeSingle(),
      supabase.from('provider_sync_log').select('*').order('started_at', { ascending: false }).limit(80),
    ])
    if (weekResult.error || logsResult.error) { setError(weekResult.error?.message || logsResult.error?.message); setLoading(false); return }
    const week = weekResult.data
    let players = []; let picks = []; let captains = []
    if (week) {
      const results = await Promise.all([
        supabase.from('week_players').select('available, game_starts_at, nfl_players!inner(status, position)').eq('week_id', week.id),
        supabase.from('draft_picks').select('id').eq('week_id', week.id),
        supabase.from('captains').select('manager_id').eq('week_id', week.id),
      ])
      const firstError = results.find((result) => result.error)?.error
      if (firstError) setError(firstError.message)
      else [players, picks, captains] = results.map((result) => result.data ?? [])
    }
    setState({ week, logs: logsResult.data ?? [], players, picks, captains }); setCheckedAt(Date.now()); setLoading(false)
  }, [])

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  const services = useMemo(() => providerConfig.map((provider) => {
    const logs = state.logs.filter((log) => log.provider === provider.id)
    const latest = logs[0]
    const success = logs.find((log) => log.status === 'success')
    const liveStandby = provider.id === 'espn-live-stats' && state.week?.status !== 'live'
    const healthy = success && (liveStandby || checkedAt - new Date(success.finished_at || success.started_at).getTime() < provider.maxAge)
    return { ...provider, latest, success, health: latest?.status === 'error' ? 'error' : liveStandby ? 'standby' : healthy ? 'healthy' : 'stale' }
  }), [state.logs, state.week, checkedAt])
  const playerSummary = useMemo(() => state.players.reduce((summary, row) => {
    summary.total += 1
    if (row.available) summary.available += 1
    if (row.nfl_players.status === 'questionable' || row.nfl_players.status === 'doubtful') summary.flagged += 1
    if (['out', 'inactive', 'bye'].includes(row.nfl_players.status)) summary.unavailable += 1
    return summary
  }, { total: 0, available: 0, flagged: 0, unavailable: 0 }), [state.players])
  const runSync = async (service) => {
    setRunning(service.action); setError(''); setMessage(`Running ${service.label} sync…`)
    const { data, error: functionError } = await supabase.functions.invoke('commissioner-control', { body: { action: service.action } })
    if (functionError || data?.error) setError(functionError?.message || data.error)
    else setMessage(`${service.label} sync completed successfully.`)
    await load(); setRunning('')
  }

  return <div className="admin-page"><header className="draft-nav"><button onClick={onBack} className="back-button">←</button><div><p className="company">Commissioner tools</p><h1>Week Control Center</h1></div><span className="mock-badge">Justin only</span></header>
    {loading ? <section className="admin-loading">Checking every system…</section> : <>
      <section className="admin-overview"><div><p className="eyebrow">System status</p><h2>{services.every((service) => ['healthy', 'standby'].includes(service.health)) ? 'Ready for kickoff' : 'Needs attention'}</h2><p>{services.filter((service) => service.health === 'error').length} errors · {services.filter((service) => service.health === 'stale').length} stale feeds</p></div><button type="button" onClick={load}>Refresh status</button></section>
      {message && <p className="admin-message">{message}</p>}{error && <p className="draft-error" role="alert">{error}</p>}
      <section className="admin-services"><div className="section-heading"><div><p className="eyebrow">Connected providers</p><h2>Data feeds</h2></div><p>Manual runs are safe and do not erase existing data.</p></div><div className="admin-service-grid">{services.map((service) => <article className={`admin-service ${service.health}`} key={service.id}><header><div><i /><span>{service.health}</span></div><small>{service.source}</small></header><h3>{service.label}</h3><p>{relative(service.success?.finished_at || service.success?.started_at, checkedAt)}</p><small>Last attempt: {formatDate(service.latest?.started_at)}</small>{service.latest?.status === 'error' && <em>{service.latest.error_message}</em>}<button disabled={Boolean(running)} onClick={() => runSync(service)}>{running === service.action ? 'Running…' : 'Run now'}</button></article>)}</div></section>
      <section className="admin-readiness"><div className="section-heading"><div><p className="eyebrow">Real matchup</p><h2>Week readiness</h2></div><p>{state.week ? `Season ${state.week.season} · NFL Week ${state.week.nfl_week}` : 'No active week'}</p></div>{state.week ? <div className="readiness-grid"><article><span>Week status</span><strong>{state.week.status.replace('_', ' ')}</strong><small>Draft opens {formatDate(state.week.draft_opens_at)}</small></article><article><span>Draft</span><strong>{state.picks.length} / 14 picks</strong><small>Closes {formatDate(state.week.draft_closes_at)}</small></article><article><span>Captains</span><strong>{state.captains.length} / 2 locked</strong><small>Lock {formatDate(state.week.captain_locks_at)}</small></article><article><span>Player pool</span><strong>{playerSummary.available} available</strong><small>{playerSummary.total} total · {playerSummary.flagged} injury flags · {playerSummary.unavailable} unavailable</small></article></div> : <div className="admin-empty">No scheduled or active real week was found.</div>}</section>
      <section className="admin-log"><div className="section-heading"><div><p className="eyebrow">Diagnostics</p><h2>Recent activity</h2></div></div><div>{state.logs.slice(0, 12).map((log) => <article key={log.id}><i className={log.status} /><div><strong>{log.provider.replaceAll('-', ' ')}</strong><span>{log.error_message || `${log.records_processed} records processed`}</span></div><time>{formatDate(log.started_at)}</time></article>)}</div></section>
    </>}
  </div>
}
