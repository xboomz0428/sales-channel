import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/outreach?brand_id=xxx
 * 查詢聯繫紀錄
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const brand_id = request.nextUrl.searchParams.get("brand_id");

    if (!brand_id) {
      return NextResponse.json(
        { success: false, error: "品牌 ID 為必填" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("outreach_logs")
      .select("*")
      .eq("brand_id", brand_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/outreach
 * 新增聯繫紀錄
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    // 驗證必填欄位
    if (!body.brand_id || !body.channel || !body.summary) {
      return NextResponse.json(
        { success: false, error: "品牌 ID、聯繫管道、備註為必填" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("outreach_logs")
      .insert([
        {
          brand_id: body.brand_id,
          contact_id: body.contact_id,
          log_type: body.log_type || "develop",
          channel: body.channel,
          summary: body.summary,
          next_action: body.next_action,
          next_action_date: body.next_action_date,
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
      message: "聯繫紀錄新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
