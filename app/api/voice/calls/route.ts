import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ingestCalls, OUTCOME_LABEL, STATUS_LABEL } from "@/lib/voice/ingest";

export const runtime = "nodejs";

/**
 * GET  /api/voice/calls        列出最近通話紀錄（含品牌名）
 * POST /api/voice/calls        寫入通話結果（單筆或陣列；平台 webhook 或 CSV 匯入皆可）
 *   body 單筆: { brand_id?, phone, brand_name?, campaign?, status?, outcome?, transcript?, recording_url?, duration_sec?, notes?, called_at? }
 *   或 { calls: [...] }
 *   寫入後：① 存 voice_calls ② 寫回 outreach_logs 聯繫紀錄 ③ 品牌 new→contacted
 *          ④ outcome=do_not_call → 電話加入拒撥名單(phone_dnc)
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("voice_calls")
      .select("id, brand_id, phone, brand_name, campaign, status, outcome, transcript, recording_url, duration_sec, notes, called_at, brands(name)")
      .order("called_at", { ascending: false })
      .limit(200);
    const rows = (data || []).map((c: any) => ({
      ...c,
      brand_name: c.brands?.name || c.brand_name || null,
      statusLabel: STATUS_LABEL[c.status] || c.status,
      outcomeLabel: c.outcome ? (OUTCOME_LABEL[c.outcome] || c.outcome) : null,
    }));
    // 統計
    const summary = {
      total: rows.length,
      answered: rows.filter((r: any) => r.status === "completed").length,
      interested: rows.filter((r: any) => r.outcome === "interested").length,
      dnc: rows.filter((r: any) => r.outcome === "do_not_call").length,
    };
    return NextResponse.json({ success: true, data: rows, summary });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "查詢失敗" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));
    const list = Array.isArray(body.calls) ? body.calls : (body.phone ? [body] : []);
    if (list.length === 0) return NextResponse.json({ success: false, error: "請提供 phone 或 calls[]" }, { status: 400 });
    const r = await ingestCalls(supabase, list);
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "寫入失敗" }, { status: 500 });
  }
}
