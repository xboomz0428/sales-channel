import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

// 伺服器端客戶端（用於 API Routes）
// 優先用 Service Role Key（繞過 RLS）；未設定時退回 anon key
// （開發期 RLS 政策允許 anon 讀寫，導入 Auth 後務必補上 Service Role Key）
export function getSupabaseServerClient() {
  const supabaseUrl =
    cleanEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    cleanEnv("SUPABASE_URL");
  const key =
    cleanEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    cleanEnv("SUPABASE_ANON_KEY") ||
    cleanEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !key) {
    throw new Error("Supabase 環境變數未設定");
  }

  return createClient(supabaseUrl, key);
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
