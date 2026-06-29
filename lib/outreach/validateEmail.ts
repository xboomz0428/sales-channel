import { resolveMx } from "node:dns/promises";
import { isValidEmail } from "@/lib/outreach/resolveEmails";

// 網域 → 是否有 MX 記錄。只快取「有 MX」的結果（true），
// 查不到時不快取，避免 DNS 暫時性失敗把好網域永久誤判。
const mxCache = new Map<string, boolean>();

async function domainHasMx(domain: string): Promise<boolean> {
  const d = domain.toLowerCase().trim();
  if (!d) return false;
  if (mxCache.get(d)) return true;
  try {
    const recs = await resolveMx(d);
    const ok = Array.isArray(recs) && recs.length > 0 && recs.some((r) => r.exchange);
    if (ok) mxCache.set(d, true);
    return ok;
  } catch {
    return false; // NXDOMAIN / 無 MX / 查詢失敗 → 視為不可寄
  }
}

/** 單一信箱是否可寄：語法正確 + 網域有 MX 記錄 */
export async function isSendableEmail(email: string): Promise<boolean> {
  if (!isValidEmail(email)) return false;
  const domain = email.split("@")[1] || "";
  return domainHasMx(domain);
}

/**
 * 寄信前清洗：把一組信箱分成「可寄 / 無效」。
 * 先去重各網域，平行查 MX，避免逐一阻塞。
 */
export async function partitionSendable(emails: string[]): Promise<{ ok: Set<string>; bad: Set<string> }> {
  const ok = new Set<string>();
  const bad = new Set<string>();
  const uniq = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];

  // 先用語法過濾
  const syntaxOk = uniq.filter((e) => {
    if (isValidEmail(e)) return true;
    bad.add(e);
    return false;
  });

  // 平行查每個網域的 MX（去重網域）
  const domains = [...new Set(syntaxOk.map((e) => (e.split("@")[1] || "").toLowerCase()))];
  const mxResults = await Promise.all(domains.map(async (d) => [d, await domainHasMx(d)] as const));
  const mxMap = new Map(mxResults);

  for (const e of syntaxOk) {
    const d = (e.split("@")[1] || "").toLowerCase();
    if (mxMap.get(d)) ok.add(e); else bad.add(e);
  }
  return { ok, bad };
}
