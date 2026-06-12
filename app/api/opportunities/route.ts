import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/opportunities
 * 查詢商機列表
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const searchParams = request.nextUrl.searchParams;
    const stage = searchParams.get("stage");
    const brand_id = searchParams.get("brand_id");

    let query = supabase
      .from("opportunities")
      .select(
        "*, brands(name, industry)"
      );

    if (stage) {
      query = query.eq("stage", stage);
    }
    if (brand_id) {
      query = query.eq("brand_id", brand_id);
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
 * POST /api/opportunities
 * 新增商機
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    // 驗證必填欄位
    if (!body.brand_id) {
      return NextResponse.json(
        { success: false, error: "品牌 ID 為必填" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("opportunities")
      .insert([
        {
          brand_id: body.brand_id,
          product_line: body.product_line,
          stage: body.stage || "new",
          est_annual_value: body.est_annual_value,
          probability: body.probability,
          expected_close: body.expected_close,
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
      message: "商機新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
