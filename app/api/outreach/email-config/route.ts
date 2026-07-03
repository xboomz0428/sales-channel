import { NextResponse } from "next/server";
import { resolveEmailProvider } from "@/lib/outreach/emailProvider";
import { getSendCaps, sentToday } from "@/lib/outreach/throttle";

export const runtime = "nodejs";

const PROVIDER_LABEL: Record<string, string> = {
  resend: "Resend",
  sendgrid: "SendGrid",
  gmail: "Gmail SMTP",
  smtp: "自訂 SMTP",
  none: "未設定",
};

/**
 * GET /api/outreach/email-config
 * 回報目前的寄信設定狀態（不外洩金鑰），供前端顯示「真實寄送 / 模擬寄出」與供應商。
 */
export async function GET() {
  const { provider, fromEmail, fromName } = await resolveEmailProvider();
  const configured = provider !== "none";

  // 今日寄送額度（顯示在寄送列，避免使用者不知道為何被排隊）
  let dailyCap = 0, usedToday = 0;
  try {
    const caps = await getSendCaps();
    dailyCap = caps.dailyCap;
    usedToday = await sentToday();
  } catch { /* 額度查詢失敗不影響設定回報 */ }

  return NextResponse.json({
    provider,
    providerLabel: PROVIDER_LABEL[provider] || provider,
    configured,
    mode: configured ? "live" : "simulate",
    fromEmail: configured ? fromEmail : null,
    fromName,
    dailyCap,
    usedToday,
    remainingToday: Math.max(0, dailyCap - usedToday),
  });
}
