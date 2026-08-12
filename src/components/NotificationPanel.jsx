import { useState } from 'react'

const preferenceOptions = [
  ['chat_messages', 'Chat messages'], ['gif_messages', 'GIF messages'], ['reactions', 'Reactions'],
  ['draft_alerts', 'Draft alerts'], ['scoring_alerts', 'Scoring & leads'], ['recap_alerts', 'Weekly recaps'],
]

export default function NotificationPanel({ social, push, onClose, onOpenChat, onOpenDraft }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const relative = (date) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
  }
  const open = async (notification) => {
    if (!notification.read_at) await social.markRead()
    if (['message', 'reaction'].includes(notification.type)) { onClose(); onOpenChat() }
    if (['draft_open', 'draft_turn', 'draft_auto_pick', 'draft_deadline', 'captain_selection', 'captain_reminder', 'queue_stolen'].includes(notification.type)) { onClose(); onOpenDraft() }
  }
  const pushCopy = push.status === 'enabled' ? 'Lock-screen notifications enabled' : push.status === 'install_required' ? 'On iPhone: Share → Add to Home Screen, then enable notifications from the installed app.' : push.status === 'denied' ? 'Notifications are blocked in device settings.' : 'Get draft turns, messages, and matchup alerts when the app is closed.'
  const preset = (name) => {
    if (name === 'everything') push.savePreferences(Object.fromEntries(preferenceOptions.map(([key]) => [key, true])))
    else push.savePreferences({ chat_messages: false, gif_messages: false, reactions: false, draft_alerts: true, scoring_alerts: true, recap_alerts: true })
  }
  return <><button className="notification-scrim" aria-label="Close notifications" onClick={onClose} /><aside className="notification-panel"><header><div><p className="eyebrow">Activity</p><h2>Notifications</h2></div><button onClick={onClose}>×</button></header><section className={`push-card push-${push.status}`}><div><strong>{push.status === 'enabled' ? 'Push is on' : 'Never miss your turn'}</strong><p>{push.status === 'enabled' && push.testStatus === 'queued' ? 'Test queued. Close the app now—it will arrive in about 5 seconds.' : pushCopy}</p>{push.error && <small>{push.error}</small>}</div>{!['enabled', 'unsupported', 'denied'].includes(push.status) && <button onClick={push.enable}>{push.status === 'install_required' ? 'Try again' : 'Enable'}</button>}</section>{push.status === 'enabled' && <><button className="notification-settings-toggle" onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? 'Hide preferences' : 'Notification preferences'}</button>{settingsOpen && <section className="notification-preferences"><header><div><strong>Lock-screen alerts</strong><p>Activity still stays in this panel.</p></div></header><div className="preference-presets"><button onClick={() => preset('everything')}>Everything</button><button onClick={() => preset('essentials')}>Game essentials</button></div><div className="preference-list">{preferenceOptions.map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={push.preferences?.[key] ?? true} onChange={(event) => push.savePreferences({ [key]: event.target.checked })} /></label>)}</div></section>}<button className="send-push-test" disabled={push.testStatus === 'sending'} onClick={push.sendTest}>{push.testStatus === 'sending' ? 'Starting 5-second timer…' : 'Send test in 5 seconds'}</button></>}{social.unreadCount > 0 && <button className="mark-read" onClick={social.markRead}>Mark all as read</button>}<div className="notification-list">{social.notifications.length === 0 ? <div className="notification-empty">Nothing new yet.</div> : social.notifications.map((item) => <button className={!item.read_at ? 'notification-item unread' : 'notification-item'} onClick={() => open(item)} key={item.id}><i /><span><strong>{item.title}</strong><p>{item.body}</p></span><time>{relative(item.created_at)}</time></button>)}</div></aside></>
}
