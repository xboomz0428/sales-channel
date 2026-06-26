import { NextResponse } from "next/server";
import { notifyLine } from "@/lib/notify/line";
import { errorResponse } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/settings/test-line
 * 寄一則測試訊息到 LINE，回傳結果
 */
export async function POST() {
  try {
    const now = new Date().toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      dateStyle: "short",
      timeStyle: "short",
    });
    const r = await notifyLine(`✅ LINE 通知測試成功！\n\nHeroHerb 通路開發系統\n測試時間：${now}\n\ncc.wesmilegood.com`);
    if (r.ok) return NextResponse.json({ success: true });
    if (r.skipped) return NextResponse.json({ success: false, error: "LINE 通知未啟用，請先設定 LINE_CHANNEL_ACCESS_TOKEN 並將 LINE_NOTIFY_ENABLED 設為 true" }, { status: 400 });
    return NextResponse.json({ success: false, error: r.error || "推播失敗" }, { status: 500 });
  } catch (err) {
    return errorResponse(err);
  }
}
