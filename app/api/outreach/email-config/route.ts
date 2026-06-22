import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/outreach/email-config
 * 回報目前的寄信設定狀態（不外洩金鑰），供前端顯示「真實寄送 / 模擬寄出」。
 */
export async function GET() {
  const resendKey = cleanEnv("RESEND_API_KEY");
  const fromEmail = cleanEnv("OUTREACH_FROM_EMAIL");
  const fromName = cleanEnv("OUTREACH_FROM_NAME");

  return NextResponse.json({
    provider: "resend",            // 目前內建的寄信服務
    configured: !!resendKey,       // 是否已設定金鑰（true=真實寄出）
    mode: resendKey ? "live" : "simulate",
    fromEmail: fromEmail || null,
    fromName: fromName || "HeroHerb 好漢草",
    // 缺哪些設定（供前端提示）
    missing: [
      ...(resendKey ? [] : ["RESEND_API_KEY"]),
      ...(fromEmail ? [] : ["OUTREACH_FROM_EMAIL"]),
    ],
  });
}
