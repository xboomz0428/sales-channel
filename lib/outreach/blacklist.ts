import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BounceType = "hard" | "soft" | "failed";
/** 黑名單類型：hard/soft/failed 來自退信或寄送失敗；manual 為使用者在黑名單頁手動加入 */
export type BlacklistKind = BounceType | "manual";

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** email 一律 trim + lowercase */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

// 軟退信累計幾次後改為永久封鎖
const SOFT_BLOCK_THRESHOLD = 3;

export { classifyBounce } from "@/lib/outreach/bounceClassify";
export type { BounceKind } from "@/lib/outreach/bounceClassify";

/** addToBlacklist 結果：ok=false 代表讀或寫 email_blacklist 失敗（error 為原因），本次沒有寫入 */
export interface BlacklistResult {
  ok: boolean;
  blocked: boolean;
  error?: string;
}

/**
 * 加入/更新黑名單。
 * - hard / failed：立即封鎖（blocked=true）
 * - soft：累計 soft_count，達門檻才封鎖
 * 不會 throw：讀取或寫入失敗時回 { ok: false, error }，由呼叫端決定是否中止（scanBounces 會中止並保留水位）。
 */
export async function addToBlacklist(email: string, bounceType: BounceType, detail?: string): Promise<BlacklistResult> {
  const addr = normalizeEmail(email);
  if (!addr) return { ok: false, blocked: false, error: "email 為空" };
  try {
    const { data, error: readErr } = await supabaseAdmin
      .from("email_blacklist")
      .select("fail_count, soft_count, blocked, bounce_type")
      .eq("email", addr)
      .maybeSingle();
    if (readErr) return { ok: false, blocked: false, error: `讀取黑名單失敗：${readErr.message}` };

    let blocked = true;
    let writeErr: { message: string } | null = null;
    if (bounceType === "soft") {
      const soft = (data?.soft_count || 0) + 1;
      blocked = !!data?.blocked || soft >= SOFT_BLOCK_THRESHOLD;
      if (data) {
        ({ error: writeErr } = await supabaseAdmin.from("email_blacklist").update({
          soft_count: soft, blocked, bounce_type: keepManual(data.bounce_type, "soft"),
          last_fail: new Date().toISOString(), reason: detail || `軟退信 ${soft} 次`,
        }).eq("email", addr));
      } else {
        ({ error: writeErr } = await supabaseAdmin.from("email_blacklist").insert({
          email: addr, soft_count: soft, blocked, bounce_type: "soft",
          fail_count: 1, reason: detail || "軟退信 1 次",
        }));
      }
    } else if (data) {
      // hard / failed → 立即封鎖
      ({ error: writeErr } = await supabaseAdmin.from("email_blacklist").update({
        fail_count: (data.fail_count || 0) + 1, blocked: true, bounce_type: keepManual(data.bounce_type, bounceType),
        last_fail: new Date().toISOString(), reason: detail || bounceType,
      }).eq("email", addr));
    } else {
      ({ error: writeErr } = await supabaseAdmin.from("email_blacklist").insert({
        email: addr, fail_count: 1, blocked: true, bounce_type: bounceType, reason: detail || bounceType,
      }));
    }
    if (writeErr) return { ok: false, blocked: false, error: `寫入黑名單失敗：${writeErr.message}` };
    return { ok: true, blocked };
  } catch (e) {
    return { ok: false, blocked: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 使用者手動加入的列，之後再收到退信時保留 manual 類型（只更新次數與原因） */
function keepManual(current: string | null | undefined, next: BounceType): BlacklistKind {
  return current === "manual" ? "manual" : next;
}
