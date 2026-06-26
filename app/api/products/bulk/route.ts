import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ensureCategory } from "@/lib/ensureCategory";

/**
 * PATCH /api/products/bulk
 *   { ids: string[], category: string | null }   批次設定分類（null = 未分類）
 *   { ids: string[], is_active: boolean }         批次啟用/停用
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) return NextResponse.json({ success: false, error: "未選取任何產品" }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.category !== undefined) {
      patch.category = body.category || null;
      if (body.category) await ensureCategory(String(body.category));
    }
    if (body.is_active !== undefined) patch.is_active = !!body.is_active;

    const { error, count } = await supabase
      .from("products")
      .update(patch, { count: "exact" })
      .in("id", ids);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: count ?? ids.length });
  } catch {
    return NextResponse.json({ success: false, error: "批次更新失敗" }, { status: 500 });
  }
}
