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

    const channelSelect = "brand_channels(channel, value)";

    // 查詢回購提醒
    const { data: reorderTasks } = await supabase
      .from("care_plans")
      .select(`*, brands(id, name, ${channelSelect})`)
      .not("reorder_cycle_days", "is", null);

    // 查詢停滯商機
    const { data: stalledOpp } = await supabase
      .from("opportunities")
      .select(`*, brands(name, ${channelSelect})`)
      .in("stage", ["sampling", "quoting"]);

    // 查詢三節任務
    const { data: festivalTasks } = await supabase
      .from("care_tasks")
      .select(`*, brands(name, ${channelSelect})`)
      .eq("task_type", "festival")
      .gte("due_date", today)
      .order("due_date", { ascending: true });

    // 查詢拜訪到期（care_plans.last_contact_date + visit_cycle_days <= today）
    const { data: visitPlans } = await supabase
      .from("care_plans")
      .select(`*, brands(id, name, ${channelSelect})`)
      .not("visit_cycle_days", "is", null)
      .not("last_contact_date", "is", null);

    // 從 brand_channels 陣列轉成 { channel: value } map
    const toContacts = (brandChannels: { channel: string; value: string }[] | undefined) => {
      const map: Record<string, string> = {};
      (brandChannels || []).forEach(({ channel, value }) => { if (value) map[channel] = value; });
      return map;
    };

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
          contacts: toContacts(rp.brands?.brand_channels),
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
          contacts: toContacts(opp.brands?.brand_channels),
          done: false,
        })),

      // 三節任務
      ...(festivalTasks || []).map((task: any) => ({
        id: task.id,
        brand: task.brands?.name,
        type: "festival",
        title: task.title,
        contacts: toContacts(task.brands?.brand_channels),
        done: task.done,
      })),

      // 拜訪到期
      ...(visitPlans || [])
        .filter((plan: any) => {
          const next = new Date(plan.last_contact_date);
          next.setDate(next.getDate() + (plan.visit_cycle_days as number));
          return next <= new Date();
        })
        .map((plan: any) => {
          const daysSince = Math.floor(
            (Date.now() - new Date(plan.last_contact_date).getTime()) / 86400000
          );
          return {
            id: `visit_${plan.id}`,
            brand: plan.brands?.name,
            type: "visit",
            title: `${plan.tier || ""}級客戶拜訪到期`,
            desc: `上次聯繫 ${daysSince} 天前（週期 ${plan.visit_cycle_days} 天）`,
            contacts: toContacts(plan.brands?.brand_channels),
            done: false,
          };
        }),
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

    const id = body.id as string;
    const today = new Date().toISOString().split("T")[0];

    // festival_ 或無前綴 → care_tasks
    if (!id.includes("_") || id.startsWith("festival_")) {
      const realId = id.startsWith("festival_") ? id.slice("festival_".length) : id;
      const { data, error } = await supabase
        .from("care_tasks")
        .update({ done: body.done })
        .eq("id", realId)
        .select();
      if (error) throw error;
      return NextResponse.json({ success: true, data: data?.[0] });
    }

    // reorder_ → 更新 care_plans.last_order_date，重設補貨週期計時
    if (id.startsWith("reorder_")) {
      const planId = id.slice("reorder_".length);
      const { error } = await supabase
        .from("care_plans")
        .update({ last_order_date: today })
        .eq("id", planId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // stalled_ → 更新 opportunities.stage_entered_at，重設停滯計時
    if (id.startsWith("stalled_")) {
      const oppId = id.slice("stalled_".length);
      const { error } = await supabase
        .from("opportunities")
        .update({ stage_entered_at: new Date().toISOString() })
        .eq("id", oppId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // visit_ → 更新 care_plans.last_contact_date，重設拜訪週期計時
    if (id.startsWith("visit_")) {
      const planId = id.slice("visit_".length);
      const { error } = await supabase
        .from("care_plans")
        .update({ last_contact_date: today })
        .eq("id", planId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "更新失敗" },
      { status: 500 }
    );
  }
}
