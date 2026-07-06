import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

// 伺服器端客戶端（用於 API Routes）
// 優先用 Service Role Key（繞過 RLS，供已用登入把關的後端使用）；未設定時退回 anon key。
// 導入登入 + 收斂 RLS 後，正式環境務必設定 SUPABASE_SERVICE_ROLE_KEY，否則 anon 會被 RLS 擋下。
export function getSupabaseServerClient() {
  const supabaseUrl =
    cleanEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    cleanEnv("SUPABASE_URL");
  const key =
    cleanEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    cleanEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    cleanEnv("SUPABASE_ANON_KEY");

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
