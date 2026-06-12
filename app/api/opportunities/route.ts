import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/opportunities
 * 查詢商機列表
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stage = searchParams.get("stage");

  // Mock 商機資料
  let opportunities = [
    {
      id: 1,
      brand_id: 1,
      brand: "6星集",
      product: "足浴套組",
      est_annual: 1800000,
      probability: 60,
      stage: "quoting",
      stage_days: 12,
    },
    {
      id: 2,
      brand_id: 2,
      brand: "悅禾莊園",
      product: "草本精油",
      est_annual: 2400000,
      probability: 40,
      stage: "sampling",
      stage_days: 18,
    },
  ];

  if (stage) {
    opportunities = opportunities.filter((o) => o.stage === stage);
  }

  return NextResponse.json({
    success: true,
    data: opportunities,
    count: opportunities.length,
  });
}

/**
 * POST /api/opportunities
 * 新增商機
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 驗證必填欄位
    if (!body.brand_id || !body.product) {
      return NextResponse.json(
        { success: false, error: "品牌 ID 和產品線為必填" },
        { status: 400 }
      );
    }

    const newOpportunity = {
      id: Math.random().toString(36).substr(2, 9),
      ...body,
      stage: body.stage || "new",
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: newOpportunity,
      message: "商機新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/opportunities/:id
 * 更新商機階段
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id || !body.stage) {
      return NextResponse.json(
        { success: false, error: "商機 ID 和階段為必填" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...body, updated_at: new Date().toISOString() },
      message: "商機階段已更新",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "更新失敗" },
      { status: 500 }
    );
  }
}
