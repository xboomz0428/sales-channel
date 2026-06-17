import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const [
      { data: allBrands },
      { data: opportunities },
      { data: aCarePlans },
    ] = await Promise.all([
      supabase.from("brands").select("id, name, status, industry, tax_id, registered_name, brand_channels(channel)"),
      supabase.from("opportunities").select("stage, est_annual_value, probability"),
      supabase
        .from("care_plans")
        .select("id, tier, last_contact_date, brands(name)")
        .eq("tier", "A")
        .order("last_contact_date", { ascending: true })
        .limit(5),
    ]);

    const totalLeads = allBrands?.length || 0;

    const by_status: Record<string, number> = {
      new: 0, contacted: 0, sampling: 0, quoting: 0, negotiating: 0, won: 0, lost: 0,
    };
    const industryMap: Record<string, number> = {};
    for (const b of (allBrands || []) as any[]) {
      const s = b.status as string || "new";
      if (s in by_status) by_status[s]++;
      const ind = (b.industry as string) || "其他";
      industryMap[ind] = (industryMap[ind] || 0) + 1;
    }

    // 資料完整度 — 從 nested brand_channels 計算，避免 Supabase 1000 筆限制
    const taxIdBrands = (allBrands || []).filter((b: any) => b.tax_id || (b as any).registered_name).length;
    const countByChannel = (ch: string) => (allBrands || []).filter((b: any) =>
      ((b.brand_channels || []) as { channel: string }[]).some((c) => c.channel === ch)
    ).length;
    const lineCount = (allBrands || []).filter((b: any) =>
      ((b.brand_channels || []) as { channel: string }[]).some((c) => c.channel === "line" || c.channel === "line_id")
    ).length;
    const phoneIds = { size: countByChannel("phone") };
    const emailIds = { size: countByChannel("email") };
    const fbIds = { size: countByChannel("fb") };
    const igIds = { size: countByChannel("ig") };
    const webIds = { size: countByChannel("website") };
    const mapIds = { size: countByChannel("map") };
    const lineIds = { size: lineCount };
    const mkItem = (label: string, count: number, color: string) => ({
      label, pct: totalLeads ? Math.round((count / totalLeads) * 100) : 0, count, total: totalLeads, color,
    });
    const completeness = [
      mkItem("工商登記", taxIdBrands, "#8FAAA4"),
      mkItem("電話", phoneIds.size, "#5E8880"),
      mkItem("LINE", lineIds.size, "#06C755"),
      mkItem("FB", fbIds.size, "#1877F2"),
      mkItem("IG", igIds.size, "#C13584"),
      mkItem("Email", emailIds.size, "#D9B68C"),
      mkItem("官網", webIds.size, "#5B7C99"),
      mkItem("地圖", mapIds.size, "#D97706"),
    ];
    const missingLine = totalLeads - lineIds.size;

    // 被冷落的 A 級客戶
    const now = Date.now();
    const neglected = (aCarePlans || []).map((cp: any) => ({
      brand: (cp.brands as any)?.name || "未知",
      tier: cp.tier as string || "A",
      days: cp.last_contact_date
        ? Math.floor((now - new Date(cp.last_contact_date as string).getTime()) / 86400000)
        : null,
    }));

    // 商機管線
    const STAGE_LABELS: Record<string, string> = {
      new: "新名單", contacted: "已聯繫", sampling: "打樣中",
      quoting: "報價中", negotiating: "議約中",
    };
    const pipelineMap: Record<string, { n: number; value: number; weighted: number }> = {};
    let totalWeighted = 0;
    for (const o of (opportunities || []) as any[]) {
      const s = o.stage as string;
      if (!s || s === "won" || s === "lost") continue;
      if (!pipelineMap[s]) pipelineMap[s] = { n: 0, value: 0, weighted: 0 };
      pipelineMap[s].n++;
      pipelineMap[s].value += (o.est_annual_value as number) || 0;
      const w = ((o.est_annual_value as number) || 0) * ((o.probability as number) || 0) / 100;
      pipelineMap[s].weighted += w;
      totalWeighted += w;
    }
    const pipeline = ["new", "contacted", "sampling", "quoting", "negotiating"]
      .filter((s) => pipelineMap[s])
      .map((s) => ({
        stage: STAGE_LABELS[s],
        stageKey: s,
        n: pipelineMap[s].n,
        value: pipelineMap[s].value,
        weighted: pipelineMap[s].weighted,
      }));

    // 地圖 pins（品牌表無 city 欄位，從 stores 取）
    const pins: { brand: string; industry: string; city: string }[] = [];

    // 產業分佈
    const industries = Object.entries(industryMap)
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n);

    const wonValue = (opportunities || []).filter((o: any) => o.stage === "won")
      .reduce((s: number, o: any) => s + ((o.est_annual_value as number) || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          total_leads: totalLeads,
          by_status,
          active: totalLeads - by_status.won - by_status.lost,
          won_value: wonValue,
          total_opportunities: opportunities?.length || 0,
          weighted_value: totalWeighted,
          win_rate: ((by_status.won / (totalLeads || 1)) * 100).toFixed(1),
        },
        funnel: [
          { stage: "新名單", count: by_status.new },
          { stage: "已聯繫", count: by_status.contacted },
          { stage: "打樣中", count: by_status.sampling },
          { stage: "報價中", count: by_status.quoting },
          { stage: "議約中", count: by_status.negotiating },
          { stage: "成交", count: by_status.won },
        ],
        industries,
        completeness,
        missingLine,
        neglected,
        pipeline,
        pins,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}
