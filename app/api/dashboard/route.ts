import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// 快取有效期（毫秒）。讀取時若快取較新就直接回，過期才重算並存回。
const CACHE_TTL_MS = 3 * 60 * 1000;

interface Metrics {
  total_leads: number;
  by_status: Record<string, number>;
  industries: { label: string; n: number }[];
  tax_count: number;
  channel_counts: Record<string, number>;
  line_brands: number;
  opp_total: number;
  won_value: number;
  weighted_value: number;
  pipeline: { stage: string; n: number; value: number; weighted: number }[];
}

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>;

// 取得統計：優先讀 dashboard_cache（未過期就用），否則呼叫 DB 聚合函式並存回。
async function getMetrics(supabase: SupabaseClient, force: boolean): Promise<{ metrics: Metrics; computedAt: string }> {
  if (!force) {
    const { data: cached } = await supabase
      .from("dashboard_cache").select("metrics, computed_at").eq("id", 1).maybeSingle();
    if (cached?.metrics && cached.computed_at) {
      const age = Date.now() - new Date(cached.computed_at).getTime();
      if (age < CACHE_TTL_MS) return { metrics: cached.metrics as Metrics, computedAt: cached.computed_at };
    }
  }
  // 重算（全部在 DB 聚合，毫秒級）
  const { data: fresh, error } = await supabase.rpc("dashboard_metrics");
  if (error || !fresh) throw new Error(error?.message || "聚合失敗");
  const computedAt = new Date().toISOString();
  await supabase.from("dashboard_cache").upsert({ id: 1, metrics: fresh, computed_at: computedAt });
  return { metrics: fresh as Metrics, computedAt };
}

const STAGE_LABELS: Record<string, string> = {
  new: "新名單", contacted: "已聯繫", sampling: "打樣中", quoting: "報價中", negotiating: "議約中",
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const force = request.nextUrl.searchParams.get("fresh") === "1";

    // 快取統計 + 即時查「被冷落的 A 級客戶」（小查詢，always live）
    const [{ metrics, computedAt }, { data: aCarePlans }] = await Promise.all([
      getMetrics(supabase, force),
      supabase
        .from("care_plans")
        .select("id, tier, last_contact_date, brands(name)")
        .eq("tier", "A")
        .order("last_contact_date", { ascending: true })
        .limit(5),
    ]);

    const total = metrics.total_leads || 0;
    const STATUS_KEYS = ["new", "contacted", "sampling", "quoting", "negotiating", "won", "lost"];
    const by_status: Record<string, number> = {};
    for (const k of STATUS_KEYS) by_status[k] = metrics.by_status?.[k] || 0;

    // 資料完整度（各管道涵蓋率）
    const ch = metrics.channel_counts || {};
    const mkItem = (label: string, count: number, color: string) => ({
      label, pct: total ? Math.round((count / total) * 100) : 0, count, total, color,
    });
    const completeness = [
      mkItem("工商登記", metrics.tax_count || 0, "#8FAAA4"),
      mkItem("電話", ch.phone || 0, "#5E8880"),
      mkItem("LINE", metrics.line_brands || 0, "#06C755"),
      mkItem("FB", ch.fb || 0, "#1877F2"),
      mkItem("IG", ch.ig || 0, "#C13584"),
      mkItem("Email", ch.email || 0, "#D9B68C"),
      mkItem("官網", ch.website || 0, "#5B7C99"),
      mkItem("地圖", ch.map || 0, "#D97706"),
    ];
    const missingLine = total - (metrics.line_brands || 0);

    // 被冷落 A 級客戶
    const now = Date.now();
    const neglected = (aCarePlans || []).map((cp: Record<string, unknown>) => ({
      brand: (cp.brands as { name?: string } | null)?.name || "未知",
      tier: (cp.tier as string) || "A",
      days: cp.last_contact_date
        ? Math.floor((now - new Date(cp.last_contact_date as string).getTime()) / 86400000)
        : null,
    }));

    // 商機管線
    const pipeline = ["new", "contacted", "sampling", "quoting", "negotiating"]
      .map((s) => {
        const p = (metrics.pipeline || []).find((x) => x.stage === s);
        return p ? { stage: STAGE_LABELS[s] || s, stageKey: s, n: p.n, value: p.value, weighted: p.weighted } : null;
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      computedAt,
      data: {
        stats: {
          total_leads: total,
          by_status,
          active: total - by_status.won - by_status.lost,
          won_value: metrics.won_value || 0,
          total_opportunities: metrics.opp_total || 0,
          weighted_value: metrics.weighted_value || 0,
          win_rate: ((by_status.won / (total || 1)) * 100).toFixed(1),
        },
        funnel: [
          { stage: "新名單", count: by_status.new },
          { stage: "已聯繫", count: by_status.contacted },
          { stage: "打樣中", count: by_status.sampling },
          { stage: "報價中", count: by_status.quoting },
          { stage: "議約中", count: by_status.negotiating },
          { stage: "成交", count: by_status.won },
        ],
        industries: metrics.industries || [],
        completeness,
        missingLine,
        neglected,
        pipeline,
        pins: [],
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}
