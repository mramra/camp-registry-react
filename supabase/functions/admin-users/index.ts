// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// القيم الثابتة (غير سرية)
const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co';
const SUPABASE_ANON = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu';
// السري يأتي من Environment Variables فقط
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ORG_ID = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
serve(async (req)=>{
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  try {
    // ① تحقق من JWT المستخدم
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({
      error: 'غير مصرح'
    }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({
      error: 'جلسة غير صالحة'
    }, 401);
    // ② تحقق من دور المستخدم في org_members
    const { data: member } = await userClient.from('org_members').select('role, is_active').eq('user_id', user.id).eq('org_id', ORG_ID).single();
    if (!member?.is_active) return json({
      error: 'الحساب موقوف'
    }, 403);
    const body = await req.json();
    const { action } = body;
    // فحص الصلاحيات الأمني: لمالك المنصة فقط (يولّد جلسات تجريبية لمستخدمين آخرين)
    if (action === 'security_audit') {
      if (member.role !== 'platform_owner') return json({
        error: 'هذا الفحص لمالك المنصة فقط'
      }, 403);
      return await runSecurityAudit(body.memberId);
    }
    const allowedRoles = [
      'platform_owner',
      'super_admin',
      'camp_delegate'
    ];
    if (!allowedRoles.includes(member.role)) return json({
      error: 'صلاحية غير كافية'
    }, 403);
    const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE,
      'Authorization': `Bearer ${SUPABASE_SERVICE}`
    };
    // قيود الدور:
    // camp_delegate لا يستطيع إنشاء super_admin
    if (member.role === 'camp_delegate') {
      if (action === 'create' && body.role !== 'assistant') return json({
        error: 'المندوب يستطيع إنشاء مساعدين فقط'
      }, 403);
    }
    if (member.role === 'super_admin') {
      if (action === 'create' && ![
        'camp_delegate',
        'assistant'
      ].includes(body.role)) return json({
        error: 'مدير الإيواء يستطيع إنشاء مناديب ومساعدين فقط'
      }, 403);
    }
    // ── إنشاء مستخدم ──
    if (action === 'create') {
      const { nationalId, phone, fullName } = body;
      if (!nationalId || !phone || !fullName) return json({
        error: 'بيانات ناقصة'
      }, 400);
      const res = await fetch(adminUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: nationalId + '@c.co',
          password: phone,
          email_confirm: true,
          user_metadata: {
            full_name: fullName
          }
        })
      });
      const data = await res.json();
      if (!res.ok) return json({
        error: data.message || 'فشل إنشاء الحساب'
      }, res.status);
      return json({
        id: data.id
      });
    }
    // ── حذف مستخدم ──
    if (action === 'delete') {
      const { userId } = body;
      if (!userId) return json({
        error: 'userId مطلوب'
      }, 400);
      const res = await fetch(`${adminUrl}/${userId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) {
        const e = await res.json();
        return json({
          error: e.message
        }, res.status);
      }
      return json({
        success: true
      });
    }
    // ── إعادة كلمة المرور ──
    if (action === 'reset_password') {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) return json({
        error: 'بيانات ناقصة'
      }, 400);
      const res = await fetch(`${adminUrl}/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          password: newPassword
        })
      });
      if (!res.ok) {
        const e = await res.json();
        return json({
          error: e.message
        }, res.status);
      }
      return json({
        success: true
      });
    }
    return json({
      error: 'action غير معروف'
    }, 400);
  } catch (e) {
    return json({
      error: e.message
    }, 500);
  }
});

// ════════════════════════════════════════════════════════════
// الفحص الأمني الدوري: يحاكي تسجيل دخول حقيقي لكل مستخدم (غير platform_owner)
// عبر جلسة OTP مؤقتة، ثم يقرأ كل الجداول الحساسة بهويته الحقيقية،
// ويقارن ما يراه فعلياً بما يجب أن يراه حسب دوره ومخيمه — يكشف أي تسريب RLS فوراً.
// ════════════════════════════════════════════════════════════
async function runSecurityAudit(onlyMemberId) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [{ data: allMembers }, { data: allCamps }, { data: allFamilies }, { data: allDists }] = await Promise.all([
    admin.from('org_members').select('id,user_id,full_name,national_id,role,camp_id,is_active').eq('org_id', ORG_ID),
    admin.from('camps').select('id,name,manager_id,parent_camp_id').eq('org_id', ORG_ID),
    admin.from('families').select('id,camp_id').eq('org_id', ORG_ID),
    admin.from('camp_distributions').select('id,camp_id').eq('org_id', ORG_ID),
  ]);

  const famCampMap = Object.fromEntries((allFamilies || []).map((f) => [f.id, f.camp_id]));
  const distCampMap = Object.fromEntries((allDists || []).map((d) => [d.id, d.camp_id]));

  function allowedCampIdsFor(member) {
    if (member.role === 'platform_owner') return null;
    if (member.role === 'super_admin') {
      const managed = (allCamps || []).filter((c) => c.manager_id === member.user_id);
      if (!managed.length) return null;
      const ids = new Set(managed.map((c) => c.id));
      (allCamps || []).forEach((c) => { if (ids.has(c.parent_camp_id)) ids.add(c.id); });
      return [...ids];
    }
    if (member.camp_id) {
      const ids = new Set([member.camp_id]);
      (allCamps || []).forEach((c) => { if (c.parent_camp_id === member.camp_id) ids.add(c.id); });
      return [...ids];
    }
    return [];
  }

  let targets = (allMembers || []).filter((m) => m.role !== 'platform_owner' && m.is_active !== false);
  if (onlyMemberId) targets = targets.filter((m) => m.id === onlyMemberId);

  const report = [];

  for (const member of targets) {
    const allowed = allowedCampIdsFor(member);
    const email = `${member.national_id}@c.co`;
    let testClient;
    try {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const otp = linkData?.properties?.email_otp;
      if (linkErr || !otp) throw new Error('تعذر توليد جلسة فحص');

      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', token: otp, email }),
      });
      const session = await verifyRes.json();
      if (!session?.access_token) throw new Error('فشل تسجيل الدخول التجريبي');

      testClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        global: { headers: { Authorization: `Bearer ${session.access_token}` } },
        auth: { persistSession: false },
      });
    } catch (e) {
      report.push({ member: member.full_name, role: member.role, error: e.message });
      continue;
    }

    const tableResults = [];
    async function checkTable(table, cols, campResolver) {
      const { data, error } = await testClient.from(table).select(cols).limit(1000);
      if (error) { tableResults.push({ table, error: error.message }); return; }
      const rows = data || [];
      const campsSeen = new Set();
      rows.forEach((r) => { const c = campResolver(r); if (c) campsSeen.add(c); });
      const leakedCamps = allowed === null ? [] : [...campsSeen].filter((c) => !allowed.includes(c));
      tableResults.push({
        table, rows: rows.length, camps_seen: [...campsSeen],
        leaked: leakedCamps.length > 0, leaked_camps: leakedCamps,
      });
    }

    await checkTable('camps', 'id', (r) => r.id);
    await checkTable('dist_rounds', 'id,camp_id', (r) => r.camp_id);
    await checkTable('camp_distributions', 'id,camp_id', (r) => r.camp_id);
    await checkTable('families', 'id,camp_id', (r) => r.camp_id);
    await checkTable('family_members', 'id,family_id', (r) => famCampMap[r.family_id]);
    await checkTable('family_movements', 'id,family_id', (r) => famCampMap[r.family_id]);
    await checkTable('family_history', 'id,family_id', (r) => famCampMap[r.family_id]);
    await checkTable('camp_dist_families', 'id,distribution_id', (r) => distCampMap[r.distribution_id]);

    // org_members: حالة خاصة — لا يجوز رؤية أي عضو خارج النطاق (ولا حتى أعضاء بلا مخيم سوى نفسه)
    const { data: omRows, error: omErr } = await testClient.from('org_members').select('id,camp_id,user_id');
    if (omErr) {
      tableResults.push({ table: 'org_members', error: omErr.message });
    } else {
      const rows = omRows || [];
      const leaks = rows.filter((r) => r.user_id !== member.user_id && (allowed === null ? false : !allowed.includes(r.camp_id)));
      tableResults.push({
        table: 'org_members', rows: rows.length,
        leaked: leaks.length > 0, leaked_camps: [...new Set(leaks.map((r) => r.camp_id))],
      });
    }

    try { await testClient.auth.signOut(); } catch (_e) { /* تجاهل */ }

    report.push({
      member: member.full_name, role: member.role, camp_id: member.camp_id,
      allowed_camps: allowed, tables: tableResults,
      has_leak: tableResults.some((t) => t.leaked),
    });
  }

  return json({ checked_at: new Date().toISOString(), targets_checked: report.length, report });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
