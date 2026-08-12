export default function NotificationPanel({ social, onClose, onOpenChat }) {
  const relative = (date) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
  }
  const open = async (notification) => {
    if (!notification.read_at) await social.markRead()
    if (notification.type === 'message') { onClose(); onOpenChat() }
  }
  return <><button className="notification-scrim" aria-label="Close notifications" onClick={onClose} /><aside className="notification-panel"><header><div><p className="eyebrow">Activity</p><h2>Notifications</h2></div><button onClick={onClose}>×</button></header>{social.unreadCount > 0 && <button className="mark-read" onClick={social.markRead}>Mark all as read</button>}<div className="notification-list">{social.notifications.length === 0 ? <div className="notification-empty">Nothing new yet.</div> : social.notifications.map((item) => <button className={!item.read_at ? 'notification-item unread' : 'notification-item'} onClick={() => open(item)} key={item.id}><i /><span><strong>{item.title}</strong><p>{item.body}</p></span><time>{relative(item.created_at)}</time></button>)}</div></aside></>
}
