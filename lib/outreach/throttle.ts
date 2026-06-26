import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCfgMany } from "@/lib/settings";

/** 取得寄送節流設定（每日上限、每批上限） */
export async function getSendCaps(): Promise<{ dailyCap: number; perRun: number }> {
  const cfg = await getCfgMany(["EMAIL_DAILY_CAP", "EMAIL_PER_RUN"]);
  const dailyCap = Math.max(0, parseInt(cfg.EMAIL_DAILY_CAP || "300", 10) || 300);
  const perRun = Math.max(1, parseInt(cfg.EMAIL_PER_RUN || "40", 10) || 40);
  return { dailyCap, perRun };
}

/** 今天（本地日界線以 UTC+8 計）已實際寄出的電子報數量 */
export async function sentToday(): Promise<number> {
  // 以台灣時間 00:00 為界
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = tw.getUTCFullYear(), m = tw.getUTCMonth(), d = tw.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d) - 8 * 3600 * 1000); // 台灣當日 00:00 對應的 UTC
  const { count } = await supabaseAdmin
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "EM")
    .eq("status", "sent")
    .gte("sent_at", startUtc.toISOString());
  return count || 0;
}

/** 今天還能寄幾封（剩餘每日額度） */
export async function remainingDailyBudget(): Promise<number> {
  const { dailyCap } = await getSendCaps();
  const used = await sentToday();
  return Math.max(0, dailyCap - used);
}
