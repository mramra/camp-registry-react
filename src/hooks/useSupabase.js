import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useSupabase(table, query = {}) {
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    let sub = null

    async function fetch() {
      setLoading(true)
      try {
        let q = supabase.from(table).select(query.select || '*')
        if (query.eq) Object.entries(query.eq).forEach(([k, v]) => { q = q.eq(k, v) })
        if (query.order) q = q.order(query.order, { ascending: query.asc ?? false })
        if (query.limit) q = q.limit(query.limit)
        const { data: d, error: e } = await q
        if (e) throw e
        setData(d)
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
      }
    }

    fetch()

    // Real-time subscription
    if (query.realtime) {
      sub = supabase.channel(`${table}_changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, fetch)
        .subscribe()
    }

    return () => { if (sub) sub.unsubscribe() }
  }, [table, JSON.stringify(query)])

  return { data, loading, error, refetch: () => {} }
}
