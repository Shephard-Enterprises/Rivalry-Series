import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useNews(limit = 6) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const load = async () => {
      const { data, error: newsError } = await supabase.from('news_articles')
        .select('id, source, headline, description, article_url, image_url, published_at, categories')
        .order('published_at', { ascending: false }).limit(limit)
      if (!active) return
      if (newsError) setError(newsError.message)
      else setArticles(data ?? [])
      setLoading(false)
    }
    load()
    const timer = window.setInterval(load, 30 * 60 * 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [limit])

  return { articles, loading, error }
}
