import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCfg } from "@/lib/settings";
import { ingestCalls, type CallInput } from "@/lib/voice/ingest";

export const runtime = "nodejs";

/**
 * POST /api/voice/webhook?provider=bland|retell|vapi|elevenlabs&token=XXX
 * 各語音平台「通話結束」的回呼端點：自動把逐字稿/錄音/秒數/成效寫入通話紀錄。
 * - provider：指定平台（未指定時依 payload 形狀自動偵測）
 * - token：可選的共用密鑰；若在「設定」填了 VOICE_WEBHOOK_TOKEN 就必須帶對才收
 * 要在平台把 brand_id / outcome 帶回來：把它們放進該平台的 metadata / dynamic variables / structured data。
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    // 密鑰驗證（若有設定）
    const expected = (await getCfg("VOICE_WEBHOOK_TOKEN")) || "";
    if (expected) {
      const token = url.searchParams.get("token") || req.headers.get("x-webhook-token") || "";
      if (token !== expected) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const provider = (url.searchParams.get("provider") || detectProvider(body) || "webhook").toLowerCase();
    const call = normalize(provider, body);
    if (!call || !call.phone) {
      return NextResponse.json({ success: false, error: "payload 缺少電話號碼；請確認平台有帶 customer/to number" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const r = await ingestCalls(supabase, [call]);
    return NextResponse.json({ success: true, provider, ...r });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "webhook 失敗" }, { status: 500 });
  }
}

// 依 payload 特徵猜平台（未帶 ?provider 時的後備）
function detectProvider(b: any): string | null {
  if (b?.message?.type || b?.message?.call) return "vapi";
  if (b?.call?.call_id || b?.event === "call_analyzed" || b?.event === "call_ended") return "retell";
  if (b?.call_id && (b?.concatenated_transcript !== undefined || b?.call_length !== undefined)) return "bland";
  if (b?.type === "post_call_transcription" || b?.data?.conversation_id) return "elevenlabs";
  return null;
}

const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o); if (v != null && v !== "") return v; } return undefined; };
const sentimentToOutcome = (s?: string, ok?: boolean): string | undefined => {
  const t = (s || "").toLowerCase();
  if (ok === true) return "interested";
  if (t.includes("positive")) return "interested";
  if (t.includes("negative")) return "not_interested";
  return undefined;
};

// 各平台 payload → 統一 CallInput（欄位位置會隨平台版本微調，取多個候選路徑）
function normalize(provider: string, b: any): CallInput | null {
  switch (provider) {
    case "bland": {
      const meta = b.metadata || b.request_data || {};
      const transcript = b.concatenated_transcript || (Array.isArray(b.transcripts) ? b.transcripts.map((t: any) => `${t.user || t.speaker || ""}: ${t.text}`).join("\n") : undefined);
      return {
        provider: "bland", external_id: String(b.call_id || ""),
        phone: b.to || b.phone_number || pick(meta, "phone"),
        brand_id: pick(meta, "brand_id"), brand_name: pick(meta, "brand_name"),
        status: b.completed === false ? "failed" : (b.answered_by === "no-answer" ? "no_answer" : "completed"),
        outcome: pick(meta, "outcome") || pick(b, "disposition_tag"),
        transcript, recording_url: b.recording_url,
        duration_sec: b.call_length != null ? Math.round(Number(b.call_length) * 60) : undefined,
        campaign: pick(meta, "campaign"),
      };
    }
    case "retell": {
      const c = b.call || b;
      const meta = c.metadata || {};
      const an = c.call_analysis || {};
      return {
        provider: "retell", external_id: String(c.call_id || ""),
        phone: c.to_number || pick(meta, "phone"),
        brand_id: pick(meta, "brand_id"), brand_name: pick(meta, "brand_name"),
        status: c.call_status === "ended" || c.disconnection_reason ? "completed" : "completed",
        outcome: pick(an, "custom_analysis_data.outcome") || pick(meta, "outcome") || sentimentToOutcome(an.user_sentiment, an.call_successful),
        transcript: c.transcript,
        recording_url: c.recording_url,
        duration_sec: c.duration_ms != null ? Math.round(Number(c.duration_ms) / 1000) : undefined,
        campaign: pick(meta, "campaign"),
      };
    }
    case "vapi": {
      const m = b.message || b;
      const c = m.call || {};
      const meta = c.metadata || m.assistantOverrides?.metadata || {};
      const an = m.analysis || {};
      return {
        provider: "vapi", external_id: String(c.id || m.id || ""),
        phone: pick(c, "customer.number") || pick(m, "customer.number") || pick(meta, "phone"),
        brand_id: pick(meta, "brand_id"), brand_name: pick(meta, "brand_name"),
        status: m.endedReason && /no-answer|voicemail|busy/i.test(m.endedReason) ? (m.endedReason.includes("voicemail") ? "voicemail" : m.endedReason.includes("busy") ? "busy" : "no_answer") : "completed",
        outcome: pick(an, "structuredData.outcome") || pick(meta, "outcome") || sentimentToOutcome(undefined, an.successEvaluation === true || an.successEvaluation === "true"),
        transcript: m.transcript || (Array.isArray(m.messages) ? m.messages.map((x: any) => `${x.role}: ${x.message}`).join("\n") : undefined),
        recording_url: m.recordingUrl || m.recording_url || pick(m, "artifact.recordingUrl"),
        duration_sec: m.durationSeconds != null ? Math.round(Number(m.durationSeconds)) : undefined,
        campaign: pick(meta, "campaign"),
      };
    }
    case "elevenlabs": {
      const d = b.data || b;
      const meta = d.metadata || {};
      const dyn = pick(d, "conversation_initiation_client_data.dynamic_variables") || {};
      const transcript = Array.isArray(d.transcript) ? d.transcript.map((t: any) => `${t.role || t.speaker}: ${t.message || t.text}`).join("\n") : d.transcript;
      return {
        provider: "elevenlabs", external_id: String(d.conversation_id || ""),
        phone: pick(meta, "phone_call.external_number") || pick(dyn, "phone") || pick(meta, "phone"),
        brand_id: pick(dyn, "brand_id") || pick(meta, "brand_id"), brand_name: pick(dyn, "brand_name"),
        status: "completed",
        outcome: pick(dyn, "outcome") || pick(d, "analysis.outcome"),
        transcript,
        recording_url: pick(meta, "recording_url") || pick(d, "audio_url"),
        duration_sec: pick(meta, "call_duration_secs"),
        campaign: pick(dyn, "campaign"),
      };
    }
    default:
      // 已是我們的標準格式 → 直接用
      return b.phone ? (b as CallInput) : null;
  }
}
