import { getSupabaseServerClient } from "@/lib/supabase-server";

const DEFAULT_COLORS = ["#8FAAA4", "#5E8880", "#A66A4F", "#5B7C99", "#B8860B", "#7A4FB0", "#C0392B", "#4A6B50", "#D97706", "#06808A"];

/**
 * 若該分類名稱尚未存在於 product_categories，自動建立一筆（給定預設顏色）。
 * 讓使用者在產品表單直接輸入新分類時，也會出現在分類管理列、可改色。
 */
export async function ensureCategory(name: string | null | undefined): Promise<void> {
  const n = (name || "").trim();
  if (!n) return;
  const supabase = getSupabaseServerClient();
  const { data: exist } = await supabase.from("product_categories").select("id").eq("name", n).maybeSingle();
  if (exist) return;
  const { count } = await supabase.from("product_categories").select("id", { count: "exact", head: true });
  const color = DEFAULT_COLORS[(count || 0) % DEFAULT_COLORS.length];
  await supabase.from("product_categories").insert({ name: n, color, sort_order: count || 0 });
}
