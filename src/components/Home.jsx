import { useMatchup } from '../hooks/useMatchup'
import { useNews } from '../hooks/useNews'

const weeklyDetails = [['Draft', 'Tuesday – Wednesday'], ['Matchup', 'Thursday – Monday'], ['Roster', '7 Players'], ['Scoring', 'Half PPR']]

export default function Home({ onEnter, onTest }) {
  const { week, matchup, error, connected } = useMatchup()
  const { articles, loading: newsLoading, error: newsError } = useNews()
  const draftComplete = matchup.some((manager) => manager.rosterSize > 0)
  const gamesStarted = matchup.some((manager) => manager.playersFinal > 0 || manager.score > 0)
  const status = gamesStarted ? 'Scores live' : draftComplete ? 'Rosters set' : 'Draft scheduled'
  return <>
    <header className="brand-header"><div className="brand-mark"><span>RS</span></div><div><p className="company">Shephard Enterprises</p><h1>Rivalry <span>Series</span></h1></div><p className="tagline">One week. One roster. One winner.</p></header>
    <section className="matchup-card">
      <div className="card-topline"><p>NFL Week {week?.nfl_week ?? 1}</p><span className="live-pill"><i /> {status}</span></div>
      <div className="matchup">{matchup.map((manager, index) => <div className="manager-wrap" key={manager.name}><article className="manager"><div className={`avatar avatar-${manager.name.toLowerCase()}`}>{manager.name[0]}</div><p className="manager-label">Manager</p><h2>{manager.name}</h2><p className="live-score">{manager.score.toFixed(2)}</p><p className="score-progress">{manager.rosterSize ? `${manager.playersFinal} of ${manager.rosterSize} final` : 'Roster pending'}</p><p className="record"><strong>{manager.wins}</strong> W&nbsp;&nbsp; <strong>{manager.losses}</strong> L&nbsp;&nbsp; <strong>{manager.ties}</strong> T</p></article>{index === 0 && <div className="versus"><span /><strong>VS</strong><span /></div>}</div>)}</div>
      <div className="draft-panel"><div><span className="eyebrow">Week {week?.nfl_week ?? 1} draft · September 7</span><h3>{gamesStarted ? 'The matchup is live.' : 'The season starts here.'}</h3><p>{connected ? 'Live fantasy scores update automatically throughout every game.' : 'Connect Supabase to enable live matchup scoring.'}</p></div><div className="home-actions">{onTest && <button className="test-button" onClick={onTest}>Practice lab</button>}<button onClick={onEnter}>View draft <span>→</span></button></div></div>
      {error && <p className="draft-error">Live scores could not load: {error}</p>}
    </section>
    <section className="week-section"><div className="section-heading"><div><p className="eyebrow">The format</p><h2>This week</h2></div><p>A new head-to-head battle every week.</p></div><div className="detail-grid">{weeklyDetails.map(([label, value]) => <article className="detail-card" key={label}><div className="detail-icon">{label[0]}</div><div><span>{label}</span><strong>{value}</strong></div></article>)}</div></section>
    <section className="news-section"><div className="section-heading"><div><p className="eyebrow">Around the league</p><h2>NFL news</h2></div><p>Latest headlines from ESPN.</p></div>{newsLoading ? <div className="news-loading">Loading the latest stories…</div> : articles.length ? <div className="news-grid">{articles.map((article, index) => <a className={index === 0 ? 'news-card news-featured' : 'news-card'} href={article.article_url} target="_blank" rel="noreferrer" key={article.id}>{article.image_url && <img src={article.image_url} alt="" loading="lazy" />}<div><span>{article.source} · {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(article.published_at))}</span><h3>{article.headline}</h3>{index === 0 && article.description && <p>{article.description}</p>}<strong>Read story →</strong></div></a>)}</div> : <div className="news-loading">News is being refreshed. Check back shortly.</div>}{newsError && <p className="news-error">News could not refresh: {newsError}</p>}<p className="news-credit">Headlines and images provided by ESPN. Links open the original story.</p></section>
  </>
}
