/**
 * excelExport.js — تصدير صفوف بيانات إلى ملف Excel بتنسيق موحَّد
 * (رأس أزرق مع نص أبيض، صفوف متبادلة، عرض أعمدة ثابت).
 * يحتاج مكتبة xlsx-js-style مثبَّتة بالفعل بالمشروع.
 */
import XLSX from 'xlsx-js-style'
import { applyBanner } from './excelBanner'

/**
 * يصدّر مصفوفة صفوف (objects) إلى ملف Excel جاهز للتنزيل فوراً.
 * @param {Array<Object>} rows - صفوف البيانات
 * @param {string} sheetName - اسم الورقة داخل الملف
 * @param {string} fileName - اسم الملف (بدون امتداد، يُضاف التاريخ والامتداد تلقائياً)
 * @param {object|null} campInfo - اختياري: { campName, delegateName, delegatePhone, latitude, longitude }
 *   لو مُمرَّر، يُضاف بانر المخيم بصفين فوق الجدول (نفس تنسيق صفحة الاستيراد والتصدير)
 */
export function exportXLSX(rows, sheetName, fileName, campInfo = null) {
  if (!rows.length) return
  const headerRow = campInfo ? 2 : 0
  const ws = XLSX.utils.json_to_sheet(rows, { origin: `A${headerRow + 1}` })
  const keys = Object.keys(rows[0]||{})
  ws['!cols'] = keys.map(()=>({wch:20}))
  // تنسيق رؤوس الأعمدة
  keys.forEach((_,col)=>{
    const addr = XLSX.utils.encode_cell({r:headerRow,c:col})
    if(ws[addr]) ws[addr].s = {
      fill:{patternType:'solid',fgColor:{rgb:'1E3A5F'},bgColor:{rgb:'1E3A5F'}},
      font:{bold:true,color:{rgb:'FFFFFF'},sz:10},
      alignment:{horizontal:'center',vertical:'center'}
    }
  })
  // صفوف متبادلة
  for(let row=headerRow+1;row<headerRow+1+rows.length;row++){
    const bg=(row-headerRow-1)%2===0?'FFFFFF':'EEF2F7'
    keys.forEach((_,col)=>{
      const addr=XLSX.utils.encode_cell({r:row,c:col})
      if(ws[addr]) ws[addr].s={
        fill:{patternType:'solid',fgColor:{rgb:bg}},
        font:{sz:10},alignment:{horizontal:'center',vertical:'center'}
      }
    })
  }
  if (campInfo) applyBanner(ws, campInfo, keys.length)
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,sheetName)
  XLSX.writeFile(wb,`${fileName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
}
