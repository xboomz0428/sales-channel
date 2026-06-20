import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanEnv } from "@/lib/env";
import crypto from "node:crypto";

interface DispatchResult {
  ok: boolean;
  error?: string;
}

export async function dispatchEmail(messageId: string): Promise<DispatchResult> {
  const { data: msg } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, to_email, subject, body, body_html")
    .eq("id", messageId)
    .single();

  if (!msg || !msg.to_email) {
    return { ok: false, error: "訊息不存在或無收件人 email" };
  }

  const fromEmail = cleanEnv("OUTREACH_FROM_EMAIL") || "noreply@heroherb.co";
  const fromName = cleanEnv("OUTREACH_FROM_NAME") || "HeroHerb 好漢草";
  const resendKey = cleanEnv("RESEND_API_KEY");
  const appBase = cleanEnv("APP_BASE_URL") || "https://localhost:3000";

  // 產生追蹤 ID
  const trackingId = crypto.randomUUID();

  // 注入追蹤像素 & 連結改寫
  let html = msg.body_html || msg.body?.replace(/\n/g, "<br/>") || "";
  const pixelTag = `<img src="${appBase}/api/track/open/${trackingId}" width="1" height="1" style="display:none" />`;
  html += pixelTag;

  // 更新訊息追蹤 ID
  await supabaseAdmin
    .from("outreach_messages")
    .update({ tracking_id: trackingId, status: "sending" })
    .eq("id", messageId);

  if (!resendKey) {
    // 無 Resend API Key：模擬寄出（開發期）
    console.log(`[dispatchEmail] 模擬寄出 → ${msg.to_email}，主旨：${msg.subject}`);
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", messageId);
    return { ok: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [msg.to_email],
        subject: msg.subject || "HeroHerb 好漢草",
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      await supabaseAdmin
        .from("outreach_messages")
        .update({ status: "failed", error_detail: errText.slice(0, 500) })
        .eq("id", messageId);
      return { ok: false, error: `Resend 錯誤 (${res.status})` };
    }

    const data = await res.json();
    await supabaseAdmin
      .from("outreach_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: data.id || null,
      })
      .eq("id", messageId);

    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "寄送失敗";
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "failed", error_detail: errMsg })
      .eq("id", messageId);
    return { ok: false, error: errMsg };
  }
}
