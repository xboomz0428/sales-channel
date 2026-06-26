import { NextResponse } from "next/server";
import { requireCron, errorResponse } from "@/lib/auth";
import { notifyLine } from "@/lib/notify/line";
import { buildDailyReport } from "@/lib/notify/dailyMetrics";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 每日 9PM 台灣時間（13:00 UTC）彙整晚報。
 * vercel.json: { "path": "/api/cron/daily-report", "schedule": "0 13 * * *" }
 *
 * 內容彙整：
 *  ▍今日執行進度（採集/補齊/工商/寄信/聯繫/報價）
 *  ▍平台數據（vs 昨日真實成長差異）
 *  ▍管道狀態分佈（vs 昨日）
 * 並把今日快照寫入 daily_metrics 供明日對比。
 */
export async function GET(req: Request) {
  try {
    requireCron(req);
    const message = await buildDailyReport();
    const r = await notifyLine(message);
    return NextResponse.json({ ok: true, notified: r.ok, skipped: r.skipped, error: r.error, preview: message });
  } catch (err) {
    return errorResponse(err);
  }
}
