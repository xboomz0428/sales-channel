import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const OUTCOME_LABEL: Record<string, string> = {
  interested: "有興趣", not_interested: "沒興趣", callback: "約回撥",
  do_not_call: "拒撥", wrong_number: "號碼有誤", unknown: "未定",
};
const STATUS_LABEL: Record<string, string> = {
  completed: "已接通", no_answer: "未接", voicemail: "語音信箱", busy: "忙線", failed: "失敗",
};

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
    const list: any[] = Array.isArray(body.calls) ? body.calls : (body.phone ? [body] : []);
    if (list.length === 0) return NextResponse.json({ success: false, error: "請提供 phone 或 calls[]" }, { status: 400 });

    let saved = 0, contactedUpdated = 0, dncAdded = 0;
    for (const c of list) {
      const phone = String(c.phone || "").trim();
      if (!phone) continue;
      let brandId: string | null = c.brand_id || null;
      // 未帶 brand_id → 用電話回查品牌（brand_channels 或 stores）
      if (!brandId) {
        const { data: bc } = await supabase.from("brand_channels").select("brand_id").eq("channel", "phone").eq("value", phone).maybeSingle();
        brandId = bc?.brand_id || null;
        if (!brandId) {
          const { data: st } = await supabase.from("stores").select("brand_id").eq("phone", phone).maybeSingle();
          brandId = st?.brand_id || null;
        }
      }
      const status = String(c.status || "completed");
      const outcome = c.outcome ? String(c.outcome) : null;
      const calledAt = c.called_at ? new Date(c.called_at).toISOString() : new Date().toISOString();

      // ① 存通話紀錄
      const { error } = await supabase.from("voice_calls").insert({
        brand_id: brandId, phone, brand_name: c.brand_name || null, campaign: c.campaign || null,
        status, outcome, transcript: c.transcript || null, recording_url: c.recording_url || null,
        duration_sec: c.duration_sec != null ? parseInt(String(c.duration_sec), 10) || null : null,
        notes: c.notes || null, called_at: calledAt,
      });
      if (error) continue;
      saved++;

      if (brandId) {
        // ② 寫回聯繫紀錄
        const parts = [`📞 AI 語音外撥（${STATUS_LABEL[status] || status}${outcome ? `·${OUTCOME_LABEL[outcome] || outcome}` : ""}）`];
        if (c.duration_sec) parts.push(`通話 ${c.duration_sec} 秒`);
        if (c.recording_url) parts.push(`錄音：${c.recording_url}`);
        await supabase.from("outreach_logs").insert({
          brand_id: brandId, channel: "voice", log_type: "call",
          summary: parts.join("｜"), created_at: calledAt,
        });
        // ③ 接通 → 品牌 new→contacted
        if (status === "completed") {
          const { data: upd } = await supabase.from("brands").update({ status: "contacted", updated_at: calledAt }).eq("id", brandId).eq("status", "new").select("id");
          if (upd && upd.length) contactedUpdated++;
        }
      }

      // ④ 拒撥 → 加入拒撥名單
      if (outcome === "do_not_call") {
        await supabase.from("phone_dnc").upsert({ phone, brand_id: brandId, reason: "通話中表達拒撥" }, { onConflict: "phone", ignoreDuplicates: true });
        dncAdded++;
      }
    }

    return NextResponse.json({ success: true, saved, contactedUpdated, dncAdded });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "寫入失敗" }, { status: 500 });
  }
}
