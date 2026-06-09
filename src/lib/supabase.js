import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_d6q8hoDDcohuZFHk3jxI7g_IBWWCmNu'
export const ORG_ID = 'ddc8abe7-518f-40a4-8c3b-ee03bb0f47d5'
export const PLATFORM_OWNER_ID = '583dce20-a25f-41b3-824e-6568bf4989ae'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/** دالة تغليف: تستدعي Edge Function للـ Admin API */
export async function callAdminAPI(action, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
