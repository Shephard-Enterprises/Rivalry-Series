const projected = (player) => Number(player.projection ?? 0) * (player.is_captain ? 1.25 : 1)
const slotGroup = (slot) => slot?.replace(/[12]/g, '') ?? 'FLEX'

export default function PregameReport({ week, matchup, captainCount }) {
  if (week?.status !== 'captain_selection' || captainCount < 2 || matchup.some((manager) => manager.players.length !== 7)) return null
  const totals = matchup.map((manager) => ({ ...manager, projected: manager.players.reduce((sum, player) => sum + projected(player), 0) }))
  const [favorite, underdog] = [...totals].sort((a, b) => b.projected - a.projected)
  const margin = Math.abs(favorite.projected - underdog.projected)
  const positionEdges = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot) => {
    const scores = totals.map((manager) => manager.players.filter((player) => slotGroup(player.roster_slot) === slot).reduce((sum, player) => sum + projected(player), 0))
    const index = scores[0] >= scores[1] ? 0 : 1
    return { slot, manager: totals[index].name, edge: Math.abs(scores[0] - scores[1]) }
  }).sort((a, b) => b.edge - a.edge)[0]
  const star = totals.flatMap((manager) => manager.players.map((player) => ({ ...player, manager: manager.name }))).sort((a, b) => projected(b) - projected(a))[0]
  const captains = totals.flatMap((manager) => manager.players.filter((player) => player.is_captain).map((player) => ({ ...player, manager: manager.name })))
  const bestCaptain = [...captains].sort((a, b) => projected(b) - projected(a))[0]
  const injuries = totals.flatMap((manager) => manager.players.map((player) => ({ ...player, manager: manager.name }))).filter((player) => ['questionable', 'doubtful', 'out', 'inactive'].includes(player.player_status?.toLowerCase()))
  const prediction = margin < 3 ? 'The projections call this a coin flip. One captain spike could decide everything.' : `${favorite.name} enters as the ${margin.toFixed(1)}-point favorite, but the captain multiplier keeps the door open.`
  return <section className="pregame-report">
    <header><div><p className="eyebrow">Week {week.nfl_week} · Before kickoff</p><h2>The Scroober Pregame Report</h2></div><span>Preview</span></header>
    <div className="pregame-hero"><p className="eyebrow">The early line</p><h3>{margin < 3 ? 'Too close to call.' : `${favorite.name} has the early edge.`}</h3><p>{prediction}</p><div className="pregame-score">{totals.map((manager) => <strong key={manager.name}>{manager.name}<b>{manager.projected.toFixed(2)}</b><small>Projected</small></strong>)}</div></div>
    <div className="pregame-insights"><article><span>↗</span><div><small>Biggest position edge</small><strong>{positionEdges.manager} · {positionEdges.slot}</strong><p>+{positionEdges.edge.toFixed(1)} projected points</p></div></article><article><span>★</span><div><small>Projected headliner</small><strong>{star.full_name}</strong><p>{star.manager} · {projected(star).toFixed(1)} projected</p></div></article><article><span>C</span><div><small>Captain watch</small><strong>{bestCaptain.full_name}</strong><p>{bestCaptain.manager} · +{(Number(bestCaptain.projection ?? 0) * .25).toFixed(1)} bonus upside</p></div></article><article className={injuries.length ? 'pregame-warning' : ''}><span>{injuries.length ? '!' : '✓'}</span><div><small>Injury watch</small><strong>{injuries.length ? `${injuries.length} roster flag${injuries.length === 1 ? '' : 's'}` : 'Both rosters clear'}</strong><p>{injuries.length ? injuries.slice(0, 2).map((player) => `${player.full_name} (${player.player_status})`).join(' · ') : 'No questionable, doubtful, or out players'}</p></div></article></div>
  </section>
}
