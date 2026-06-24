import { getSupabaseServerClient } from "@/lib/supabase-server";

// 統一使用與所有其他 API 完全相同的 Supabase client
// （不再自建 client，避免金鑰讀取順序不一致導致正式環境失敗）
export const supabaseAdmin = getSupabaseServerClient();
