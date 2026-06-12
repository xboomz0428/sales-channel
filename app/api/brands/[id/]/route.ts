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
