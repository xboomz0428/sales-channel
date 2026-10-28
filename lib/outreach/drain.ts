import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchEmail } from "@/lib/outreach/dispatchEmail";
import { remainingDailyBudget } from "@/lib/outreach/throttle";
import { getCfg } from "@/lib/settings";

/**
 * 群發活動的背景寄送（Phase 2）
 * - 真正的「原子認領」在 dispatchEmail 內部（status 不在 sending/sent/delivered/read/replied 才能進入寄送，
 *   並寫入 claimed_at）。背景接力、手動繼續寄送、每日排程排空、重寄 全部經過同一關卡，同一封絕不會寄兩次。
 * - acquire/releaseCampaignLock：同一活動同時只有一個背景寄送者；鎖有到期時間，中斷不會鎖死。
 * - drainCampaignOnce：一棒。在時間與每日額度內寄出此活動的佇列；每 5 封重讀一次今日用量
 *   （多個活動並行時不會明顯超發）；連續失敗 5 封即停（寄信服務故障時不會把名單整批誤封鎖）。
 * - kickCampaignDrain：觸發下一棒（打 /api/cron/drain-campaign，帶 CRON_SECRET）。
 */

export type ClaimSendResult = "sent" | "failed" | "skipped";

/** 寄出一封（認領在 dispatchEmail 內）；被別的執行者搶走回 skipped（不計額度） */
export async function claimAndSend(id: string): Promise<ClaimSendResult> {
  const r = await dispatchEmail(id);
  if (r.skipped) return "skipped";
  return r.ok ? "sent" : "failed";
}

export async function acquireCampaignLock(campaignId: string, seconds = 360): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("outreach_batches")
    .update({ drain_lock_until: until })
    .eq("id", campaignId)
    .or("drain_lock_until.is.null,drain_lock_until.lt." + nowIso)
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
  remaining: number;   // 本輪結束後仍在佇列的數量（查詢失敗時以 1 表示「未知、尚未完成」）
  capReached: boolean; // 今日額度用盡（且仍有剩）
  halted: boolean;     // 連續失敗過多而主動停止（不接力；隔天排程再續）
}

const MAX_CONSECUTIVE_FAILURES = 5;

/** 一棒：在 timeBudgetMs 與今日剩餘額度內，依建立順序寄出此活動的佇列 */
export async function drainCampaignOnce(campaignId: string, timeBudgetMs = 240_000): Promise<DrainOnceResult> {
  const started = Date.now();
  let sent = 0, failed = 0, skipped = 0, consecutiveFail = 0, halted = false;
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
      if (r === "sent") { sent++; consecutiveFail = 0; } else { failed++; consecutiveFail++; }
      budget--;
      if (consecutiveFail >= MAX_CONSECUTIVE_FAILURES) { halted = true; break outer; }
    }
    // 重讀實際今日用量：多個活動／手動／排程並行時，以資料庫為準而非本地遞減
    budget = await remainingDailyBudget();
  }

  const { count, error } = await supabaseAdmin
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", campaignId)
    .eq("status", "queued");
  // 查詢失敗 → 視為未知（仍有剩），絕不誤標完成
  const remaining = error ? 1 : (count || 0);
  if (!error && remaining === 0) {
    await supabaseAdmin
      .from("outreach_batches")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", campaignId);
  }
  return { sent, failed, skipped, remaining, capReached: budget <= 0 && remaining > 0, halted };
}

/**
 * 觸發（下一棒）背景寄送。端點回 202 後自己在 after() 裡工作，所以這個 fetch 很快返回。
 * 先打本次請求的 origin；失敗再退回設定的 APP_BASE_URL（例如正式網域）。失敗不丟錯：每天 08:00 排程仍會續寄。
 */
export async function kickCampaignDrain(origin: string, campaignId: string, hop = 0): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const post = async (base: string) => {
    const res = await fetch(base.replace(/\/$/, "") + "/api/cron/drain-campaign", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: "Bearer " + secret } : {}) },
      body: JSON.stringify({ campaignId, hop }),
      cache: "no-store",
    });
    return res.ok;
  };
  try {
    if (await post(origin)) return true;
  } catch { /* 試下一個 base */ }
  try {
    const alt = (await getCfg("APP_BASE_URL")) || "";
    if (alt && alt.replace(/\/$/, "") !== origin.replace(/\/$/, "")) return await post(alt);
  } catch { /* ignore */ }
  return false;
}
