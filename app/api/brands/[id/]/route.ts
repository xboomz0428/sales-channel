import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/brands/:id
 * 取得品牌詳情（含聯絡窗口、聯繫紀錄、聯絡管道）
 */
export async function GET(
  request: NextRequest,
  { params }: any
) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;

    // 並行查詢品牌資料和相關資訊
    const [
      { data: brand, error: brandError },
      { data: contacts },
      { data: outreach },
      { data: channels },
    ] = await Promise.all([
      supabase.from("brands").select("*").eq("id", id).single(),
      supabase.from("contacts").select("*").eq("brand_id", id),
      supabase
        .from("outreach_logs")
        .select("*")
        .eq("brand_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("brand_channels").select("*").eq("brand_id", id),
    ]);

    if (brandError) {
      return NextResponse.json(
        { success: false, error: "品牌不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        brand,
        contacts: contacts || [],
        outreach: outreach || [],
        channels: channels || [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/brands/:id
 * 更新品牌（如開發狀態）
 */
export async function PATCH(request: NextRequest, { params }: any) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json();

    const allowed: Record<string, unknown> = {};
    for (const key of ["status", "name", "industry", "store_count", "priority_score", "owner_name", "tax_id"]) {
      if (body[key] !== undefined) allowed[key] = body[key];
    }

    const { data, error } = await supabase
      .from("brands")
      .update(allowed)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "更新失敗" },
      { status: 500 }
    );
  }
}
