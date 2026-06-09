import { useState, useEffect } from 'react'
import { localDB } from '../lib/db'

export function useLocalDB(table, filterFn) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const all = await localDB[table].toArray()
      if (mounted) {
        setData(filterFn ? all.filter(filterFn) : all)
        setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [table])

  return { data, loading, reload: () => {} }
}
