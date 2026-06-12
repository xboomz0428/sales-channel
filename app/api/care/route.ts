import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/care
 * 取得成交客戶清單及健康度
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const tab = request.nextUrl.searchParams.get("tab") || "all";

    // 查詢成交客戶（已建立 care_plans 的）
    const { data: carePlans, error } = await supabase
      .from("care_plans")
      .select("*, brands(id, name, store_count)")
      .order("last_contact_date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 計算健康度
    const customersWithHealth = (carePlans || []).map((plan: any) => {
      const lastContactDays = plan.last_contact_date
        ? Math.floor(
            (Date.now() - new Date(plan.last_contact_date).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;

      let health = "green";
      if (plan.tier === "A" && lastContactDays > 30) health = "red";
      else if (plan.tier === "A" && lastContactDays > 20) health = "yellow";
      else if (plan.tier === "B" && lastContactDays > 90) health = "red";
      else if (plan.tier === "B" && lastContactDays > 60) health = "yellow";
      else if (plan.tier === "C" && lastContactDays > 180) health = "red";

      return {
        ...plan,
        last_contact_days: lastContactDays,
        health,
      };
    });

    // 篩選
    let filtered = customersWithHealth;
    if (tab === "neglected") {
      filtered = customersWithHealth.filter((c: any) => c.health !== "green");
    }

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/care
 * 新增或更新客情計畫
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    if (!body.brand_id) {
      return NextResponse.json(
        { success: false, error: "品牌 ID 為必填" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("care_plans")
      .upsert([
        {
          brand_id: body.brand_id,
          tier: body.tier,
          visit_cycle_days: body.visit_cycle_days,
          reorder_cycle_days: body.reorder_cycle_days,
          last_order_date: body.last_order_date,
          last_contact_date: body.last_contact_date,
          note: body.note,
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
      message: "客情計畫已更新",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "更新失敗" },
      { status: 500 }
    );
  }
}
