import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/outreach
 * 新增聯繫紀錄
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 驗證必填欄位
    if (!body.brand_id || !body.channel || !body.summary) {
      return NextResponse.json(
        { success: false, error: "品牌 ID、聯繫管道、備註為必填" },
        { status: 400 }
      );
    }

    // 新增邏輯（實際應連接 Supabase）
    const newOutreach = {
      id: Math.random().toString(36).substr(2, 9),
      ...body,
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: newOutreach,
      message: "聯繫紀錄新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
