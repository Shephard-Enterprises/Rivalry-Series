import Countdown from './Countdown'

const formatMoment = (value) => value ? new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value)) : 'Schedule pending'

export default function WeekHubPanel({ week, progress, connected, onEnter, onHistory, onTest, onAdmin }) {
  const status = week?.status ?? 'scheduled'
  const phases = {
    scheduled: {
      eyebrow: `Draft opens · ${formatMoment(week?.draft_opens_at)}`,
      title: 'Your next rivalry week is waiting.',
      copy: 'Scout the player pool, follow fantasy news, and build your private queue before the clock starts.',
      timer: 'Draft opens in', deadline: week?.draft_opens_at, action: 'Preview draft',
    },
    drafting: {
      eyebrow: `Pick ${Math.min(progress.pickCount + 1, 14)} of 14`,
      title: `${progress.currentManager ?? 'A manager'} is on the clock.`,
      copy: `${14 - progress.pickCount} selections remain. Every pick is final and the private queue protects a missed turn.`,
      timer: 'Draft closes in', deadline: week?.draft_closes_at, action: 'Enter draft',
    },
    captain_selection: {
      eyebrow: `${progress.captainCount} of 2 captains locked`,
      title: 'Choose the player who can swing the week.',
      copy: 'Your captain scores 1.25× and becomes final when the first NFL game begins.',
      timer: 'Captains lock in', deadline: week?.captain_locks_at, action: 'Choose captain',
    },
    live: {
      eyebrow: 'Game day · Automatic scoring active',
      title: 'The rivalry is live.',
      copy: connected ? 'Scores, win probability, and the Game Day Timeline refresh throughout every NFL game.' : 'Connect Supabase to enable live scoring.',
      action: 'View rosters',
    },
    final: {
      eyebrow: 'Final score', title: 'Another rivalry week is in the books.',
      copy: 'See the final result and read The Scroober Scrimage Report.', action: 'View history',
    },
  }
  const phase = phases[status] ?? phases.scheduled
  return <div className={`draft-panel weekly-hub phase-${status}`}>
    <div className="weekly-hub-copy"><span className="eyebrow">{phase.eyebrow}</span><h3>{phase.title}</h3><p>{phase.copy}</p></div>
    {phase.deadline && <div className="weekly-hub-timer"><span>{phase.timer}</span><Countdown deadline={new Date(phase.deadline)} /></div>}
    <div className="home-actions">{onAdmin && <button className="test-button" onClick={onAdmin}>Control center</button>}{onTest && <button className="test-button" onClick={onTest}>Practice lab</button>}<button className="history-button" onClick={onHistory}>History</button><button onClick={status === 'final' ? onHistory : onEnter}>{phase.action} <span>→</span></button></div>
  </div>
}
