import { useCallback, useContext } from 'react'
import { getPowerSync } from './powersync'
import { ORG_ID } from './supabase'

export function useRxDB() {
  const query = useCallback(async (table, filters = {}) => {
    try {
      const db = getPowerSync()
      let sql = `SELECT * FROM ${table}`
      const params = []
      const keys = Object.keys(filters)
      if (keys.length) {
        sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
        keys.forEach(k => params.push(filters[k]))
      }
      const result = await db.getAll(sql, params)
      return result.map(row => ({
        ...row,
        category_tags: row.category_tags
          ? (() => { try { return JSON.parse(row.category_tags) } catch { return [] } })()
          : [],
      }))
    } catch(e) {
      console.warn('[useRxDB query]', table, e.message)
      return []
    }
  }, [])

  const upsert = useCallback(async (table, data) => {
    try {
      const db = getPowerSync()
      const doc = {
        ...data,
        org_id: data.org_id || ORG_ID,
        updated_at: new Date().toISOString(),
        ...(data.category_tags !== undefined && {
          category_tags: Array.isArray(data.category_tags)
            ? JSON.stringify(data.category_tags) : data.category_tags
        }),
      }
      await db.execute(
        `INSERT OR REPLACE INTO ${table} (${Object.keys(doc).join(',')}) VALUES (${Object.keys(doc).map(()=>'?').join(',')})`,
        Object.values(doc)
      )
      return doc
    } catch(e) {
      console.warn('[useRxDB upsert]', table, e.message)
      return data
    }
  }, [])

  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    const db = getPowerSync()
    const now = new Date().toISOString()
    try {
      await db.writeTransaction(async tx => {
        for (const data of docs) {
          const doc = {
            ...data,
            org_id: data.org_id || ORG_ID,
            updated_at: data.updated_at || now,
            ...(data.category_tags !== undefined && {
              category_tags: Array.isArray(data.category_tags)
                ? JSON.stringify(data.category_tags) : data.category_tags
            }),
          }
          await tx.execute(
            `INSERT OR REPLACE INTO ${table} (${Object.keys(doc).join(',')}) VALUES (${Object.keys(doc).map(()=>'?').join(',')})`,
            Object.values(doc)
          )
        }
      })
    } catch(e) {
      console.warn('[useRxDB bulkUpsert]', table, e.message)
    }
  }, [])

  const remove = useCallback(async (table, id) => {
    try {
      await getPowerSync().execute(`DELETE FROM ${table} WHERE id = ?`, [id])
    } catch(e) {
      console.warn('[useRxDB remove]', table, e.message)
    }
  }, [])

  return { ready: true, query, upsert, bulkUpsert, remove }
}
