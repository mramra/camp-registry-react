/**
 * excelStyle.js — تنسيق جدول Excel بأسلوب موحَّد (ألوان النظام، صفوف متبادلة)
 * يدعم بانر اختياري (دمج خليتين أوليين) قبل رأس الجدول.
 * مختلف عن excelBanner.js (الذي يبني بيانات البانر نفسها بمعلومات المخيم)
 * — هذا الملف فقط يُنسِّق الشكل البصري للجدول كاملاً.
 */

export const NAVY  = '1E3A5F'
export const GOLD   = 'F59E0B'
export const WHITE  = 'FFFFFF'
export const GRAY   = 'F8FAFC'
export const LGRAY  = 'E2E8F0'

/**
 * يُنسِّق ورقة Excel: رأس جدول كحلي مع نص أبيض/ذهبي، صفوف متبادلة، عرض أعمدة ثابت.
 * @param {object} ws - ورقة xlsx-js-style
 * @param {number} colCount - عدد الأعمدة
 * @param {boolean} showBanner - هل يوجد بانر بصفّين أوليين يحتاج دمج خلايا؟
 * @param {number} dataLen - عدد صفوف البيانات (بدون الرأس)
 */
export function styleSheet(ws, colCount, showBanner, dataLen) {
  const off = showBanner ? 3 : 1
  if (showBanner) {
    if (!ws['!merges']) ws['!merges']=[]
    ws['!merges'].push({s:{r:0,c:0},e:{r:0,c:colCount-1}})
    ws['!merges'].push({s:{r:1,c:0},e:{r:1,c:colCount-1}})
    if (!ws['!rows']) ws['!rows']=[]
    ws['!rows'][0]={hpt:34}; ws['!rows'][1]={hpt:22}
    if(ws['A1']) ws['A1'].s={font:{name:'Cairo',bold:true,sz:16,color:{rgb:GOLD}},fill:{patternType:'solid',fgColor:{rgb:NAVY}},alignment:{horizontal:'center',vertical:'center',readingOrder:2}}
    if(ws['A2']) ws['A2'].s={font:{name:'Cairo',sz:10,color:{rgb:'CBD5E1'}},fill:{patternType:'solid',fgColor:{rgb:NAVY}},alignment:{horizontal:'center',vertical:'center',readingOrder:2}}
  }
  for(let c=0;c<colCount;c++){
    const cell=`${String.fromCharCode(65+c)}${off}`
    if(ws[cell]) ws[cell].s={font:{name:'Cairo',bold:true,sz:10,color:{rgb:WHITE}},fill:{patternType:'solid',fgColor:{rgb:NAVY}},alignment:{horizontal:'center',vertical:'center',wrapText:true,readingOrder:2},border:{bottom:{style:'medium',color:{rgb:GOLD}}}}
  }
  for(let r=0;r<dataLen;r++) for(let c=0;c<colCount;c++){
    const cell=`${String.fromCharCode(65+c)}${off+1+r}`
    if(ws[cell]) ws[cell].s={font:{name:'Cairo',sz:9},fill:{patternType:'solid',fgColor:{rgb:r%2===0?WHITE:GRAY}},alignment:{horizontal:'center',vertical:'center',readingOrder:2},border:{bottom:{style:'thin',color:{rgb:LGRAY}}}}
  }
  ws['!cols']=Array(colCount).fill({wch:18})
}
