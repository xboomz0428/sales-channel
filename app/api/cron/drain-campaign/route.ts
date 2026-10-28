import { NextResponse, after } from "next/server";
import { requireCron, errorResponse } from "@/lib/auth";
import { acquireCampaignLock, releaseCampaignLock, drainCampaignOnce, kickCampaignDrain } from "@/lib/outreach/drain";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_HOPS = 400; // 保險：400 棒 × ~24 封 ≈ 近萬封，足夠任何單次群發

/**
 * POST /api/cron/drain-campaign   body: { campaignId, hop? }   Authorization: Bearer <CRON_SECRET>
 * 群發活動的「背景自我接力」寄送（不靠瀏覽器）：
 *  1. 取得活動鎖（同一活動同時只有一棒在跑）
 *  2. 立刻回 202，接著在 after() 裡寄最多 240 秒
 *  3. 還有剩且今日額度未用完 → 觸發下一棒；額度用完 → 停（每天 08:00 排程續寄）
 * 走 /api/cron/ 前綴：不經登入 proxy，由 CRON_SECRET 驗證。
 */
export async function POST(req: Request) {
  try {
    requireCron(req);
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId || "");
    const hop = Math.max(0, parseInt(String(body?.hop ?? 0), 10) || 0);
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) {
      return NextResponse.json({ error: "campaignId 無效" }, { status: 400 });
    }
    if (hop > MAX_HOPS) return NextResponse.json({ started: false, reason: "hop-limit" });

    const locked = await acquireCampaignLock(campaignId);
    if (!locked) return NextResponse.json({ started: false, reason: "busy" });

    const origin = new URL(req.url).origin;
    after(async () => {
      try {
        const r = await drainCampaignOnce(campaignId, 240_000);
        await releaseCampaignLock(campaignId);
        if (r.remaining > 0 && !r.capReached && !r.halted) {
          await kickCampaignDrain(origin, campaignId, hop + 1);
        }
      } catch {
        await releaseCampaignLock(campaignId);
      }
    });

    return NextResponse.json({ started: true, hop }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
