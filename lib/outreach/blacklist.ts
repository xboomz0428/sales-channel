import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BounceType = "hard" | "soft" | "failed";

// 軟退信累計幾次後改為永久封鎖
const SOFT_BLOCK_THRESHOLD = 3;

export { classifyBounce } from "@/lib/outreach/bounceClassify";
export type { BounceKind } from "@/lib/outreach/bounceClassify";

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
