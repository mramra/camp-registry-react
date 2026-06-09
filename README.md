# 🏕️ نبض المخيم — React PWA v2.0

نظام إدارة مخيمات إنسانية مبني بـ React 18 + Vite + Tailwind CSS

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

## الهيكلية

```
src/
├── pages/          # 16 صفحة
│   ├── Dashboard/  # لوحة التحكم
│   ├── Families/   # إدارة الأسر
│   ├── Camps/      # إدارة المخيمات
│   ├── Users/      # إدارة المستخدمين
│   ├── Distributions/ # التوزيعات
│   ├── Analysis/   # التقارير
│   └── ...
├── components/
│   ├── ui/         # Button, Input, Card, Modal ...
│   └── layout/     # Header, Sidebar, Layout
├── context/
│   ├── AuthContext # المصادقة والصلاحيات
│   └── AppContext  # حالة التطبيق + Toast
├── lib/
│   ├── supabase.js # Supabase client
│   ├── db.js       # Dexie (Offline DB)
│   ├── sync.js     # مزامنة الطابور
│   └── utils.js    # دوال مساعدة
└── hooks/
    ├── useSupabase.js # جلب بيانات من السيرفر
    └── useLocalDB.js  # جلب بيانات محلية
```

## Tech Stack

- ⚛️ React 18 + Vite
- 🎨 Tailwind CSS
- 🗄️ Supabase (Backend)
- 💾 Dexie.js (IndexedDB - Offline)
- 🔀 React Router v6
- 📱 PWA (vite-plugin-pwa)
