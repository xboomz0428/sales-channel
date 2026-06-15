import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ApiType = "places_search" | "places_detail" | "cse";

// 火力不管錯誤，不阻塞主流程
export function logApiUsage(
  apiType: ApiType,
  callCount = 1,
  brandName?: string,
  brandId?: string
) {
  const supabase = getSupabaseServerClient();
  void supabase
    .from("api_usage_log")
    .insert({ api_type: apiType, call_count: callCount, brand_name: brandName ?? null, brand_id: brandId ?? null });
}
