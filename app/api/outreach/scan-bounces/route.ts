import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { scanBounces } from "@/lib/outreach/scanBounces";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/outreach/scan-bounces
 * 手動觸發退信掃描（郵件儀表板「立即掃描退信」按鈕）。
 * 走 IMAP 讀信箱、分類硬/軟退信並寫入黑名單，下次寄送自動排除。
 */
export async function POST() {
  try {
    await requireUser();
    const r = await scanBounces();
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    return errorResponse(err);
  }
}
