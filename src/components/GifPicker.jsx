import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('')
      const { data, error: searchError } = await supabase.functions.invoke('search-giphy', { body: { query } })
      if (!active) return
      if (searchError) setError(searchError.message)
      else setGifs(data?.gifs ?? [])
      setLoading(false)
    }, query ? 350 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])
  return <section className="gif-picker"><header><div><strong>Choose a GIF</strong><span>Powered by GIPHY</span></div><button onClick={onClose}>×</button></header><input type="search" value={query} maxLength="50" placeholder="Search reactions…" autoFocus onChange={(event) => setQuery(event.target.value)} />{loading ? <div className="gif-state">Finding the perfect GIF…</div> : error ? <div className="gif-state error">{error}</div> : <div className="gif-grid">{gifs.map((gif) => <button onClick={() => onSelect(gif)} key={gif.id}><img src={gif.preview_url} alt={gif.title} loading="lazy" /></button>)}</div>}<footer><span>GIPHY</span><p>GIFs open in chat.</p></footer></section>
}
