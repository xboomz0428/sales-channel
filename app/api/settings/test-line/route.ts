import { NextResponse } from "next/server";
import { notifyLine } from "@/lib/notify/line";
import { errorResponse } from "@/lib/auth";
import { buildDailyReport } from "@/lib/notify/dailyMetrics";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/settings/test-line
 * 立即送出一份「每日彙整」LINE 訊息（與排程相同內容），
 * 既可驗證 LINE 推播是否正常，也能預覽彙整報告長相。
 */
export async function POST() {
  try {
    const report = await buildDailyReport();
    const r = await notifyLine(`🔔 測試推播\n\n${report}`);
    if (r.ok) return NextResponse.json({ success: true, preview: report });
    if (r.skipped) return NextResponse.json({ success: false, error: "LINE 通知未啟用，請先設定 LINE_CHANNEL_ACCESS_TOKEN 並將 LINE_NOTIFY_ENABLED 設為 true" }, { status: 400 });
    return NextResponse.json({ success: false, error: r.error || "推播失敗" }, { status: 500 });
  } catch (err) {
    return errorResponse(err);
  }
}
