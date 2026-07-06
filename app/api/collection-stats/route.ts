import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const METHOD_LABEL: Record<string, string> = {
  cross_search: "交叉搜尋", search_engine: "免API搜尋", fb: "FB 粉專", email_guess: "Email 網域推測",
  website: "官網爬取", places: "Google Places", cse: "Google CSE",
};

/**
 * GET /api/collection-stats?industry=&country=
 * 採集方法級效率：各方法的嘗試/命中/命中率/平均耗時；可依產業聚焦。
 * 用於「自動成長」的可視化——看哪個方法對哪個產業最有效、哪些已被抑制。
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseServerClient();
    const url = new URL(req.url);
    const industry = url.searchParams.get("industry");
    const country = url.searchParams.get("country");
    let q = sb.from("collection_method_stats").select("*");
    if (industry) q = q.eq("industry", industry);
    if (country) q = q.eq("country", country);
    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    const rows = data || [];

    // 依方法彙總（跨產業）
    const byMethod = new Map<string, { attempts: number; hits: number; channels: number; ms: number }>();
    for (const r of rows) {
      const a = byMethod.get(r.method) || { attempts: 0, hits: 0, channels: 0, ms: 0 };
      a.attempts += r.attempts; a.hits += r.hits; a.channels += r.channels_found; a.ms += Number(r.ms_total);
      byMethod.set(r.method, a);
    }
    const methods = [...byMethod.entries()].map(([method, a]) => ({
      method, label: METHOD_LABEL[method] || method,
      attempts: a.attempts, hits: a.hits, channels: a.channels,
      hitRate: a.attempts ? Math.round((a.hits / a.attempts) * 1000) / 10 : 0,
      avgMs: a.attempts ? Math.round(a.ms / a.attempts) : 0,
    })).sort((x, y) => y.hitRate - x.hitRate);

    // 被自動抑制的 (產業×方法)：嘗試≥30 且命中率<2%
    const suppressed = rows
      .filter((r) => r.attempts >= 30 && r.hits / (r.attempts || 1) < 0.02 && ["cross_search", "search_engine", "fb", "email_guess"].includes(r.method))
      .map((r) => ({ industry: r.industry, method: METHOD_LABEL[r.method] || r.method, attempts: r.attempts, hits: r.hits }));

    return NextResponse.json({ success: true, methods, suppressed, rows: rows.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "查詢失敗" }, { status: 500 });
  }
}
