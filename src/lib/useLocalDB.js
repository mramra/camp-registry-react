/**
 * useLocalDB.js — Unified Data Hook (Supabase مباشر، بدون تخزين محلي)
 * ════════════════════════════════════════════════════════
 * كل قراءة وكتابة تذهب مباشرة لـ Supabase. لا SQLite، لا PowerSync،
 * لا تخزين محلي من أي نوع. التطبيق يحتاج اتصالاً بالإنترنت ليعمل.
 *
 * الاسم "useLocalDB" بقي كما هو فقط لأن 19+ صفحة تستورده بهذا الاسم —
 * تغييره يتطلب تعديل كل تلك الصفحات بلا أي فائدة عملية.
 * ════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { supabase, ORG_ID } from './supabase'
import { TABLES, cleanForTable } from './schema'

// الجداول المُقيَّدة بـ org_id (الباقي بلا قيد أو بقيد مختلف يُمرَّر عبر filters)
const ORG_SCOPED = new Set([
  'families', 'camps', 'org_members', 'family_movements',
  'dist_rounds', 'camp_distributions', 'page_permissions',
])

/** يحوّل أعمدة array/json-text المخزّنة كنص في PowerSync القديم —
 *  مع Supabase المباشر تُرسل وتُستقبل كقيم JS عادية، فلا حاجة لتحويل عند القراءة هنا. */
function parseRow(row) {
  return row
}

export function useLocalDB() {
  // ── قراءة ──────────────────────────────────────────────
  const query = useCallback(async (table, filters = {}, options = {}) => {
    if (!navigator.onLine) {
      console.warn(`[useLocalDB] لا يوجد اتصال — تعذرت قراءة ${table}`)
      return []
    }
    const { limit, offset, orderBy } = options
    try {
      let q = supabase.from(table).select('*')
      if (ORG_SCOPED.has(table) && !('org_id' in filters)) q = q.eq('org_id', ORG_ID)
      Object.keys(filters).forEach(k => { q = q.eq(k, filters[k]) })
      if (orderBy) {
        const desc = orderBy.startsWith('-')
        q = q.order(desc ? orderBy.slice(1) : orderBy, { ascending: !desc })
      }
      if (limit)  q = q.limit(Number(limit))
      if (offset) q = q.range(Number(offset), Number(offset) + Number(limit || 50) - 1)

      const { data, error } = await q
      if (error) { console.warn(`[useLocalDB] ${table}:`, error.message); return [] }
      return (data || []).map(parseRow)
    } catch (e) {
      console.warn(`[useLocalDB] ${table}:`, e.message)
      return []
    }
  }, [])

  // ── عدد السجلات المطابقة للفلتر ──────────────────────────
  const count = useCallback(async (table, filters = {}) => {
    if (!navigator.onLine) return 0
    try {
      let q = supabase.from(table).select('id', { count: 'exact', head: true })
      if (ORG_SCOPED.has(table) && !('org_id' in filters)) q = q.eq('org_id', ORG_ID)
      Object.keys(filters).forEach(k => { q = q.eq(k, filters[k]) })
      const { count: c, error } = await q
      if (error) return 0
      return c || 0
    } catch { return 0 }
  }, [])

  // ── كتابة (دفعة) ──────────────────────────────────────────
  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    if (!navigator.onLine) {
      console.warn(`[useLocalDB] لا يوجد اتصال — تعذر حفظ ${table}`)
      throw new Error('لا يوجد اتصال بالإنترنت — لا يمكن الحفظ الآن')
    }
    const now = new Date().toISOString()
    const prepared = docs.map(d => cleanForTable(table, {
      ...d,
      org_id: d.org_id || (ORG_SCOPED.has(table) ? ORG_ID : d.org_id),
      updated_at: d.updated_at || now,
    }))
    const { error } = await supabase.from(table).upsert(prepared)
    if (error) {
      console.warn(`[useLocalDB] bulkUpsert ${table}:`, error.message)
      throw error
    }
  }, [])

  const upsert = useCallback(async (table, data) => {
    await bulkUpsert(table, [data])
    return data
  }, [bulkUpsert])

  const remove = useCallback(async (table, id) => {
    if (!navigator.onLine) {
      throw new Error('لا يوجد اتصال بالإنترنت — لا يمكن الحذف الآن')
    }
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      console.warn(`[useLocalDB] remove ${table}:`, error.message)
      throw error
    }
  }, [])

  return { ready: navigator.onLine, query, count, upsert, bulkUpsert, remove }
}
