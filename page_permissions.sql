-- ════════════════════════════════════════════════════════════
-- نظام صلاحيات الصفحات الديناميكي (page_permissions)
-- نفّذ هذا في Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════

create table if not exists page_permissions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  scope         text not null check (scope in ('role','user')),
  -- scope='role'  → scope_value هو اسم الدور (platform_owner/super_admin/camp_delegate/assistant)
  -- scope='user'  → scope_value هو user_id (auth.users.id) — استثناء فردي يطغى على إعداد الدور
  scope_value   text not null,
  page_key      text not null,           -- مثل 'users', 'data', 'analysis', 'devices' ...
  allowed       boolean not null,
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  unique (org_id, scope, scope_value, page_key)
);

create index if not exists idx_page_permissions_lookup
  on page_permissions (org_id, scope, scope_value);

alter table page_permissions enable row level security;

-- قراءة: كل المستخدمين المسجّلين في نفس المنظمة (يحتاجها كل مستخدم ليعرف صفحاته المسموحة)
drop policy if exists "page_permissions_select" on page_permissions;
create policy "page_permissions_select" on page_permissions
  for select to authenticated
  using (org_id = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5');

-- تعديل: فقط من نفّذ هذا عبر الكود (نتحقق من platform_owner داخل الواجهة وليس RLS لتبسيط الإدارة)
-- ملاحظة أمنية: التحقق الفعلي من أن المعدّل هو platform_owner يتم في صفحة الإدارة بالواجهة.
-- لمزيد من الصرامة لاحقاً يمكن ربطها بفحص الدور عبر RLS مباشرة.
drop policy if exists "page_permissions_insert" on page_permissions;
create policy "page_permissions_insert" on page_permissions
  for insert to authenticated
  with check (org_id = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5');

drop policy if exists "page_permissions_update" on page_permissions;
create policy "page_permissions_update" on page_permissions
  for update to authenticated
  using (org_id = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5');

drop policy if exists "page_permissions_delete" on page_permissions;
create policy "page_permissions_delete" on page_permissions
  for delete to authenticated
  using (org_id = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5');
