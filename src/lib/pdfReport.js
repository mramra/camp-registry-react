/**
 * pdfReport.js — تصدير تقرير إحصائي رسمي بصيغة PDF (للجهات الداعمة/الشركاء)
 *
 * لماذا html2canvas بدل رسم النص العربي مباشرة بـ jsPDF؟
 * jsPDF لا يدعم تشكيل الحروف العربية (الحرف يتغيّر شكله حسب موضعه: بداية/وسط/نهاية)
 * إلا بتضمين خط مخصص + خوارزمية reshaping معقدة — عالية الخطورة بلا اختبار بصري حقيقي.
 * الحل الأكثر أماناً: نبني HTML عادي (نفس الطريقة التي يعرض بها المتصفح العربية بصحة
 * تامة في كل صفحات هذا التطبيق)، نصوّره كصورة بـ html2canvas، ثم نضع الصورة داخل PDF.
 */
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

function statBox(icon, label, value) {
  return `
    <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center;min-width:0;">
      <div style="font-size:22px;line-height:1;">${icon}</div>
      <div style="font-size:20px;font-weight:900;color:#111827;margin-top:6px;">${value ?? 0}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">${label}</div>
    </div>`
}

function sectionTitle(text) {
  return `<div style="font-size:15px;font-weight:800;color:#111827;margin:24px 0 10px;border-right:4px solid #f59e0b;padding-right:10px;">${text}</div>`
}

function buildReportHTML(stats, { orgName, scopeName, today }) {
  const campRows = (stats.byCamp || []).map(c => `
    <tr>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;">${c.name}</td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center;font-weight:700;">${c.count}</td>
    </tr>`).join('')

  const h = stats.healthData || {}

  return `
    <div style="font-family:'Cairo','Tahoma',sans-serif;direction:rtl;color:#111827;width:794px;background:#ffffff;padding:40px;box-sizing:border-box;">

      <div style="text-align:center;border-bottom:3px solid #f59e0b;padding-bottom:18px;margin-bottom:26px;">
        <div style="font-size:24px;font-weight:900;">${orgName}</div>
        <div style="font-size:14px;color:#6b7280;margin-top:6px;">تقرير إحصائي رسمي</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;">${scopeName} &nbsp;—&nbsp; ${today}</div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:8px;">
        ${statBox('👨‍👩‍👧‍👦', 'إجمالي الأسر', stats.total)}
        ${statBox('👤', 'إجمالي الأفراد', stats.totalPersons)}
        ${statBox('🏕️', 'عدد المخيمات', (stats.byCamp || []).length)}
      </div>

      ${sectionTitle('التوزيع حسب المخيم')}
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;">المخيم</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;">عدد الأسر</th>
          </tr>
        </thead>
        <tbody>${campRows || '<tr><td colspan="2" style="padding:10px;text-align:center;color:#9ca3af;">لا توجد بيانات</td></tr>'}</tbody>
      </table>

      ${sectionTitle('التركيبة السكانية')}
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${statBox('👨', 'ذكور', stats.males)}
        ${statBox('👩', 'إناث', stats.females)}
        ${statBox('🧒', 'أطفال (أقل من 18)', stats.children)}
      </div>

      ${sectionTitle('الحالات الصحية')}
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${statBox('🦽', 'إعاقة', h['معاق'])}
        ${statBox('🩹', 'إصابة', h['مصاب'])}
        ${statBox('💊', 'مرض مزمن', h['مزمن'])}
        ${statBox('👶', 'أيتام', stats.orphans)}
      </div>

      ${sectionTitle('التوزيعات الإغاثية')}
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${statBox('📦', 'جولات نشطة', stats.activeRounds)}
        ${statBox('✅', 'أسر استلمت', stats.receivedCount)}
        ${statBox('⏳', 'لم تستلم بعد', stats.notReceived)}
      </div>

      <div style="margin-top:36px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center;">
        تم إنشاء هذا التقرير تلقائياً عبر نظام ${orgName} — لا يمثّل بياناً رسمياً مدققاً يدوياً
      </div>
    </div>`
}

/**
 * يولّد ويُنزِّل تقرير PDF إحصائي من بيانات stats الجاهزة (نفس بنية Analysis.jsx).
 * scopeName: نص يوضّح النطاق (مثلاً "كل المخيمات" أو اسم مخيم محدد).
 */
export async function exportStatsPDF(stats, { orgName = 'نبض المخيم', scopeName = 'كل المخيمات' } = {}) {
  const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '-99999px'
  container.style.left = '0'
  container.style.zIndex = '-1'
  container.innerHTML = buildReportHTML(stats, { orgName, scopeName, today })
  document.body.appendChild(container)

  try {
    const target = container.firstElementChild
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true })

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth  = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth   = pageWidth
    const imgHeight  = (canvas.height * imgWidth) / canvas.width
    const imgData    = canvas.toDataURL('image/png')

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      position -= pageHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    const fileSafeScope = scopeName.replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, '').trim() || 'تقرير'
    pdf.save(`${fileSafeScope}-${today}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
