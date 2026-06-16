import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const [
      { data: allBrands },
      { data: opportunities },
      { data: aCarePlans },
      { data: brandChannels },
      { data: govRecords },
    ] = await Promise.all([
      supabase.from("brands").select("id, name, status, industry, city"),
      supabase.from("opportunities").select("stage, est_annual_value, probability"),
      supabase
        .from("care_plans")
        .select("id, tier, last_contact_date, brands(name)")
        .eq("tier", "A")
        .order("last_contact_date", { ascending: true })
        .limit(5),
      supabase.from("brand_channels").select("brand_id, channel"),
      supabase.from("gov_records").select("brand_id"),
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

    // 資料完整度
    const govBrandIds = new Set((govRecords || []).map((r: any) => r.brand_id as string));
    const lineIds = new Set((brandChannels || []).filter((c: any) => c.channel === "line").map((c: any) => c.brand_id as string));
    const emailIds = new Set((brandChannels || []).filter((c: any) => c.channel === "email").map((c: any) => c.brand_id as string));
    const completeness = [
      { label: "統編比對率", pct: totalLeads ? Math.round((govBrandIds.size / totalLeads) * 100) : 0, color: "#8FAAA4" },
      { label: "LINE 覆蓋率", pct: totalLeads ? Math.round((lineIds.size / totalLeads) * 100) : 0, color: "#D9B68C" },
      { label: "Email 覆蓋率", pct: totalLeads ? Math.round((emailIds.size / totalLeads) * 100) : 0, color: "#B5CAC5" },
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

    // 地圖 pins
    const pins = (allBrands || [])
      .filter((b: any) => b.city && b.industry)
      .map((b: any) => ({ brand: b.name as string, industry: b.industry as string, city: b.city as string }));

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
