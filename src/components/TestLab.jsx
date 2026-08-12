import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function TestLab({ onBack }) {
  const [state, setState] = useState({ week: null, profiles: [], players: [], picks: [], captains: [], scores: [], results: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data: week, error: weekError } = await supabase.from('weeks').select('*').eq('is_test', true).maybeSingle()
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').order('created_at')
    if (weekError) { setError(weekError.message); return }
    if (!week) { setState({ week: null, profiles: profiles ?? [], players: [], picks: [], captains: [], scores: [], results: [] }); return }
    const [playerResult, pickResult, captainResult, scoreResult, resultResult] = await Promise.all([
      supabase.from('week_players').select('player_id, ranking, projection, opponent, nfl_players!inner(full_name, position, nfl_team, headshot_url, status, injury_notes)').eq('week_id', week.id).eq('available', true).order('ranking', { nullsFirst: false }).limit(80),
      supabase.from('draft_picks').select('pick_number, manager_id, player_id, roster_slot, is_auto_pick').eq('week_id', week.id).order('pick_number'),
      supabase.from('captains').select('manager_id, player_id').eq('week_id', week.id),
      supabase.from('manager_week_scores').select('*').eq('week_id', week.id),
      supabase.from('weekly_results').select('*').eq('week_id', week.id),
    ])
    const firstError = [playerResult, pickResult, captainResult, scoreResult, resultResult].find((item) => item.error)?.error
    if (firstError) { setError(firstError.message); return }
    setState({ week, profiles: profiles ?? [], players: playerResult.data ?? [], picks: pickResult.data ?? [], captains: captainResult.data ?? [], scores: scoreResult.data ?? [], results: resultResult.data ?? [] })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const run = async (fn, args = {}) => {
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc(fn, args)
    if (rpcError) setError(rpcError.message)
    await load(); setBusy(false)
  }
  const player = (id) => state.players.find((item) => item.player_id === id)?.nfl_players
  const nextManager = state.profiles.find((profile) => profile.id === (state.picks.length % 2 === 0 ? state.week?.first_manager_id : state.profiles.find((item) => item.id !== state.week?.first_manager_id)?.id))
  const drafted = new Set(state.picks.map((pick) => pick.player_id))
  const slotOrder = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX']
  const nextNeeds = slotOrder.filter((slot) => !state.picks.some((pick) => pick.manager_id === nextManager?.id && pick.roster_slot === slot))
  const positionRanks = new Map()
  const rankedPlayers = state.players.map((item) => {
    const position = item.nfl_players.position
    const positionRank = (positionRanks.get(position) ?? 0) + 1
    positionRanks.set(position, positionRank)
    return { ...item, positionRank }
  })

  return <div className="test-lab"><header className="draft-nav"><button onClick={onBack} className="back-button">←</button><div><p className="company">Commissioner tools</p><h1>Practice Lab</h1></div><span className="mock-badge">Isolated test data</span></header>
    {!state.week ? <section className="test-intro"><p className="eyebrow">Safe sandbox</p><h2>Run a full week by yourself.</h2><p>This creates a separate practice matchup. Nothing here changes the real season or Luke’s permissions.</p><button disabled={busy} onClick={() => run('start_practice_week')}>Start practice week</button></section> : <>
      <section className="test-toolbar"><div><p className="eyebrow">Practice status</p><h2>{state.week.status.replace('_', ' ')}</h2><span>{state.picks.length}/14 picks · {state.captains.length}/2 captains</span></div><div><button disabled={busy || state.picks.length === 14} onClick={() => run('practice_force_autodraft')}>Force auto-draft</button><button disabled={busy || state.picks.length < 14} onClick={() => run('practice_simulate_final_scores')}>Simulate final scores</button><button className="danger-button" disabled={busy} onClick={() => run('reset_practice_week')}>Reset practice</button></div></section>
      {error && <p className="draft-error">{error}</p>}
      <section className="test-needs"><div><p className="eyebrow">{nextManager?.display_name ?? 'Manager'} needs</p><strong>{nextNeeds.length} spots left</strong></div><div>{slotOrder.map((slot) => <span className={nextNeeds.includes(slot) ? '' : 'filled'} key={slot}><b>{nextNeeds.includes(slot) ? slot : '✓'}</b><small>{nextNeeds.includes(slot) ? (slot === 'FLEX' ? 'RB / WR / TE' : `Need ${slot.replace(/[12]/g, '')}`) : 'Filled'}</small></span>)}</div></section>
      <div className="test-grid"><section className="test-panel"><p className="eyebrow">Manual alternating draft</p><h3>{state.picks.length < 14 ? `${nextManager?.display_name ?? 'Manager'} picks next` : 'Draft complete'}</h3><div className="test-player-list enhanced">{rankedPlayers.filter((item) => !drafted.has(item.player_id)).slice(0, 30).map((item) => <article className="test-player-card" key={item.player_id}><div className="test-headshot">{item.nfl_players.headshot_url ? <img src={item.nfl_players.headshot_url} alt={`${item.nfl_players.full_name} headshot`} loading="lazy" /> : <span>{item.nfl_players.position}</span>}<b>{item.nfl_players.position}{item.positionRank}</b></div><div><h4>{item.nfl_players.full_name}</h4><p>{item.nfl_players.nfl_team} · {item.opponent || 'Practice game'}</p><div><span><small>Rank</small><strong>#{item.ranking ?? '—'}</strong></span><span><small>Projection</small><strong>{item.projection == null ? 'Not available' : `${item.projection} pts`}</strong></span><span><small>Status</small><strong>{item.nfl_players.status}</strong></span></div></div><button disabled={busy || state.picks.length === 14} onClick={() => run('practice_make_pick', { p_player_id: item.player_id })}>Draft {item.nfl_players.position}</button></article>)}</div></section>
      <aside className="test-teams">{state.profiles.map((profile) => { const roster = state.picks.filter((pick) => pick.manager_id === profile.id); const score = state.scores.find((item) => item.manager_id === profile.id); const result = state.results.find((item) => item.manager_id === profile.id); return <section className="test-panel" key={profile.id}><p className="eyebrow">{profile.display_name}</p><h3>{Number(score?.fantasy_points ?? 0).toFixed(2)} pts {result && `· ${result.result}`}</h3>{roster.map((pick) => { const info = player(pick.player_id); const captain = state.captains.some((item) => item.manager_id === profile.id && item.player_id === pick.player_id); return <div className="test-roster-player" key={pick.player_id}><span>{pick.roster_slot}</span><strong>{info?.full_name ?? pick.player_id}{pick.is_auto_pick ? ' · AUTO' : ''}</strong><button className={captain ? 'active' : ''} disabled={busy || state.picks.length < 14} title="Choose captain" onClick={() => run('practice_select_captain', { p_manager_id: profile.id, p_player_id: pick.player_id })}>★</button></div>})}</section> })}</aside></div>
    </>}
  </div>
}
