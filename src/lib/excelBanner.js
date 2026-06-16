/**
 * excelBanner.js — بانر Excel للمخيم
 * قابل للاستخدام في أي تصدير Excel
 *
 * الاستخدام:
 *   import { applyBanner } from '../../lib/excelBanner'
 *   const { ws, colCount } = applyBanner(ws, campInfo, columns)
 */

/**
 * @param {object} ws        - ورقة xlsx-js-style
 * @param {object} campInfo  - { campName, delegateName, delegatePhone, latitude, longitude, date }
 * @param {number} colCount  - عدد الأعمدة
 * @returns {object} ws مع البانر مطبّق
 */
export function applyBanner(ws, campInfo, colCount) {
  const { campName, delegateName, delegatePhone, latitude, longitude } = campInfo
  const date = new Date().toLocaleDateString('ar-EG')
  const coord = (latitude && longitude)
    ? `${parseFloat(latitude).toFixed(5)}, ${parseFloat(longitude).toFixed(5)}`
    : '—'

  // ── ألوان وأنماط ─────────────────────────────────────────
  const NAVY   = { rgb: '1E3A5F' }
  const GOLD   = { rgb: 'F59E0B' }
  const WHITE  = { rgb: 'FFFFFF' }
  const SILVER = { rgb: 'CBD5E1' }

  const boldWhite = {
    font:      { name:'Cairo', bold:true, sz:14, color:WHITE },
    fill:      { patternType:'solid', fgColor:NAVY },
    alignment: { horizontal:'center', vertical:'center', wrapText:true, readingOrder:2 },
    border:    { bottom:{ style:'thin', color:SILVER } },
  }
  const subStyle = {
    font:      { name:'Cairo', sz:10, color:SILVER },
    fill:      { patternType:'solid', fgColor:NAVY },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 },
  }

  // ── صف 1: اسم المخيم ─────────────────────────────────────
  ws['A1'] = {
    v: `🏕️ مخيم:  ${campName}`,
    t: 's', s: { ...boldWhite, font: { ...boldWhite.font, sz: 16, color: GOLD } }
  }

  // ── صف 2: المندوب | الجوال | الإحداثيات | التاريخ ────────
  const row2text = [
    `المندوب: ${delegateName || '—'}`,
    `الجوال: ${delegatePhone || '—'}`,
    coord !== '—' ? `📍 ${coord}` : '',
    `📅 ${date}`,
  ].filter(Boolean).join('   |   ')

  ws['A2'] = { v: row2text, t: 's', s: subStyle }

  // ── دمج الخلايا ──────────────────────────────────────────
  const lastCol = String.fromCharCode(64 + colCount)
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push(
    { s:{r:0,c:0}, e:{r:0,c:colCount-1} },  // صف 1
    { s:{r:1,c:0}, e:{r:1,c:colCount-1} },  // صف 2
  )

  // ── ارتفاع الصفوف ────────────────────────────────────────
  if (!ws['!rows']) ws['!rows'] = []
  ws['!rows'][0] = { hpt: 36 }
  ws['!rows'][1] = { hpt: 24 }

  return ws
}

/**
 * أنماط خلايا الجدول (رأس + بيانات)
 */
export const TABLE_STYLES = {
  header: {
    font:      { name:'Cairo', bold:true, sz:10, color:{ rgb:'FFFFFF' } },
    fill:      { patternType:'solid', fgColor:{ rgb:'1E3A5F' } },
    alignment: { horizontal:'center', vertical:'center', wrapText:true, readingOrder:2 },
    border: {
      top:    { style:'thin', color:{ rgb:'334155' } },
      bottom: { style:'medium', color:{ rgb:'F59E0B' } },
      left:   { style:'thin', color:{ rgb:'334155' } },
      right:  { style:'thin', color:{ rgb:'334155' } },
    }
  },
  rowEven: {
    font:      { name:'Cairo', sz:9, color:{ rgb:'1E293B' } },
    fill:      { patternType:'solid', fgColor:{ rgb:'FFFFFF' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 },
    border: { bottom:{ style:'thin', color:{ rgb:'E2E8F0' } } }
  },
  rowOdd: {
    font:      { name:'Cairo', sz:9, color:{ rgb:'1E293B' } },
    fill:      { patternType:'solid', fgColor:{ rgb:'F8FAFC' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 },
    border: { bottom:{ style:'thin', color:{ rgb:'E2E8F0' } } }
  },
}
