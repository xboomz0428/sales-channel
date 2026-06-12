import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/dashboard/funnel
 * 漏斗圖資料
 */
export async function GET(request: NextRequest) {
  const funnelData = [
    { stage: "新名單", count: 1250 },
    { stage: "已聯繫", count: 890 },
    { stage: "打樣中", count: 450 },
    { stage: "報價中", count: 280 },
    { stage: "議約中", count: 120 },
    { stage: "成交", count: 45 },
  ];

  const stats = {
    total_leads: 1250,
    total_brands: 425,
    pending_followup: 156,
    total_revenue: "NT$2.4M",
    conversion_rate: ((45 / 1250) * 100).toFixed(2),
  };

  return NextResponse.json({
    success: true,
    data: {
      funnel: funnelData,
      stats,
    },
  });
}
