import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/contacts
 * 新增聯絡窗口
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 驗證必填欄位
    if (!body.brand_id || !body.name) {
      return NextResponse.json(
        { success: false, error: "品牌 ID 和姓名為必填" },
        { status: 400 }
      );
    }

    // 新增邏輯（實際應連接 Supabase）
    const newContact = {
      id: Math.random().toString(36).substr(2, 9),
      ...body,
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: newContact,
      message: "聯絡窗口新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
