import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET    /api/product-categories          分類清單（含每類產品數）
 * POST   /api/product-categories          新增分類 { name, color }
 * PATCH  /api/product-categories          更新分類 { id, name?, color?, sort_order? }
 *                                          或批次排序 { order: [{id, sort_order}] }
 * DELETE /api/product-categories?id=...    刪除分類（產品改為未分類）
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const [{ data: cats }, { data: products }] = await Promise.all([
      supabase.from("product_categories").select("*").order("sort_order").order("created_at"),
      supabase.from("products").select("category"),
    ]);
    const counts: Record<string, number> = {};
    for (const p of products || []) {
      const c = (p.category as string) || "";
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    const data = (cats || []).map((c) => ({ ...c, count: counts[c.name] || 0 }));
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ success: false, error: "分類名稱為必填" }, { status: 400 });

    const { count } = await supabase.from("product_categories").select("id", { count: "exact", head: true });
    const { data, error } = await supabase
      .from("product_categories")
      .insert([{ name, color: body.color || "#8FAAA4", sort_order: count || 0 }])
      .select()
      .single();
    if (error) {
      const msg = error.code === "23505" ? "分類名稱已存在" : error.message;
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "新增失敗" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();

    // 批次排序
    if (Array.isArray(body.order)) {
      for (const o of body.order) {
        await supabase.from("product_categories").update({ sort_order: o.sort_order }).eq("id", o.id);
      }
      return NextResponse.json({ success: true });
    }

    const { id } = body;
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });

    // 改名時連動更新 products.category
    if (body.name !== undefined) {
      const { data: old } = await supabase.from("product_categories").select("name").eq("id", id).single();
      const newName = String(body.name).trim();
      if (old && old.name !== newName) {
        await supabase.from("products").update({ category: newName }).eq("category", old.name);
      }
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.color !== undefined) patch.color = body.color;
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);

    const { data, error } = await supabase.from("product_categories").update(patch).eq("id", id).select().single();
    if (error) {
      const msg = error.code === "23505" ? "分類名稱已存在" : error.message;
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });

    // 把該分類的產品改為未分類，再刪分類
    const { data: cat } = await supabase.from("product_categories").select("name").eq("id", id).single();
    if (cat) await supabase.from("products").update({ category: null }).eq("category", cat.name);

    const { error } = await supabase.from("product_categories").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
