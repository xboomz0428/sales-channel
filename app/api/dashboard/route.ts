import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/dashboard
 * 儀表板統計數據
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();

    // 並行查詢所有統計數據
    const [
      { data: allBrands },
      { data: opportunities },
      { data: careCustomers },
    ] = await Promise.all([
      supabase.from("brands").select("id, status, priority_score"),
      supabase.from("opportunities").select("stage, est_annual_value, probability"),
      supabase.from("care_plans").select("tier, last_contact_date"),
    ]);

    // 計算統計
    const stats = {
      total_leads: allBrands?.length || 0,
      by_status: {
        new: allBrands?.filter((b: any) => b.status === "new").length || 0,
        contacted: allBrands?.filter((b: any) => b.status === "contacted").length || 0,
        sampling: allBrands?.filter((b: any) => b.status === "sampling").length || 0,
        quoting: allBrands?.filter((b: any) => b.status === "quoting").length || 0,
        negotiating: allBrands?.filter((b: any) => b.status === "negotiating").length || 0,
        won: allBrands?.filter((b: any) => b.status === "won").length || 0,
      },
      total_opportunities: opportunities?.length || 0,
      total_value: opportunities?.reduce(
        (sum: number, o: any) => sum + ((o.est_annual_value || 0) * (o.probability || 0) / 100),
        0
      ) || 0,
      win_rate: ((allBrands?.filter((b: any) => b.status === "won").length || 0) / (allBrands?.length || 1) * 100).toFixed(1),
    };

    // 漏斗圖數據
    const funnelData = [
      { stage: "新名單", count: stats.by_status.new },
      { stage: "已聯繫", count: stats.by_status.contacted },
      { stage: "打樣中", count: stats.by_status.sampling },
      { stage: "報價中", count: stats.by_status.quoting },
      { stage: "議約中", count: stats.by_status.negotiating },
      { stage: "成交", count: stats.by_status.won },
    ];

    return NextResponse.json({
      success: true,
      data: {
        stats,
        funnel: funnelData,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}
