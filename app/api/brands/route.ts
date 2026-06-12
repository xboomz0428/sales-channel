import { NextRequest, NextResponse } from "next/server";

// Mock 品牌資料
const mockBrands = [
  {
    id: 1,
    name: "6星集足體養生會館",
    industry: "養生會館",
    stores: 9,
    cities: "北/中/南",
    channels: ["line", "fb", "ig", "email"],
    score: 92,
    status: "quoting",
    tax_id: "16830000",
    owner: "江○○",
  },
  {
    id: 2,
    name: "悅禾莊園SPA",
    industry: "養生會館",
    stores: 12,
    cities: "北/中/南",
    channels: ["line", "fb", "ig"],
    score: 89,
    status: "sampling",
  },
];

/**
 * GET /api/brands
 * 查詢品牌列表（支援篩選）
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const industry = searchParams.get("industry");
  const status = searchParams.get("status");
  const city = searchParams.get("city");

  let results = [...mockBrands];

  // 篩選
  if (industry) {
    results = results.filter((b) => b.industry === industry);
  }
  if (status) {
    results = results.filter((b) => b.status === status);
  }
  if (city) {
    results = results.filter((b) => b.cities.includes(city));
  }

  return NextResponse.json({
    success: true,
    data: results,
    count: results.length,
  });
}

/**
 * POST /api/brands
 * 新增品牌
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 驗證必填欄位
    if (!body.name || !body.industry) {
      return NextResponse.json(
        { success: false, error: "品牌名稱和產業為必填" },
        { status: 400 }
      );
    }

    // 新增邏輯（實際應連接 Supabase）
    const newBrand = {
      id: mockBrands.length + 1,
      ...body,
      status: "new",
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: newBrand,
      message: "品牌新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
