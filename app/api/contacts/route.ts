import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/contacts?brand_id=xxx
 * 查詢聯絡窗口
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
      .from("contacts")
      .select("*")
      .eq("brand_id", brand_id);

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
 * POST /api/contacts
 * 新增聯絡窗口
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    // 驗證必填欄位
    if (!body.brand_id || !body.name) {
      return NextResponse.json(
        { success: false, error: "品牌 ID 和姓名為必填" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert([
        {
          brand_id: body.brand_id,
          name: body.name,
          title: body.title,
          role: body.role,
          mobile: body.mobile,
          email: body.email,
          line_id: body.line_id,
          note: body.note,
          source: body.source,
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
      message: "聯絡窗口新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
