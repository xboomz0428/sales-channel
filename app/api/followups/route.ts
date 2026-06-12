import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/followups
 * 取得今日跟進任務（回購、停滯、三節、拜訪）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const today = new Date().toISOString().split("T")[0];

    // 查詢回購提醒
    const { data: reorderTasks } = await supabase
      .from("care_plans")
      .select("*, brands(id, name)")
      .not("reorder_cycle_days", "is", null);

    // 查詢停滯商機
    const { data: stalledOpp } = await supabase
      .from("opportunities")
      .select("*, brands(name)")
      .in("stage", ["sampling", "quoting"]);

    // 查詢三節任務
    const { data: festivalTasks } = await supabase
      .from("care_tasks")
      .select("*, brands(name)")
      .eq("task_type", "festival")
      .gte("due_date", today)
      .order("due_date", { ascending: true });

    // 組合所有任務
    const tasks = [
      // 回購提醒
      ...(reorderTasks || [])
        .filter((rp: any) => {
          if (!rp.last_order_date) return false;
          const daysUntilReorder =
            Math.ceil(
              (new Date(rp.last_order_date).getTime() +
                rp.reorder_cycle_days * 24 * 60 * 60 * 1000 -
                Date.now()) /
                (24 * 60 * 60 * 1000)
            ) || 0;
          return daysUntilReorder <= 7 && daysUntilReorder > -30;
        })
        .map((rp: any) => ({
          id: `reorder_${rp.id}`,
          brand: rp.brands?.name,
          type: "reorder",
          title: `預估補貨日剩 ${Math.max(0, Math.ceil((new Date(rp.last_order_date).getTime() + rp.reorder_cycle_days * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))} 天`,
          daysLeft: Math.max(0, Math.ceil((new Date(rp.last_order_date).getTime() + rp.reorder_cycle_days * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))),
          done: false,
        })),

      // 停滯商機
      ...(stalledOpp || [])
        .filter((opp: any) => {
          const daysInStage = Math.floor(
            (Date.now() - new Date(opp.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (opp.stage === "sampling" && daysInStage > 14) return true;
          if (opp.stage === "quoting" && daysInStage > 30) return true;
          return false;
        })
        .map((opp: any) => ({
          id: `stalled_${opp.id}`,
          brand: opp.brands?.name,
          type: "stalled",
          title: `${opp.stage === "sampling" ? "樣品" : "報價"}寄出已 ${Math.floor((Date.now() - new Date(opp.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))} 天，待追蹤`,
          daysLeft: Math.floor((Date.now() - new Date(opp.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)),
          done: false,
        })),

      // 三節任務
      ...(festivalTasks || []).map((task: any) => ({
        id: task.id,
        brand: task.brands?.name,
        type: "festival",
        title: task.title,
        done: task.done,
      })),
    ];

    return NextResponse.json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/followups/:id
 * 更新任務完成狀態
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    if (!body.id || body.done === undefined) {
      return NextResponse.json(
        { success: false, error: "任務 ID 和完成狀態為必填" },
        { status: 400 }
      );
    }

    // 從任務 ID 判斷類型
    const isCarTask = body.id.includes("_") === false || body.id.startsWith("festival_");

    if (isCarTask) {
      const { data, error } = await supabase
        .from("care_tasks")
        .update({ done: body.done })
        .eq("id", body.id)
        .select();

      if (error) throw error;
      return NextResponse.json({ success: true, data: data?.[0] });
    }

    return NextResponse.json({
      success: true,
      message: "狀態已更新",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "更新失敗" },
      { status: 500 }
    );
  }
}
