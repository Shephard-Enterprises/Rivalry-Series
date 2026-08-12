import { useEffect } from 'react'

const initials = (name) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')
const line = (label, stat, points) => ({ label, stat, points })

export default function ScoringBreakdownSheet({ player, onClose }) {
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', close); document.body.classList.add('sheet-open')
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('sheet-open') }
  }, [onClose])
  const rows = [
    line('Passing yards', `${player.passing_yards} yards`, player.passing_yards / 25),
    line('Passing touchdowns', `${player.passing_touchdowns} TD`, player.passing_touchdowns * 4),
    line('Interceptions', `${player.interceptions} INT`, player.interceptions * -2),
    line('Rushing yards', `${player.rushing_yards} yards`, player.rushing_yards / 10),
    line('Rushing touchdowns', `${player.rushing_touchdowns} TD`, player.rushing_touchdowns * 6),
    line('Receptions', `${player.receptions} catches`, player.receptions * .5),
    line('Receiving yards', `${player.receiving_yards} yards`, player.receiving_yards / 10),
    line('Receiving touchdowns', `${player.receiving_touchdowns} TD`, player.receiving_touchdowns * 6),
    line('Fumbles lost', `${player.fumbles_lost} lost`, player.fumbles_lost * -2),
    line('Two-point conversions', `${player.two_point_conversions} made`, player.two_point_conversions * 2),
  ].filter((item) => item.points !== 0)
  const captainBonus = player.is_captain ? player.raw_points * .25 : 0
  return <div className="player-sheet-layer"><button className="player-sheet-scrim" onClick={onClose} aria-label="Close scoring breakdown" /><section className="player-sheet scoring-sheet" role="dialog" aria-modal="true" aria-labelledby="scoring-sheet-name"><header><span>Fantasy scoring breakdown</span><button onClick={onClose} aria-label="Close">×</button></header><div className="scoring-player"><div className={`scoring-photo pos-${player.position.toLowerCase()}`}><span>{initials(player.full_name)}</span>{player.headshot_url && <img src={player.headshot_url} alt={`${player.full_name} headshot`} onError={(event) => { event.currentTarget.hidden = true }} />}</div><div><p>{player.manager_name} · {player.roster_slot}</p><h2 id="scoring-sheet-name">{player.full_name}</h2><span className={`scoring-status ${player.game_status}`}>{player.game_status === 'in_progress' ? 'Live' : player.game_status === 'final' ? player.is_official ? 'Final · official' : 'Final' : 'Upcoming'}</span></div><strong>{player.counted_points.toFixed(2)}</strong></div><section className="scoring-lines"><header><span>Statistic</span><span>Result</span><span>Points</span></header>{rows.length ? rows.map((item) => <article key={item.label}><strong>{item.label}</strong><span>{item.stat}</span><b className={item.points < 0 ? 'negative' : ''}>{item.points > 0 ? '+' : ''}{item.points.toFixed(2)}</b></article>) : <p>No scoring statistics recorded yet.</p>}</section><div className="scoring-total"><span><small>Raw fantasy score</small><strong>{player.raw_points.toFixed(2)}</strong></span>{player.is_captain && <span className="captain-bonus"><small>Captain bonus · 25%</small><strong>+{captainBonus.toFixed(2)}</strong></span>}<span><small>Counted matchup score</small><strong>{player.counted_points.toFixed(2)}</strong></span></div><p className="scoring-note">Statistics are synchronized from ESPN approximately every five minutes. Final totals can change if the NFL issues a stat correction.</p></section></div>
}
