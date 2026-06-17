/**
 * SupabaseConnector.js — الجسر بين PowerSync و Supabase
 *
 * مسؤول عن:
 *   1. fetchCredentials() — يعطي PowerSync توكن Supabase للاتصال بـ stream
 *   2. uploadData()       — يرفع التعديلات المحلية إلى Supabase
 *
 * هذا هو الجزء الذي كان مفقوداً ويمنع PowerSync الكامل من العمل
 */
import { supabase } from './supabase'

const POWERSYNC_URL = 'https://6a2d74dd0ef84ed671a15a84.powersync.journeyapps.com'

export class SupabaseConnector {
  /**
   * يُستدعى من PowerSync للحصول على توكن المصادقة
   * PowerSync يستخدم Supabase JWT (مُعدّ في لوحة PowerSync)
   */
  async fetchCredentials() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!session?.access_token) {
      // لا توجد جلسة — لا يمكن الاتصال
      return null
    }
    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    }
  }

  /**
   * يُستدعى من PowerSync لرفع التغييرات المحلية إلى Supabase
   * يقرأ من جدول transactions الداخلي ويطبّقها على Supabase
   */
  async uploadData(database) {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    try {
      for (const op of transaction.crud) {
        const table = supabase.from(op.table)

        if (op.op === 'PUT') {
          // إدراج أو تحديث
          const record = { ...op.opData, id: op.id }
          const { error } = await table.upsert(record)
          if (error) throw error
        }
        else if (op.op === 'PATCH') {
          // تحديث جزئي
          const { error } = await table.update(op.opData).eq('id', op.id)
          if (error) throw error
        }
        else if (op.op === 'DELETE') {
          const { error } = await table.delete().eq('id', op.id)
          if (error) throw error
        }
      }

      // أكّد نجاح المعاملة — يحذفها من قائمة الانتظار المحلية
      await transaction.complete()
      console.log(`[connector] ✅ رُفعت ${transaction.crud.length} عملية`)

    } catch (error) {
      console.error('[connector] فشل الرفع:', error.message)

      // أخطاء البيانات (مثل قيود فريدة) — تجاهل المعاملة لمنع التعليق
      const fatal = error?.code?.startsWith?.('23') // PostgreSQL integrity violations
      if (fatal) {
        console.warn('[connector] خطأ بيانات — تجاهل المعاملة')
        await transaction.complete()
      } else {
        // خطأ شبكة — أعد المحاولة لاحقاً (لا تُكمل المعاملة)
        throw error
      }
    }
  }
}
