import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/brands
 * 查詢品牌列表（支援篩選）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const searchParams = request.nextUrl.searchParams;

    const industry = searchParams.get("industry");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let query = supabase.from("brands").select("*, brand_channels(channel, value), stores(city)");

    // 篩選條件
    if (industry) {
      query = query.eq("industry", industry);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/brands
 * 新增品牌
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    // 驗證必填欄位
    if (!body.name || !body.industry) {
      return NextResponse.json(
        { success: false, error: "品牌名稱和產業為必填" },
        { status: 400 }
      );
    }

    // 新增到 Supabase
    const { data, error } = await supabase
      .from("brands")
      .insert([
        {
          name: body.name,
          industry: body.industry,
          registered_name: body.registered_name,
          tax_id: body.tax_id,
          owner_name: body.owner_name,
          store_count: body.store_count || 1,
          status: "new",
          priority_score: body.priority_score,
        },
      ])
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data?.[0],
      message: "品牌新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
