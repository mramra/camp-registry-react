---
name: camp-registry
description: مشروع سجل أسر المخيم — SaaS/PWA لإدارة المخيمات الإنسانية. استخدم هذا الـ Skill في كل جلسة عمل على هذا المشروع لتجنب إعادة شرح التفاصيل.
---

# نبض المخيم — SKILL (React v2)

## معلومات المشروع
- **GitHub React:** https://github.com/mramra/camp-registry-react
- **GitHub Pages:** https://mramra.github.io/camp-registry-react/
- **GitHub Old (HTML):** https://mramra.github.io/camp-registry/
- **Supabase URL:** https://ojclpkenecicujkqhhlu.supabase.co
- **Anon Key:** sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu
- **ORG_ID:** ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5
- **Platform Owner ID:** 583dce20-a25f-41b3-824e-6568bf4989ae
- **Edge Function:** admin-users (create/delete/reset_password)

## المطور
- **الاسم:** Mahmoud Rateb Ramadan
- **رقم الهوية:** 412617003
- **الدور:** platform_owner
- **البيئة:** جوال Android — Chrome + StackBlitz
- **GitHub Token:** منتهي الصلاحية — اطلب جديداً
- **رفع الكود:** عبر GitHub API (Python urllib) مباشرة من Claude

## Tech Stack (React v2)
```
React 18 + Vite 5 + Tailwind CSS v3 + React Router v6
Supabase JS v2 + Dexie.js v3 (IndexedDB) + vite-plugin-pwa
```

## هيكلية المشروع
```
src/
├── pages/           ← 17 صفحة (كل صفحة في مجلدها)
│   ├── Login/       LoginPage.jsx + ChangePassword.jsx
│   ├── Dashboard/   Dashboard.jsx
│   ├── Families/    FamiliesList.jsx + FamilyForm.jsx
│   ├── Camps/       CampsList.jsx (هرمي: رئيسي/فرعي)
│   ├── Users/       UsersList.jsx (هرمي: مدير→مندوب→مساعد)
│   ├── Distributions/ Distributions.jsx
│   ├── Movements/   Movements.jsx
│   ├── Analysis/    Analysis.jsx
│   ├── Data/        DataPage.jsx
│   ├── Settings/    Settings.jsx
│   ├── Audit/       AuditLog.jsx
│   ├── Alerts/      Alerts.jsx
│   ├── Devices/     Devices.jsx
│   ├── SMS/         SMS.jsx
│   ├── Help/        HelpPage.jsx
│   ├── Subscription/ Subscription.jsx
│   └── FamilyPortal/ FamilyPortal.jsx
├── components/
│   ├── ui/          Button Card Badge Modal Spinner SearchBar PageHeader EmptyState StatCard
│   └── layout/      Layout Header Sidebar
├── context/
│   ├── AuthContext.jsx  ← المصادقة + الصلاحيات
│   └── AppContext.jsx   ← Toast + online status + sync
├── lib/
│   ├── supabase.js  ← client + callAdminAPI()
│   ├── db.js        ← Dexie schema v7
│   ├── sync.js      ← processSyncQueue() + enqueue()
│   └── utils.js     ← formatDate, randomPassword, roleLabel
└── hooks/
    ├── useOfflineData.js ← hook موحد offline-first
    └── useLocalDB.js
```

## ⚠️ أسماء الأعمدة الصحيحة في جدول families
```
head_name    ← اسم رب الأسرة (وليس family_name)
head_id      ← رقم الهوية (وليس national_id)
phone1       ← رقم الجوال الأول (وليس phone)
phone2       ← رقم الجوال الثاني
head_gender  ← الجنس
head_marital ← الحالة الاجتماعية
head_dob     ← تاريخ الميلاد
tent         ← رقم الخيمة
original_address ← العنوان الأصلي
members_count ← عدد الأفراد
status       ← active/inactive/pending/departed/urgent
```

## Offline-First Pattern (الطريقة الموحدة)
```jsx
// استخدم useOfflineData في كل الصفحات
const { data, loading, syncing, fromCache, reload } = useOfflineData({
  localTable: 'camps',    // جدول Dexie
  remoteTable: 'camps',   // جدول Supabase
  select: '*',
  orderBy: 'created_at',
})

// عرض مؤشر الـ cache
{fromCache && <div>📱 بيانات محلية</div>}
{syncing && <div>🔄 جاري التحديث...</div>}

// حفظ offline-first
await localDB[table].put(data)        // محلي فوري
await enqueue('action', data)         // طابور المزامنة
if (navigator.onLine) supabase...     // سيرفر في الخلفية
```

## قواعد تطوير ثابتة
1. **فحص JS قبل الرفع:** بناء محلي `npm run build` في `/tmp/camp-build`
2. **Offline أولاً:** localDB.put() ثم supabase.upsert()
3. **لا imports من URLs:** استخدم crypto.randomUUID() وليس uuid من esm.sh
4. **Admin API:** عبر callAdminAPI() فقط — لا Service Role Key
5. **الرد بالعربية** دائماً
6. **رفع الكود:** Python urllib + GitHub API

## Dexie Schema (version 7)
```javascript
localDB.version(7).stores({
  families:           'id, camp_id, org_id, status, updated_at',
  family_members:     'id, family_id, national_id',
  camps:              'id, org_id',
  sync_queue:         '++id, status',
  meta:               'key',
  dist_rounds:        'id, camp_id, org_id, status',
  camp_distributions: 'id, camp_id, org_id, status, round_id',
  camp_dist_families: 'id, distribution_id, family_id',
  org_members:        'id, org_id, role, camp_id, created_by, user_id',
  family_movements:   'id, family_id, org_id, type, date',
  family_history:     'id, family_id, org_id, created_at',
})
```

## الأدوار (4 أدوار)
| الدور | العرض | الصلاحيات |
|---|---|---|
| platform_owner | 👑 | كل شيء |
| super_admin | 🔴 مدير الإيواء | تحت المالك |
| camp_delegate | 🟠 مندوب مخيم | مخيمه فقط |
| assistant | 🟡 مساعد | حسب can_add/edit/delete/export/import |

## المصادقة
- **email:** nationalId + '@c.co'
- **كلمة المرور الأولى:** رقم الجوال → must_change_pass=true
- **Rate limiting:** 3 محاولات→15ث، 5→60ث

## الصفحات وحالتها
| الصفحة | الحالة |
|---|---|
| تسجيل الدخول + تغيير كلمة المرور | ✅ كامل |
| لوحة التحكم (Dashboard) | ✅ كامل |
| قائمة الأسر + فلاتر | ✅ كامل |
| إضافة/تعديل أسرة | ✅ كامل |
| المخيمات (هرمي رئيسي/فرعي) | ✅ offline-first |
| المستخدمين (هرمي مدير→مندوب→مساعد) | ✅ offline-first |
| التوزيعات | ✅ offline-first |
| حركات الأسر | ✅ offline-first |
| التقارير والتحليلات | ✅ من local |
| استيراد/تصدير CSV | ✅ |
| الإعدادات | ✅ |
| سجل النشاط | ✅ (online فقط) |
| التنبيهات الذكية | ✅ من local |
| الأجهزة | ✅ |
| رسائل SMS | ✅ UI (بدون API) |
| المساعدة | ✅ |
| الاشتراك | ✅ UI |
| بوابة الأسرة | ✅ |

## طريقة فحص البناء (مهم قبل كل رفع)
```bash
cd /tmp/camp-build
# انسخ ملفاتك المعدلة هنا
npm run build 2>&1 | tail -20
# إذا ظهر "built in X.XXs" → ✅ OK للرفع
```

## مشاكل محلولة مهمة
| المشكلة | الحل |
|---|---|
| family_name/national_id خاطئ | الصحيح: head_name/head_id/phone1 |
| import uuid من esm.sh | استخدم crypto.randomUUID() |
| if(x) fn() else → build error | أضف `;` قبل else |
| GitHub Pages 404 | vite base = '/camp-registry-react/' |
| صفحة بيضاء | basename في BrowserRouter يطابق base |
| RLS infinite recursion | DROP FUNCTION get_my_role() CASCADE |
| Dexie version conflict | أضف version history كاملاً |

## ما لم يُبنَ بعد
- SMS API حقيقي (Msegat/Unifonic)
- إضافة/تعديل أفراد الأسرة (family_members)
- استيراد Excel للأسر
- تقارير PDF
- Push Notifications

## البيانات الحالية في Supabase
- ~184 أسرة + ~375 فرد
- المخيمات: العزايزة، العزايزة خارجي، خارجي، مصبح، مصبح خارجي، مخيم السلام الأولمبي
