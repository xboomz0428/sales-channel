import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServerClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [todayRes, monthRes, settingsRes] = await Promise.all([
    supabase
      .from("api_usage_log")
      .select("api_type, call_count")
      .gte("created_at", todayStart),
    supabase
      .from("api_usage_log")
      .select("api_type, call_count")
      .gte("created_at", monthStart),
    supabase.from("api_alert_settings").select("*").eq("id", 1).single(),
  ]);

  function tally(rows: { api_type: string; call_count: number }[] | null) {
    const out: Record<string, number> = { places_search: 0, places_detail: 0, cse: 0 };
    for (const r of rows ?? []) out[r.api_type] = (out[r.api_type] ?? 0) + r.call_count;
    return out;
  }

  const today = tally(todayRes.data);
  const month = tally(monthRes.data);
  const settings = settingsRes.data ?? {
    places_search_daily_limit: 100,
    places_search_monthly_limit: 1000,
    places_detail_daily_limit: 200,
    places_detail_monthly_limit: 2000,
    cse_daily_limit: 50,
    cse_monthly_limit: 500,
    alert_enabled: true,
  };

  // 最近 30 天趨勢（每天合計）
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const { data: trendRows } = await supabase
    .from("api_usage_log")
    .select("created_at, api_type, call_count")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  const trendMap: Record<string, Record<string, number>> = {};
  for (const r of trendRows ?? []) {
    const day = r.created_at.slice(0, 10);
    if (!trendMap[day]) trendMap[day] = { places_search: 0, places_detail: 0, cse: 0 };
    trendMap[day][r.api_type] = (trendMap[day][r.api_type] ?? 0) + r.call_count;
  }
  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return NextResponse.json({ success: true, data: { today, month, settings, trend } });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "參數錯誤" }, { status: 400 });
  }

  const allowed = [
    "places_search_daily_limit", "places_search_monthly_limit",
    "places_detail_daily_limit", "places_detail_monthly_limit",
    "cse_daily_limit", "cse_monthly_limit", "alert_enabled",
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) patch[k] = body[k];

  const { error } = await supabase
    .from("api_alert_settings")
    .upsert({ id: 1, ...patch });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
