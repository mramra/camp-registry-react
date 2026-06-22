/**
 * excelExport.js — تصدير صفوف بيانات إلى ملف Excel بتنسيق موحَّد
 * (رأس أزرق مع نص أبيض، صفوف متبادلة، عرض أعمدة ثابت).
 * يحتاج مكتبة xlsx-js-style مثبَّتة بالفعل بالمشروع.
 */
import XLSX from 'xlsx-js-style'

/**
 * يصدّر مصفوفة صفوف (objects) إلى ملف Excel جاهز للتنزيل فوراً.
 * @param {Array<Object>} rows - صفوف البيانات
 * @param {string} sheetName - اسم الورقة داخل الملف
 * @param {string} fileName - اسم الملف (بدون امتداد، يُضاف التاريخ والامتداد تلقائياً)
 */
export function exportXLSX(rows, sheetName, fileName) {
  if (!rows.length) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const keys = Object.keys(rows[0]||{})
  ws['!cols'] = keys.map(()=>({wch:20}))
  // تنسيق رؤوس الأعمدة
  keys.forEach((_,col)=>{
    const addr = XLSX.utils.encode_cell({r:0,c:col})
    if(ws[addr]) ws[addr].s = {
      fill:{patternType:'solid',fgColor:{rgb:'1E3A5F'},bgColor:{rgb:'1E3A5F'}},
      font:{bold:true,color:{rgb:'FFFFFF'},sz:10},
      alignment:{horizontal:'center',vertical:'center'}
    }
  })
  // صفوف متبادلة
  for(let row=1;row<rows.length+1;row++){
    const bg=(row-1)%2===0?'FFFFFF':'EEF2F7'
    keys.forEach((_,col)=>{
      const addr=XLSX.utils.encode_cell({r:row,c:col})
      if(ws[addr]) ws[addr].s={
        fill:{patternType:'solid',fgColor:{rgb:bg}},
        font:{sz:10},alignment:{horizontal:'center',vertical:'center'}
      }
    })
  }
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,sheetName)
  XLSX.writeFile(wb,`${fileName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
}
