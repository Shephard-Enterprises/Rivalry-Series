const eventIcons = {
  touchdown: '🏈',
  milestone: '🔥',
  captain: '★',
  lead_change: '↕',
  player_final: '✓',
  matchup_final: '🏆',
}

const eventTime = (value) => new Intl.DateTimeFormat('en-US', {
  weekday: 'short', hour: 'numeric', minute: '2-digit',
}).format(new Date(value))

export default function GameDayTimeline({ events }) {
  if (!events.length) return null
  return <section className="game-day-timeline">
    <div className="section-heading"><div><p className="eyebrow">Game day timeline</p><h2>The moments that moved the matchup</h2></div><p>Newest moment first.</p></div>
    <div className="game-event-feed">{events.map((event) => <article className={`game-event game-event-${event.type}`} key={event.id}>
      <div className="game-event-icon" aria-hidden="true">{eventIcons[event.type] ?? '•'}</div>
      <div className="game-event-copy"><header><strong>{event.title}</strong><time dateTime={event.occurred_at}>{eventTime(event.occurred_at)}</time></header><p>{event.body}</p></div>
    </article>)}</div>
  </section>
}
