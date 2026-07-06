import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

// 伺服器端客戶端（用於 API Routes）
// 預設用 anon key（RLS 目前全開，anon 可讀寫，最穩）。
// 只有「明確設定 USE_SERVICE_ROLE=1 且 service key 存在」時才改用 service_role——
// 這樣即使 Vercel 誤設了錯的 SUPABASE_SERVICE_ROLE_KEY 也不會悄悄把讀取全擋掉。
// 未來要收斂 RLS：先設好正確的 service key，再設 USE_SERVICE_ROLE=1，最後才套用 RLS 鎖定 migration。
export function getSupabaseServerClient() {
  const supabaseUrl =
    cleanEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    cleanEnv("SUPABASE_URL");
  const anonKey =
    cleanEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    cleanEnv("SUPABASE_ANON_KEY");
  const serviceKey = cleanEnv("SUPABASE_SERVICE_ROLE_KEY");
  const preferService = cleanEnv("USE_SERVICE_ROLE") === "1";

  const key = (preferService && serviceKey) ? serviceKey : (anonKey || serviceKey);

  if (!supabaseUrl || !key) {
    throw new Error("Supabase 環境變數未設定");
  }

  // 後端不需要保存/更新使用者 session（避免多請求共用單例時互相污染）
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// 型別定義
export type Brand = {
  id: string;
  name: string;
  industry: string;
  store_count: number;
  status: string;
  tax_id?: string;
  owner_name?: string;
  priority_score?: number;
  created_at: string;
};

export type Contact = {
  id: string;
  brand_id: string;
  name: string;
  title?: string;
  mobile?: string;
  email?: string;
  line_id?: string;
  created_at: string;
};

export type Opportunity = {
  id: string;
  brand_id: string;
  product_line?: string;
  stage: string;
  est_annual_value?: number;
  probability?: number;
  created_at: string;
};

export type OutreachLog = {
  id: string;
  brand_id: string;
  channel: string;
  summary: string;
  created_at: string;
};
