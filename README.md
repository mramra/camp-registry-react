# 🏕️ نبض المخيم — React PWA v2.1

نظام إدارة مخيمات إنسانية مبني بـ React 18 + Vite + Tailwind CSS، يتصل مباشرة بـ Supabase (بدون تخزين محلي وسيط).

## التثبيت والتشغيل

```bash
npm install
npm run dev
```

## البناء للإنتاج

```bash
npm run build
npm run preview
```

## فحص جودة الكود

```bash
npm run lint        # فحص فقط
npm run lint:fix     # فحص + إصلاح تلقائي لما يمكن إصلاحه
npm run build:check  # فحص ثم بناء — يفشل لو فيه أخطاء eslint
```

## الهيكلية

```
src/
├── pages/                 # كل صفحات النظام، كل صفحة في مجلدها
│   ├── Dashboard/         # لوحة التحكم
│   ├── Families/          # قائمة الأسر + فورم الإضافة/التعديل
│   ├── Camps/             # المخيمات (رئيسية وفرعية)
│   ├── Users/             # المستخدمون والأدوار
│   ├── Movements/         # حركات الأسر
│   ├── Distributions/     # جولات ودفعات التوزيع
│   ├── Registers/         # السجلات الاجتماعية (أطفال/نساء/صحة/احتياجات/توزيعات)
│   ├── Women/ Children/ HealthReport/  # تقارير مخصّصة لكل فئة
│   ├── Analysis/          # التحليل + مقارنة المخيمات + تقارير الاحتياجات
│   ├── Export/            # الاستيراد والتصدير (Excel)
│   ├── Data/               # إدارة البيانات والنسخ الاحتياطي
│   ├── Diagnostics/       # تشخيص النظام (مخصّص للموبايل)
│   ├── PermissionsAdmin/  # إدارة صلاحيات الصفحات لكل دور/مستخدم
│   ├── Alerts/ Audit/     # التنبيهات وسجل التغييرات
│   ├── Devices/ SMS/ Settings/ Subscription/ Help/
│   ├── Login/             # تسجيل الدخول وتغيير كلمة المرور
│   └── FamilyPortal/      # بوابة عامة للأسرة (بدون تسجيل دخول)
│
├── components/
│   ├── ui/                # Button, Input, Card, Modal, Spinner ...
│   └── layout/            # Header, Sidebar, Layout
│
├── context/
│   ├── AuthContext.jsx        # المصادقة، الأدوار، الصلاحيات، معاينة المستخدمين
│   ├── AppContext.jsx         # حالة عامة (toast، حالة الاتصال بالإنترنت)
│   └── PowerSyncContext.jsx   # كاشف اتصال إنترنت بسيط حالياً (PowerSync غير مفعّل وقت الكتابة)
│
└── lib/
    ├── supabase.js         # عميل Supabase + ORG_ID
    ├── useLocalDB.js       # طبقة موحّدة للقراءة/الكتابة — تذهب مباشرة لـ Supabase (لا تخزين محلي)
    ├── schema.js            # مصدر الحقيقة الوحيد لأعمدة كل جدول — حدّثه عند أي تغيير في القاعدة
    ├── useDataScope.js      # عزل البيانات حسب الدور والمخيم (مدير الإيواء/المندوب/المساعد)
    ├── permissions.js       # قواعد الصلاحيات العامة (can_add/edit/delete/export/import)
    ├── pagePermissions.js   # صلاحيات الوصول لكل صفحة، لكل دور أو مستخدم بعينه
    ├── familyActivityLog.js # تسجيل إضافة/تعديل/حذف الأسر + حساب الفروقات بين القديم والجديد
    ├── excelBanner.js       # تنسيق رؤوس وألوان ملفات Excel المصدَّرة
    └── utils.js
```

## Tech Stack

- ⚛️ React 18 + Vite 5
- 🎨 Tailwind CSS
- 🗄️ Supabase (PostgreSQL + Auth + Storage) — اتصال مباشر، بدون طابور مزامنة محلي
- 🔀 React Router v6
- 📱 PWA (vite-plugin-pwa)
- 📊 xlsx-js-style (تصدير Excel منسَّق)

## ملاحظات مهمة لأي تعديل مستقبلي

- **لا يوجد تخزين محلي (Dexie/PowerSync) فعّال حالياً.** كل قراءة وكتابة تذهب مباشرة لـ Supabase عبر `useLocalDB.js`. لو فقد الاتصال، العملية تفشل بوضوح برسالة خطأ — لا طابور انتظار.
- **عند إضافة عمود جديد لأي جدول**، يجب تحديثه في `src/lib/schema.js` (في `columns`) أولاً، وإلا فستُحذف القيمة تلقائياً عبر `cleanForTable` ولن تُحفظ.
- **`PowerSyncContext.jsx`** اسمه قديم فقط — حالياً يعمل كمجرد كاشف اتصال إنترنت بسيط، وليس PowerSync حقيقياً. الاسم بقي لأن صفحات كثيرة تستورد `useSyncStatus` منه.
- **قبل أي رفع لـ GitHub**: نفّذ `npm run build` في نسخة محلية نظيفة للتأكد من عدم وجود أخطاء، ثم استخدم Git Data API (blob → tree → commit → update-ref) لرفع تعديلات متعددة الملفات في commit واحد أتومي.
