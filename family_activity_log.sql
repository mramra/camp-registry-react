-- ════════════════════════════════════════════════════════════
-- جدول سجل نشاط الأسر (إضافة / تعديل / حذف)
-- نفّذ هذا الملف كاملاً في Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════

create table if not exists family_activity_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  family_id       uuid,                 -- يبقى موجوداً حتى بعد حذف الأسرة (لا foreign key قاسي)
  family_name     text,
  members_count   integer default 0,
  action          text not null check (action in ('insert','update','delete')),
  actor_id        uuid,                 -- auth.users.id لمن قام بالعملية
  actor_name      text,                 -- اسم المستخدم وقت العملية (مخزّن نصياً لتجنّب فقدانه لو حُذف المستخدم لاحقاً)
  created_at      timestamptz not null default now()
);

create index if not exists idx_family_activity_log_org_created
  on family_activity_log (org_id, created_at desc);

create index if not exists idx_family_activity_log_family
  on family_activity_log (family_id);

alter table family_activity_log enable row level security;

-- قراءة: كل المستخدمين المسجّلين في نفس المنظمة
drop policy if exists "family_activity_log_select" on family_activity_log;
create policy "family_activity_log_select" on family_activity_log
  for select to authenticated
  using (org_id = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5');

-- إضافة: كل المستخدمين المسجّلين في نفس المنظمة
drop policy if exists "family_activity_log_insert" on family_activity_log;
create policy "family_activity_log_insert" on family_activity_log
  for insert to authenticated
  with check (org_id = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5');

-- لا تعديل ولا حذف لأي مستخدم عادي (سجل ثابت/append-only)
