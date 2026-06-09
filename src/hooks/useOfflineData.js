// hooks/useOfflineData.js
// Hook مشترك يجلب من السيرفر عند الاتصال ويحفظ محلياً
import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'
import { localDB } from '../lib/db'

export function useOfflineData(tableName, localTableName, selectQuery = '*', orderBy = null) {
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  async function load() {
    setLoading(true)
    try {
      if (navigator.onLine) {
        let q = supabase.from(tableName).select(selectQuery).eq('org_id', ORG_ID)
        if (orderBy) q = q.order(orderBy, { ascending: false })
        const { data: serverData, error: serverError } = await q
        if (serverError) {
          console.warn(`${tableName} server error:`, serverError.message)
        } else if (serverData) {
          try { await localDB[localTableName].bulkPut(serverData) } catch {}
          setData(serverData)
          setLoading(false)
          return
        }
      }
      // fallback: قراءة محلية
      const localData = await localDB[localTableName].toArray().catch(() => [])
      setData(localData.sort((a, b) => {
        if (orderBy && a[orderBy] && b[orderBy]) return new Date(b[orderBy]) - new Date(a[orderBy])
        return 0
      }))
    } catch (err) {
      setError(err)
      // محاولة أخيرة من المحلي
      const fallback = await localDB[localTableName].toArray().catch(() => [])
      setData(fallback)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tableName])
  return { data, loading, error, reload: load }
}
