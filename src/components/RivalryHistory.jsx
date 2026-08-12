import { useMemo } from 'react'
import { useRecaps } from '../hooks/useRecaps'

export default function RivalryHistory({ onBack }) {
  const { recaps, error } = useRecaps()
  const stats = useMemo(() => {
    const wins = { Justin: 0, Luke: 0 }
    let ties = 0
    for (const report of recaps) {
      if (report.winner_name) wins[report.winner_name] = (wins[report.winner_name] ?? 0) + 1
      else ties += 1
    }
    const decided = recaps.filter((report) => report.winner_name)
    const latestWinner = decided[0]?.winner_name
    let streak = 0
    for (const report of decided) {
      if (report.winner_name !== latestWinner) break
      streak += 1
    }
    const biggest = [...decided].sort((a, b) => Number(b.margin) - Number(a.margin))[0]
    const closest = [...decided].sort((a, b) => Number(a.margin) - Number(b.margin))[0]
    const scores = recaps.flatMap((report) => [
      { manager: report.winner_name ?? 'Justin', score: Number(report.winner_score), week: report.weeks.nfl_week },
      { manager: report.loser_name ?? 'Luke', score: Number(report.loser_score), week: report.weeks.nfl_week },
    ]).sort((a, b) => b.score - a.score)
    return { wins, ties, latestWinner, streak, biggest, closest, highest: scores[0] }
  }, [recaps])

  return <div className="history-page"><header className="draft-nav"><button onClick={onBack} className="back-button">←</button><div><p className="company">Since 2026</p><h1>Rivalry History</h1></div><span className="mock-badge">Justin vs Luke</span></header>
    <section className="history-hero"><p className="eyebrow">All-time series</p><div><article><span>Justin</span><strong>{stats.wins.Justin}</strong><small>Wins</small></article><div><b>{stats.ties}</b><span>Ties</span></div><article><span>Luke</span><strong>{stats.wins.Luke}</strong><small>Wins</small></article></div><p>{recaps.length ? stats.wins.Justin === stats.wins.Luke ? 'The rivalry is dead even.' : `${stats.wins.Justin > stats.wins.Luke ? 'Justin' : 'Luke'} owns the bragging rights—for now.` : 'The first chapter is waiting to be written.'}</p></section>
    {recaps.length > 0 && <section className="history-records"><article><span>🔥</span><div><small>Current streak</small><strong>{stats.latestWinner} · {stats.streak} {stats.streak === 1 ? 'win' : 'wins'}</strong></div></article><article><span>💥</span><div><small>Biggest blowout</small><strong>{stats.biggest.winner_name} · +{Number(stats.biggest.margin).toFixed(2)}</strong><p>Week {stats.biggest.weeks.nfl_week}</p></div></article><article><span>📸</span><div><small>Closest finish</small><strong>{stats.closest.winner_name} · +{Number(stats.closest.margin).toFixed(2)}</strong><p>Week {stats.closest.weeks.nfl_week}</p></div></article><article><span>👑</span><div><small>Highest score</small><strong>{stats.highest.manager} · {stats.highest.score.toFixed(2)}</strong><p>Week {stats.highest.week}</p></div></article></section>}
    <section className="history-timeline"><div className="section-heading"><div><p className="eyebrow">The archive</p><h2>Every Scroober Report</h2></div><p>{recaps.length} completed {recaps.length === 1 ? 'matchup' : 'matchups'}.</p></div>{error && <p className="draft-error">History could not load: {error}</p>}{recaps.length === 0 ? <div className="history-empty"><strong>No final scores yet.</strong><span>The first Scroober Scrimage Report will appear here after Week 1.</span></div> : <div className="timeline-list">{recaps.map((report) => <article key={report.week_id}><div className="timeline-marker"><span>{report.weeks.nfl_week}</span></div><div className="timeline-report"><header><span>Week {report.weeks.nfl_week} · {report.weeks.season}</span><strong>{report.winner_name ? `${report.winner_name} won` : 'Tie'}</strong></header><h3>{report.headline}</h3><div><span>{report.winner_name ?? 'Justin'} <b>{Number(report.winner_score).toFixed(2)}</b></span><i>{Number(report.margin) === 0 ? 'TIE' : `+${Number(report.margin).toFixed(2)}`}</i><span><b>{Number(report.loser_score).toFixed(2)}</b> {report.loser_name ?? 'Luke'}</span></div><footer><span>MVP · {report.mvp_name}</span><span>Captain bonus · +{Number(report.captain_bonus).toFixed(2)}</span></footer></div></article>)}</div>}</section>
  </div>
}
