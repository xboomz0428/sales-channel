import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchEmail } from "@/lib/outreach/dispatchEmail";
import { remainingDailyBudget } from "@/lib/outreach/throttle";

/**
 * 群發活動的背景寄送（Phase 2）
 * - claimMessage：原子認領一封排隊訊息（queued→sending）。背景寄送、手動「繼續寄送」、每日排程
 *   三條路徑都先認領再寄，同一封絕不會被寄兩次。
 * - acquire/releaseCampaignLock：同一活動同時只有一個背景寄送者；鎖有到期時間，中斷不會鎖死。
 * - drainCampaignOnce：在時間與每日額度內盡量寄出此活動的佇列（一棒）。
 * - kickCampaignDrain：觸發下一棒（打 /api/cron/drain-campaign，帶 CRON_SECRET）。
 */

export async function claimMessage(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("outreach_messages")
    .update({ status: "sending" })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  return !!(data && data.length > 0);
}

export type ClaimSendResult = "sent" | "failed" | "skipped";

/** 認領並寄出一封；被別的執行者搶走則回 skipped（不計額度） */
export async function claimAndSend(id: string): Promise<ClaimSendResult> {
  if (!(await claimMessage(id))) return "skipped";
  const r = await dispatchEmail(id);
  return r.ok ? "sent" : "failed";
}

export async function acquireCampaignLock(campaignId: string, seconds = 360): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("outreach_batches")
    .update({ drain_lock_until: until })
    .eq("id", campaignId)
    .or(`drain_lock_until.is.null,drain_lock_until.lt.${nowIso}`)
    .select("id");
  return !!(data && data.length > 0);
}

export async function releaseCampaignLock(campaignId: string): Promise<void> {
  await supabaseAdmin.from("outreach_batches").update({ drain_lock_until: null }).eq("id", campaignId);
}

export interface DrainOnceResult {
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;   // 本輪結束後仍在佇列的數量
  capReached: boolean; // 今日額度用盡（且仍有剩）
}

/** 一棒：在 timeBudgetMs 與今日剩餘額度內，依建立順序寄出此活動的佇列 */
export async function drainCampaignOnce(campaignId: string, timeBudgetMs = 240_000): Promise<DrainOnceResult> {
  const started = Date.now();
  let sent = 0, failed = 0, skipped = 0;
  let budget = await remainingDailyBudget();

  outer: while (Date.now() - started < timeBudgetMs && budget > 0) {
    const { data: q } = await supabaseAdmin
      .from("outreach_messages")
      .select("id")
      .eq("batch_id", campaignId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(5);
    if (!q || q.length === 0) break;
    for (const m of q) {
      if (Date.now() - started >= timeBudgetMs || budget <= 0) break outer;
      const r = await claimAndSend(m.id);
      if (r === "skipped") { skipped++; continue; }
      if (r === "sent") sent++; else failed++;
      budget--;
    }
  }

  const { count } = await supabaseAdmin
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", campaignId)
    .eq("status", "queued");
  const remaining = count || 0;
  if (remaining === 0) {
    await supabaseAdmin
      .from("outreach_batches")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", campaignId);
  }
  return { sent, failed, skipped, remaining, capReached: budget <= 0 && remaining > 0 };
}

/**
 * 觸發（下一棒）背景寄送。端點回 202 後自己在 after() 裡工作，所以這個 fetch 很快返回。
 * 失敗不丟錯：每天 08:00 的排程仍會把佇列補寄完。
 */
export async function kickCampaignDrain(origin: string, campaignId: string, hop = 0): Promise<boolean> {
  try {
    const secret = process.env.CRON_SECRET;
    const res = await fetch(`${origin.replace(/\/$/, "")}/api/cron/drain-campaign`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ campaignId, hop }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
