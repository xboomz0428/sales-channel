import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ApiType = "places_search" | "places_detail" | "cse";

// 改為 await，確保 serverless 環境下寫入完成
export async function logApiUsage(
  apiType: ApiType,
  callCount = 1,
  brandName?: string,
  brandId?: string
) {
  try {
    const supabase = getSupabaseServerClient();
    await supabase
      .from("api_usage_log")
      .insert({ api_type: apiType, call_count: callCount, brand_name: brandName ?? null, brand_id: brandId ?? null });
  } catch {
    // 用量記錄失敗不阻塞主流程
  }
}
