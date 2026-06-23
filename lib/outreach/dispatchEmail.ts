import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanEnv } from "@/lib/env";
import crypto from "node:crypto";
import { resolveEmailProvider, sendViaResend, sendViaSendgrid, sendViaSmtp } from "@/lib/outreach/emailProvider";

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

  const { provider, fromEmail, fromName } = resolveEmailProvider();
  const appBase = cleanEnv("APP_BASE_URL") || "https://localhost:3000";

  // 產生追蹤 ID + 注入開信追蹤像素
  const trackingId = crypto.randomUUID();
  let html = msg.body_html || msg.body?.replace(/\n/g, "<br/>") || "";
  html += `<img src="${appBase}/api/track/open/${trackingId}" width="1" height="1" style="display:none" />`;

  await supabaseAdmin
    .from("outreach_messages")
    .update({ tracking_id: trackingId, status: "sending" })
    .eq("id", messageId);

  // 未設定任何寄信供應商 → 模擬寄出（開發/測試）
  if (provider === "none") {
    console.log(`[dispatchEmail] 模擬寄出 → ${msg.to_email}，主旨：${msg.subject}`);
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", messageId);
    return { ok: true };
  }

  const args = {
    to: msg.to_email,
    subject: msg.subject || "HeroHerb 好漢草",
    html,
    from: `${fromName} <${fromEmail}>`,
    fromEmail,
    fromName,
  };

  try {
    const r =
      provider === "resend" ? await sendViaResend(args)
      : provider === "sendgrid" ? await sendViaSendgrid(args)
      : await sendViaSmtp(args, provider); // gmail | smtp

    if (!r.ok) {
      await supabaseAdmin
        .from("outreach_messages")
        .update({ status: "failed", error_detail: (r.error || "寄送失敗").slice(0, 500) })
        .eq("id", messageId);
      return { ok: false, error: r.error || "寄送失敗" };
    }

    await supabaseAdmin
      .from("outreach_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: r.providerMessageId || null,
      })
      .eq("id", messageId);
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "寄送失敗";
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "failed", error_detail: errMsg.slice(0, 500) })
      .eq("id", messageId);
    return { ok: false, error: errMsg };
  }
}
