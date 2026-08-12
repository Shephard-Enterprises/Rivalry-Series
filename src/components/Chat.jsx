import { useEffect, useRef, useState } from 'react'
import GifPicker from './GifPicker'

const reactionChoices = ['😂', '🔥', '😤', '👏', '💀', '🏆']

export default function Chat({ social, onBack }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [social.messages.length])
  const submit = async (event) => {
    event.preventDefault(); setSending(true)
    const sent = editing ? await social.editMessage(editing.id, message) : await social.sendMessage(message, { replyToId: replyTo?.id })
    if (sent) { setMessage(''); setReplyTo(null); setEditing(null) }
    setSending(false)
  }
  const sendGif = async (gif) => {
    setSending(true)
    if (await social.sendMessage('', { gif, replyToId: replyTo?.id })) { setGifOpen(false); setReplyTo(null) }
    setSending(false)
  }
  const startEdit = (item) => { setEditing(item); setMessage(item.body); setReplyTo(null) }
  const cancelComposerMode = () => { setEditing(null); setReplyTo(null); setMessage('') }
  const time = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
  return <div className="chat-page"><header className="draft-nav"><button onClick={onBack} className="back-button">←</button><div><p className="company">Rivalry chat</p><h1>{social.week?.season ?? new Date().getFullYear()} Season Thread</h1></div><span className="mock-badge">Private · Justin & Luke</span></header>
    <section className="chat-shell"><div className="chat-heading"><div><span className="live-pill"><i /> Realtime</span><h2>Talk your talk.</h2><p>One continuous thread for the entire season.</p></div></div>
      <div className="message-list">{social.messages.length === 0 && <div className="chat-empty"><strong>No messages yet.</strong><span>Someone has to start it.</span></div>}{social.messages.map((item) => { const mine = item.sender_id === social.profile?.id; const reply = social.messages.find((messageItem) => messageItem.id === item.reply_to_id); const grouped = reactionChoices.map((emoji) => ({ emoji, items: social.reactions.filter((reaction) => reaction.message_id === item.id && reaction.emoji === emoji) })).filter((group) => group.items.length); return <article className={mine ? 'message mine' : 'message'} key={item.id}><div><strong>{mine ? 'You' : item.profiles.display_name}{item.edited_at && <i> · edited</i>}</strong><time>{time(item.created_at)}</time></div>{reply && <button className="reply-preview" onClick={() => document.getElementById(`message-${reply.id}`)?.scrollIntoView({ behavior: 'smooth' })}><strong>{reply.sender_id === social.profile?.id ? 'You' : reply.profiles.display_name}</strong><span>{reply.message_type === 'gif' ? 'GIF' : reply.body}</span></button>}<div id={`message-${item.id}`} className="message-content">{item.message_type === 'gif' ? <figure><img src={item.gif_url} alt={item.gif_title || 'Shared GIF'} loading="lazy" /><figcaption>via GIPHY</figcaption></figure> : <p>{item.body}</p>}</div><div className="message-tools"><button onClick={() => setReplyTo(item)}>Reply</button>{reactionChoices.map((emoji) => <button className={social.reactions.some((reaction) => reaction.message_id === item.id && reaction.user_id === social.profile?.id && reaction.emoji === emoji) ? 'reacted' : ''} onClick={() => social.toggleReaction(item.id, emoji)} key={emoji}>{emoji}</button>)}{mine && item.message_type === 'text' && <button onClick={() => startEdit(item)}>Edit</button>}{mine && <button onClick={() => social.deleteMessage(item.id)}>Delete</button>}</div>{grouped.length > 0 && <div className="reaction-summary">{grouped.map((group) => <button onClick={() => social.toggleReaction(item.id, group.emoji)} title={group.items.map((reaction) => reaction.profiles.display_name).join(', ')} key={group.emoji}>{group.emoji} {group.items.length}</button>)}</div>}</article> })}<div ref={endRef} /></div>
      <form className="message-form" onSubmit={submit}>{(replyTo || editing) && <div className="composer-context"><span>{editing ? 'Editing your message' : `Replying to ${replyTo.sender_id === social.profile?.id ? 'yourself' : replyTo.profiles.display_name}`}</span><button type="button" onClick={cancelComposerMode}>×</button></div>}<label htmlFor="rivalry-message">Message Luke</label><div><button className="gif-button" type="button" onClick={() => setGifOpen(true)}>GIF</button><textarea id="rivalry-message" value={message} maxLength={1000} rows="2" placeholder="Insert Trash Talk Here…" onChange={(event) => setMessage(event.target.value)} /><button disabled={sending || !message.trim()}>{sending ? 'Sending…' : editing ? 'Save' : 'Send'}</button></div><span>{message.length}/1000</span></form>
      {gifOpen && <GifPicker onSelect={sendGif} onClose={() => setGifOpen(false)} />}
      {social.error && <p className="draft-error">{social.error}</p>}
    </section>
  </div>
}
