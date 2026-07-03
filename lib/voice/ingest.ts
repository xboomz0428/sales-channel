import type { SupabaseClient } from "@supabase/supabase-js";

export const OUTCOME_LABEL: Record<string, string> = {
  interested: "有興趣", not_interested: "沒興趣", callback: "約回撥",
  do_not_call: "拒撥", wrong_number: "號碼有誤", unknown: "未定",
};
export const STATUS_LABEL: Record<string, string> = {
  completed: "已接通", no_answer: "未接", voicemail: "語音信箱", busy: "忙線", failed: "失敗",
};

export interface CallInput {
  brand_id?: string | null;
  phone: string;
  brand_name?: string | null;
  campaign?: string | null;
  status?: string;
  outcome?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  duration_sec?: number | string | null;
  notes?: string | null;
  called_at?: string | null;
  provider?: string | null;      // bland / retell / vapi / elevenlabs / manual / csv
  external_id?: string | null;   // 平台的通話 ID（去重用）
}

export interface IngestResult { saved: number; skipped: number; contactedUpdated: number; dncAdded: number }

/**
 * 共用通話寫入：CSV 匯入與各平台 webhook 都走這支。
 * ① 存 voice_calls（有 external_id 時去重）② 寫回 outreach_logs 聯繫紀錄
 * ③ 接通者 new→contacted ④ outcome=do_not_call → 電話加入拒撥名單
 */
export async function ingestCalls(supabase: SupabaseClient, list: CallInput[]): Promise<IngestResult> {
  let saved = 0, skipped = 0, contactedUpdated = 0, dncAdded = 0;

  for (const c of list) {
    const phone = String(c.phone || "").trim();
    if (!phone) continue;

    // webhook 去重：同 provider + external_id 已存在 → 略過
    if (c.provider && c.external_id) {
      const { data: dup } = await supabase.from("voice_calls").select("id")
        .eq("provider", c.provider).eq("external_id", c.external_id).maybeSingle();
      if (dup) { skipped++; continue; }
    }

    let brandId: string | null = c.brand_id || null;
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
    const dur = c.duration_sec != null ? (parseInt(String(c.duration_sec), 10) || null) : null;

    const { error } = await supabase.from("voice_calls").insert({
      brand_id: brandId, phone, brand_name: c.brand_name || null, campaign: c.campaign || null,
      status, outcome, transcript: c.transcript || null, recording_url: c.recording_url || null,
      duration_sec: dur, notes: c.notes || null, called_at: calledAt,
      provider: c.provider || null, external_id: c.external_id || null,
    });
    if (error) { skipped++; continue; }
    saved++;

    if (brandId) {
      const parts = [`📞 AI 語音外撥（${STATUS_LABEL[status] || status}${outcome ? `·${OUTCOME_LABEL[outcome] || outcome}` : ""}）`];
      if (dur) parts.push(`通話 ${dur} 秒`);
      if (c.provider) parts.push(`平台：${c.provider}`);
      if (c.recording_url) parts.push(`錄音：${c.recording_url}`);
      await supabase.from("outreach_logs").insert({
        brand_id: brandId, channel: "voice", log_type: "call", summary: parts.join("｜"), created_at: calledAt,
      });
      if (status === "completed") {
        const { data: upd } = await supabase.from("brands").update({ status: "contacted", updated_at: calledAt }).eq("id", brandId).eq("status", "new").select("id");
        if (upd && upd.length) contactedUpdated++;
      }
    }

    if (outcome === "do_not_call") {
      await supabase.from("phone_dnc").upsert({ phone, brand_id: brandId, reason: "通話中表達拒撥" }, { onConflict: "phone", ignoreDuplicates: true });
      dncAdded++;
    }
  }

  return { saved, skipped, contactedUpdated, dncAdded };
}
