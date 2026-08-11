import { useState } from 'react'
import { managers, players, positions, rosterLimits } from '../data/mockPlayers'
import { useDraft } from '../hooks/useDraft'
import { nextDraftDeadline } from '../lib/deadlines'
import Countdown from './Countdown'

export default function DraftRoom({ onBack }) {
  const [tab, setTab] = useState('ALL')
  const [fallbackDeadline] = useState(() => nextDraftDeadline())
  const { week, picks, captains, profile, syncStatus, error, currentManager, complete, draftOpen, roster, canDraft, draft, chooseCaptain } = useDraft()
  const deadline = week ? new Date(week.draft_closes_at) : fallbackDeadline
  const available = players.filter((player) => (tab === 'ALL' || player.position === tab) && !picks.some((pick) => pick.playerId === player.id))
  const slotLabel = (player, team) => team.filter((item) => item.position === player.position).indexOf(player) < rosterLimits[player.position] ? player.position : 'FLEX'

  return <div className="draft-room">
    <header className="draft-nav"><button onClick={onBack} className="back-button">←</button><div><p className="company">Rivalry Series</p><h1>Week {week?.nfl_week ?? 1} Draft</h1></div><span className="mock-badge">{syncStatus === 'demo' ? 'Prototype · Mock data' : `Supabase · ${syncStatus}`}</span></header>
    <section className="turn-banner"><div><span className="live-pill"><i /> {complete ? 'Draft complete' : draftOpen ? 'On the clock' : 'Draft scheduled'}</span><h2>{complete ? 'Choose your captains' : draftOpen ? `${currentManager}, you’re up.` : 'Week 1 opens September 7.'}</h2><p>{complete ? 'Captains lock at kickoff of the first game.' : draftOpen ? `Pick ${picks.length + 1} of 14 · All selections are final` : `${profile?.display_name ?? 'Manager'}, your live roster is connected and ready.`}</p></div><div><p className="timer-label">{draftOpen ? 'Draft closes' : 'Draft opens Monday · 12:00 AM PT'}</p><Countdown deadline={draftOpen ? deadline : week ? new Date(week.draft_opens_at) : deadline} /></div></section>
    {error && <p className="draft-error" role="alert">{error}</p>}
    <div className="draft-layout">
      <section className="player-board"><div className="board-heading"><div><p className="eyebrow">Player pool</p><h2>Available players</h2></div><span>{available.length} available</span></div><div className="position-tabs">{positions.map((position) => <button className={tab === position ? 'active' : ''} onClick={() => setTab(position)} key={position}>{position}</button>)}</div>
        <div className="player-list">{available.map((player, rank) => <article className={`player-card ${!canDraft(player) ? 'disabled' : ''}`} key={player.id}><span className="rank">{rank + 1}</span><div className={`position-chip pos-${player.position.toLowerCase()}`}>{player.position}</div><div className="player-info"><h3>{player.name} {player.status !== 'Healthy' && <span className="injury" title={player.status}>!</span>}</h3><p>{player.team} · {player.opponent} {player.status !== 'Healthy' && <em>{player.status}</em>}</p></div><div className="projection"><span>Projected</span><strong>{player.projection}</strong></div><button onClick={() => draft(player)} disabled={!canDraft(player)}>Draft</button></article>)}</div>
      </section>
      <aside className="draft-sidebar">
        {managers.map((manager) => { const team = roster(manager); return <section className="roster-card" key={manager}><div className="roster-head"><div className={`mini-avatar avatar-${manager.toLowerCase()}`}>{manager[0]}</div><div><span>{manager}’s roster</span><strong>{team.length}/7 players</strong></div></div><div className="roster-slots">{team.map((player) => <div className="roster-player" key={player.id}><span>{slotLabel(player, team)}</span><strong>{player.name}</strong>{complete && <button className={captains[manager] === player.id ? 'captain active' : 'captain'} onClick={() => chooseCaptain(manager, player.id)}>★</button>}</div>)}{Array.from({ length: 7 - team.length }).map((_, index) => <div className="empty-slot" key={index}>Open roster spot</div>)}</div></section> })}
        <section className="history-card"><p className="eyebrow">Draft history</p>{picks.length === 0 ? <span className="empty-history">The first pick is waiting.</span> : [...picks].reverse().slice(0, 5).map((pick, index) => { const player = players.find((item) => item.id === pick.playerId); return <div className="history-pick" key={player.id}><b>{picks.length - index}</b><span><strong>{player.name}</strong>{pick.manager} · {player.position}</span></div> })}</section>
      </aside>
    </div>
  </div>
}
