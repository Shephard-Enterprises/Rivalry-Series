import { useMatchup } from '../hooks/useMatchup'
import { useNews } from '../hooks/useNews'
import LiveMatchup from './LiveMatchup'
import GameDayTimeline from './GameDayTimeline'
import ScrooberReport from './ScrooberReport'
import { useRecaps } from '../hooks/useRecaps'

const weeklyDetails = [['Draft', 'Tuesday – Wednesday'], ['Matchup', 'Thursday – Monday'], ['Roster', '7 Players'], ['Scoring', 'Half PPR']]

export default function Home({ onEnter, onHistory, onTest, onAdmin }) {
  const { week, matchup, timeline, lastScoreSync, error, connected } = useMatchup()
  const { articles, loading: newsLoading, error: newsError } = useNews()
  const { recaps, error: recapError } = useRecaps()
  const draftComplete = matchup.some((manager) => manager.rosterSize > 0)
  const gamesStarted = matchup.some((manager) => manager.playersFinal > 0 || manager.score > 0)
  const status = gamesStarted ? 'Scores live' : draftComplete ? 'Rosters set' : 'Draft scheduled'
  return <>
    <header className="brand-header"><div className="brand-mark brand-image"><img src={`${import.meta.env.BASE_URL}rivalry-logo.jpg`} alt="Rivalry Series" /></div><div><p className="company">Shephard Enterprises</p><h1>Rivalry <span>Series</span></h1></div><p className="tagline">One week. One roster. One winner.</p></header>
    <section className="matchup-card">
      <div className="card-topline"><p>NFL Week {week?.nfl_week ?? 1}</p><span className="live-pill"><i /> {status}</span></div>
      <div className="matchup">{matchup.map((manager, index) => <div className="manager-wrap" key={manager.name}><article className="manager"><div className={`avatar avatar-${manager.name.toLowerCase()}`}>{manager.name[0]}</div><p className="manager-label">Manager</p><h2>{manager.name}</h2><p className="live-score">{manager.score.toFixed(2)}</p><p className="score-progress">{manager.rosterSize ? `${manager.playersFinal} of ${manager.rosterSize} final` : 'Roster pending'}</p><p className="record"><strong>{manager.wins}</strong> W&nbsp;&nbsp; <strong>{manager.losses}</strong> L&nbsp;&nbsp; <strong>{manager.ties}</strong> T</p></article>{index === 0 && <div className="versus"><span /><strong>VS</strong><span /></div>}</div>)}</div>
      <div className="draft-panel"><div><span className="eyebrow">Week {week?.nfl_week ?? 1} draft · September 7</span><h3>{gamesStarted ? 'The matchup is live.' : 'The season starts here.'}</h3><p>{connected ? 'Live fantasy scores update automatically throughout every game.' : 'Connect Supabase to enable live matchup scoring.'}</p></div><div className="home-actions">{onAdmin && <button className="test-button" onClick={onAdmin}>Control center</button>}{onTest && <button className="test-button" onClick={onTest}>Practice lab</button>}<button className="history-button" onClick={onHistory}>History</button><button onClick={onEnter}>View draft <span>→</span></button></div></div>
      {error && <p className="draft-error">Live scores could not load: {error}</p>}
    </section>
    <LiveMatchup matchup={matchup} lastScoreSync={lastScoreSync} />
    <GameDayTimeline events={timeline} />
    <ScrooberReport report={recaps[0]} />
    {recapError && <p className="draft-error">The Scroober Scrimage Report could not load: {recapError}</p>}
    <section className="week-section"><div className="section-heading"><div><p className="eyebrow">The format</p><h2>This week</h2></div><p>A new head-to-head battle every week.</p></div><div className="detail-grid">{weeklyDetails.map(([label, value]) => <article className="detail-card" key={label}><div className="detail-icon">{label[0]}</div><div><span>{label}</span><strong>{value}</strong></div></article>)}</div></section>
    <section className="news-section"><div className="section-heading"><div><p className="eyebrow">Draft smarter</p><h2>Fantasy football news</h2></div><p>Fantasy analysis, rankings, injuries and player buzz from ESPN.</p></div>{newsLoading ? <div className="news-loading">Loading the latest fantasy stories…</div> : articles.length ? <div className="news-grid">{articles.map((article, index) => <a className={index === 0 ? 'news-card news-featured' : 'news-card'} href={article.article_url} target="_blank" rel="noreferrer" key={article.id}>{article.image_url && <img src={article.image_url} alt="" loading="lazy" />}<div><span>{article.source} · {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(article.published_at))}</span><h3>{article.headline}</h3>{index === 0 && article.description && <p>{article.description}</p>}<strong>Read fantasy story →</strong></div></a>)}</div> : <div className="news-loading">Fantasy news is being refreshed. Check back shortly.</div>}{newsError && <p className="news-error">Fantasy news could not refresh: {newsError}</p>}<p className="news-credit">Fantasy headlines and images provided by ESPN. Links open the original story.</p></section>
  </>
}
