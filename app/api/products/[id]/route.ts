import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * PATCH  /api/products/:id          更新產品
 * DELETE /api/products/:id          永久刪除（若被報價單引用則擋下，請改用停用）
 * DELETE /api/products/:id?soft=1   軟刪除（停用）
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of [
      "name", "sku", "category", "spec", "unit", "description", "image_url", "is_active",
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    for (const key of ["list_price", "channel_price", "cost_price", "min_order", "lead_days", "sort_order"]) {
      if (body[key] !== undefined) patch[key] = Number(body[key]) || 0;
    }

    const { data, error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;

    // ?soft=1 → 僅停用（保留資料與歷史報價連結）
    if (request.nextUrl.searchParams.get("soft") === "1") {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    // 永久刪除：歷史報價的 quote_items.product_id 為 ON DELETE SET NULL，
    // 明細已保留產品名稱/單價/數量快照，刪除產品不會破壞歷史報價。
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, deleted: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
