import { createClient } from "@supabase/supabase-js";

// 伺服器端用的 Service Role 客戶端（用於 API Routes）
export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase 環境變數未設定");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
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
