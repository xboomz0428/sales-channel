import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BounceType = "hard" | "soft" | "failed";

// 軟退信累計幾次後改為永久封鎖
const SOFT_BLOCK_THRESHOLD = 3;

const HARD_RE = /(550|551|553|554)[\s-]|user unknown|no such user|does not exist|doesn'?t exist|mailbox not found|mailbox unavailable|recipient address rejected|address not found|invalid recipient|unknown recipient|no mailbox|account .* does not exist|address rejected|recipient not found|未知的收件|查無此|不存在/i;
const SOFT_RE = /(421|450|451|452)[\s-]|quota|mailbox full|over quota|temporar|try again|deferred|greylist|timed out|connection refused|rate limit|too many|信箱已滿|暫時/i;
const DELAY_RE = /delay|delayed|will retry|not yet been delivered|還在嘗試|延遲/i;

/** 判斷退信屬於硬退信、軟退信，或只是延遲通知（none＝不是真退信） */
export function classifyBounce(text: string): "hard" | "soft" | "none" {
  const t = text.toLowerCase();
  if (HARD_RE.test(t)) return "hard";
  if (DELAY_RE.test(t) && !HARD_RE.test(t) && !SOFT_RE.test(t)) return "none"; // 純延遲通知，先不處理
  if (SOFT_RE.test(t)) return "soft";
  return "hard"; // mailer-daemon 退回且無暫時性字眼 → 視為硬退信
}

/**
 * 加入/更新黑名單。
 * - hard / failed：立即封鎖（blocked=true）
 * - soft：累計 soft_count，達門檻才封鎖
 */
export async function addToBlacklist(email: string, bounceType: BounceType, detail?: string) {
  const addr = email.toLowerCase();
  try {
    const { data } = await supabaseAdmin
      .from("email_blacklist")
      .select("fail_count, soft_count, blocked")
      .eq("email", addr)
      .maybeSingle();

    if (bounceType === "soft") {
      const soft = (data?.soft_count || 0) + 1;
      const blocked = data?.blocked || soft >= SOFT_BLOCK_THRESHOLD;
      if (data) {
        await supabaseAdmin.from("email_blacklist").update({
          soft_count: soft, blocked, bounce_type: "soft",
          last_fail: new Date().toISOString(), reason: detail || `軟退信 ${soft} 次`,
        }).eq("email", addr);
      } else {
        await supabaseAdmin.from("email_blacklist").insert({
          email: addr, soft_count: soft, blocked, bounce_type: "soft",
          fail_count: 1, reason: detail || "軟退信 1 次",
        });
      }
      return { blocked };
    }

    // hard / failed → 立即封鎖
    if (data) {
      await supabaseAdmin.from("email_blacklist").update({
        fail_count: (data.fail_count || 0) + 1, blocked: true, bounce_type: bounceType,
        last_fail: new Date().toISOString(), reason: detail || bounceType,
      }).eq("email", addr);
    } else {
      await supabaseAdmin.from("email_blacklist").insert({
        email: addr, fail_count: 1, blocked: true, bounce_type: bounceType, reason: detail || bounceType,
      });
    }
    return { blocked: true };
  } catch {
    return { blocked: false };
  }
}
