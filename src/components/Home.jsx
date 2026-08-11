import { managers } from '../data/mockPlayers'

const weeklyDetails = [['Draft', 'Tuesday – Wednesday'], ['Matchup', 'Thursday – Monday'], ['Roster', '7 Players'], ['Scoring', 'Half PPR']]

export default function Home({ onEnter }) {
  return <>
    <header className="brand-header"><div className="brand-mark"><span>RS</span></div><div><p className="company">Shephard Enterprises</p><h1>Rivalry <span>Series</span></h1></div><p className="tagline">One week. One roster. One winner.</p></header>
    <section className="matchup-card">
      <div className="card-topline"><p>NFL Week 1</p><span className="live-pill"><i /> Draft scheduled</span></div>
      <div className="matchup">{managers.map((name, index) => <div className="manager-wrap" key={name}><article className="manager"><div className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</div><p className="manager-label">Manager</p><h2>{name}</h2><p className="record"><strong>0</strong> W&nbsp;&nbsp; <strong>0</strong> L&nbsp;&nbsp; <strong>0</strong> T</p></article>{index === 0 && <div className="versus"><span /><strong>VS</strong><span /></div>}</div>)}</div>
      <div className="draft-panel"><div><span className="eyebrow">Week 1 draft · September 7</span><h3>The season starts here.</h3><p>Your live draft room is connected and ready for opening day.</p></div><button onClick={onEnter}>View draft <span>→</span></button></div>
    </section>
    <section className="week-section"><div className="section-heading"><div><p className="eyebrow">The format</p><h2>This week</h2></div><p>A new head-to-head battle every week.</p></div><div className="detail-grid">{weeklyDetails.map(([label, value]) => <article className="detail-card" key={label}><div className="detail-icon">{label[0]}</div><div><span>{label}</span><strong>{value}</strong></div></article>)}</div></section>
  </>
}
