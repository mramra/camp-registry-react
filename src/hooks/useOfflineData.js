import { useState, useEffect, useCallback } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'
import { localDB } from '../lib/db'

export function useOfflineData({ localTable, remoteTable, select = '*', orderBy = 'created_at', filterFn, enabled = true }) {
  const [data,      setData]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [syncing,   setSyncing]   = useState(false)
  const [fromCache, setFromCache] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 1. محلي فوراً
      const local = await localDB[localTable].toArray().catch(() => [])
      const sorted = (filterFn ? local.filter(filterFn) : local)
        .sort((a, b) => new Date(b[orderBy]||0) - new Date(a[orderBy]||0))
      setData(sorted)
      setFromCache(true)
      setLoading(false)

      // 2. سيرفر في الخلفية
      if (navigator.onLine) {
        setSyncing(true)
        try {
          const { data: remote, error } = await supabase
            .from(remoteTable).select(select).eq('org_id', ORG_ID)
            .order(orderBy, { ascending: false })
          if (!error && remote) {
            try { await localDB[localTable].bulkPut(remote) } catch {}
            setData(filterFn ? remote.filter(filterFn) : remote)
            setFromCache(false)
          }
        } catch (e) { console.warn('[offline]', remoteTable, e.message) }
        finally { setSyncing(false) }
      }
    } catch (e) { setLoading(false) }
  }, [localTable, remoteTable, select, orderBy])

  useEffect(() => { if (enabled) load() }, [enabled])
  return { data, loading, syncing, fromCache, reload: load, setData }
}
