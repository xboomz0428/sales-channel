import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET  /api/products       產品列表
 * POST /api/products       新增產品
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const includeInactive = request.nextUrl.searchParams.get("all") === "true";

    let query = supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query.limit(100000);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [], count: data?.length || 0 });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ success: false, error: "產品名稱為必填" }, { status: 400 });
    }

    const insert = {
      name: body.name,
      sku: body.sku || null,
      category: body.category || null,
      spec: body.spec || null,
      unit: body.unit || "組",
      list_price: Number(body.list_price) || 0,
      channel_price: Number(body.channel_price) || 0,
      cost_price: Number(body.cost_price) || 0,
      min_order: Number(body.min_order) || 1,
      lead_days: Number(body.lead_days) || 7,
      description: body.description || null,
      image_url: body.image_url || null,
      sort_order: Number(body.sort_order) || 0,
    };

    const { data, error } = await supabase.from("products").insert([insert]).select().single();
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "新增失敗" }, { status: 500 });
  }
}
