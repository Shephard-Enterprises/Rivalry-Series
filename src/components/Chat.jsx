import { useEffect, useRef, useState } from 'react'

export default function Chat({ social, onBack }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [social.messages.length])
  const submit = async (event) => {
    event.preventDefault(); setSending(true)
    if (await social.sendMessage(message)) setMessage('')
    setSending(false)
  }
  const time = (date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(date))
  return <div className="chat-page"><header className="draft-nav"><button onClick={onBack} className="back-button">←</button><div><p className="company">Rivalry chat</p><h1>Week {social.week?.nfl_week ?? 1} Thread</h1></div><span className="mock-badge">Private · Justin & Luke</span></header>
    <section className="chat-shell"><div className="chat-heading"><div><span className="live-pill"><i /> Realtime</span><h2>Talk your talk.</h2><p>Messages stay with this week’s matchup.</p></div></div>
      <div className="message-list">{social.messages.length === 0 && <div className="chat-empty"><strong>No messages yet.</strong><span>Someone has to start it.</span></div>}{social.messages.map((item) => { const mine = item.sender_id === social.profile?.id; return <article className={mine ? 'message mine' : 'message'} key={item.id}><div><strong>{mine ? 'You' : item.profiles.display_name}</strong><time>{time(item.created_at)}</time></div><p>{item.body}</p></article> })}<div ref={endRef} /></div>
      <form className="message-form" onSubmit={submit}><label htmlFor="rivalry-message">Message Luke</label><div><textarea id="rivalry-message" value={message} maxLength={1000} rows="2" placeholder="Say something memorable…" onChange={(event) => setMessage(event.target.value)} /><button disabled={sending || !message.trim()}>{sending ? 'Sending…' : 'Send'}</button></div><span>{message.length}/1000</span></form>
      {social.error && <p className="draft-error">{social.error}</p>}
    </section>
  </div>
}
