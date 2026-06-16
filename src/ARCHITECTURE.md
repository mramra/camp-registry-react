# هيكلية المشروع — نبض المخيم

```
src/
├── routes/              ← مثل routes/web.php في Laravel
│   └── index.jsx        ← كل المسارات + middleware
│
├── models/              ← مثل app/Models/ في Laravel
│   ├── BaseModel.js     ← قاعدة كل الـ Models (CRUD)
│   ├── Family.js        ← Family + FamilyMember
│   ├── Camp.js          ← Camp
│   ├── User.js          ← User (org_members)
│   ├── Distribution.js  ← DistRound + CampDistribution + DistFamily
│   ├── Movement.js      ← Movement
│   └── index.js         ← barrel export
│
├── controllers/         ← مثل app/Http/Controllers/ في Laravel
│   ├── FamilyController.js
│   ├── CampController.js
│   ├── UserController.js
│   ├── DistributionController.js
│   └── index.js
│
├── lib/                 ← أدوات مشتركة
│   ├── supabase.js      ← Supabase client
│   ├── db.js            ← Dexie schema
│   ├── powersync.js     ← SQLite WASM
│   ├── useRxDB.js       ← Data hook (SQLite→Dexie→Supabase)
│   ├── syncAll.js       ← quickSync عند الدخول
│   ├── deltaSync.js     ← مزامنة ذكية كل 2.5 دقيقة
│   └── permissions.js   ← نظام الصلاحيات المركزي
│
├── context/             ← React Context
│   ├── AuthContext.jsx  ← المستخدم + الصلاحيات
│   ├── AppContext.jsx   ← الإنترنت + Toast
│   └── PowerSyncContext.jsx ← SQLite init
│
├── pages/               ← UI فقط (View layer)
│   ├── Dashboard/
│   ├── Families/
│   ├── Camps/
│   ├── Users/
│   ├── Movements/
│   ├── Distributions/
│   ├── Registers/       ← أطفال + نساء + صحة + توزيعات
│   ├── Analysis/
│   ├── Export/
│   ├── Data/
│   └── Login/
│
└── components/          ← UI Components
    ├── layout/          ← Header + Sidebar
    └── ui/              ← PageHeader + Card + Spinner...
```

## استخدام الـ MVC

### Model
```js
import { Family } from '../models'
const families = await Family.findAll({ camp_id: campId })
const family   = await Family.findWithMembers(id)
await Family.create({ head_name, camp_id, ... })
await Family.delete(id) // يحذف الأفراد تلقائياً
```

### Controller
```js
import { FamilyController } from '../controllers'
const result = await FamilyController.store(data, members, profile)
const stats  = await FamilyController.stats(campFilter)
```

### Routes
```js
import { routes } from '../routes'
// كل route له middleware: 'auth' | 'owner' | 'admin' | 'can:write'
```
