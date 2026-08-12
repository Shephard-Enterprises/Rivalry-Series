export default function NotificationPanel({ social, push, onClose, onOpenChat }) {
  const relative = (date) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
  }
  const open = async (notification) => {
    if (!notification.read_at) await social.markRead()
    if (notification.type === 'message') { onClose(); onOpenChat() }
  }
  const pushCopy = push.status === 'enabled' ? 'Lock-screen notifications enabled' : push.status === 'install_required' ? 'On iPhone: Share → Add to Home Screen, then enable notifications from the installed app.' : push.status === 'denied' ? 'Notifications are blocked in device settings.' : 'Get draft turns, messages, and matchup alerts when the app is closed.'
  return <><button className="notification-scrim" aria-label="Close notifications" onClick={onClose} /><aside className="notification-panel"><header><div><p className="eyebrow">Activity</p><h2>Notifications</h2></div><button onClick={onClose}>×</button></header><section className={`push-card push-${push.status}`}><div><strong>{push.status === 'enabled' ? 'Push is on' : 'Never miss your turn'}</strong><p>{pushCopy}</p>{push.error && <small>{push.error}</small>}</div>{!['enabled', 'unsupported', 'denied'].includes(push.status) && <button onClick={push.enable}>{push.status === 'install_required' ? 'Try again' : 'Enable'}</button>}</section>{social.unreadCount > 0 && <button className="mark-read" onClick={social.markRead}>Mark all as read</button>}<div className="notification-list">{social.notifications.length === 0 ? <div className="notification-empty">Nothing new yet.</div> : social.notifications.map((item) => <button className={!item.read_at ? 'notification-item unread' : 'notification-item'} onClick={() => open(item)} key={item.id}><i /><span><strong>{item.title}</strong><p>{item.body}</p></span><time>{relative(item.created_at)}</time></button>)}</div></aside></>
}
