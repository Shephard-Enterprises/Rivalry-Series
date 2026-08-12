import { useMatchup } from '../hooks/useMatchup'

const weeklyDetails = [['Draft', 'Tuesday – Wednesday'], ['Matchup', 'Thursday – Monday'], ['Roster', '7 Players'], ['Scoring', 'Half PPR']]

export default function Home({ onEnter }) {
  const { week, matchup, error, connected } = useMatchup()
  const draftComplete = matchup.some((manager) => manager.rosterSize > 0)
  const gamesStarted = matchup.some((manager) => manager.playersFinal > 0 || manager.score > 0)
  const status = gamesStarted ? 'Scores live' : draftComplete ? 'Rosters set' : 'Draft scheduled'
  return <>
    <header className="brand-header"><div className="brand-mark"><span>RS</span></div><div><p className="company">Shephard Enterprises</p><h1>Rivalry <span>Series</span></h1></div><p className="tagline">One week. One roster. One winner.</p></header>
    <section className="matchup-card">
      <div className="card-topline"><p>NFL Week {week?.nfl_week ?? 1}</p><span className="live-pill"><i /> {status}</span></div>
      <div className="matchup">{matchup.map((manager, index) => <div className="manager-wrap" key={manager.name}><article className="manager"><div className={`avatar avatar-${manager.name.toLowerCase()}`}>{manager.name[0]}</div><p className="manager-label">Manager</p><h2>{manager.name}</h2><p className="live-score">{manager.score.toFixed(2)}</p><p className="score-progress">{manager.rosterSize ? `${manager.playersFinal} of ${manager.rosterSize} final` : 'Roster pending'}</p><p className="record"><strong>{manager.wins}</strong> W&nbsp;&nbsp; <strong>{manager.losses}</strong> L&nbsp;&nbsp; <strong>{manager.ties}</strong> T</p></article>{index === 0 && <div className="versus"><span /><strong>VS</strong><span /></div>}</div>)}</div>
      <div className="draft-panel"><div><span className="eyebrow">Week {week?.nfl_week ?? 1} draft · September 7</span><h3>{gamesStarted ? 'The matchup is live.' : 'The season starts here.'}</h3><p>{connected ? 'Live fantasy scores update automatically throughout every game.' : 'Connect Supabase to enable live matchup scoring.'}</p></div><button onClick={onEnter}>View draft <span>→</span></button></div>
      {error && <p className="draft-error">Live scores could not load: {error}</p>}
    </section>
    <section className="week-section"><div className="section-heading"><div><p className="eyebrow">The format</p><h2>This week</h2></div><p>A new head-to-head battle every week.</p></div><div className="detail-grid">{weeklyDetails.map(([label, value]) => <article className="detail-card" key={label}><div className="detail-icon">{label[0]}</div><div><span>{label}</span><strong>{value}</strong></div></article>)}</div></section>
  </>
}
