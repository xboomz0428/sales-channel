import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBounceTexts } from "@/lib/channels/gmailImap";
import { classifyBounce, addToBlacklist } from "@/lib/outreach/blacklist";

/**
 * 掃 Gmail 信箱裡的退信通知（mailer-daemon / postmaster），
 * 比對近 3 天寄出的收件人，分類硬/軟退信並寫入黑名單。
 * 透過 IMAP（app password）讀信箱，回傳 { scanned, hard, soft, ignored }。
 */
export async function scanBounces(): Promise<{ scanned: number; hard: number; soft: number; ignored: number }> {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, to_email")
    .eq("channel", "EM")
    .eq("status", "sent")
    .gte("created_at", since)
    .not("to_email", "is", null);

  if (!recent || recent.length === 0) return { scanned: 0, hard: 0, soft: 0, ignored: 0 };

  // 只認我們確實寄過的信箱，避免誤把退信內文引用到的簽名/退訂信箱（如自家地址）也封鎖
  const sentSet = new Set(recent.map((m) => (m.to_email || "").toLowerCase()).filter(Boolean));
  const idByEmail = new Map<string, string>();
  for (const m of recent) {
    const e = (m.to_email || "").toLowerCase();
    if (e && !idByEmail.has(e)) idByEmail.set(e, m.id);
  }

  const texts = await fetchBounceTexts(3, 80);

  let hard = 0, soft = 0, ignored = 0;
  const handled = new Set<string>();
  for (const text of texts) {
    // 精準抽出「真正失敗的收件人」：優先 DSN 標準欄位，再退而求其次用 Gmail 中英文退信措辭
    const failed = extractFailedRecipients(text).filter((e) => sentSet.has(e) && !handled.has(e));
    if (failed.length === 0) continue;

    const kind = classifyBounce(text);
    if (kind === "none") { ignored += failed.length; continue; }

    for (const email of failed) {
      handled.add(email);
      const id = idByEmail.get(email);
      if (id) {
        await supabaseAdmin
          .from("outreach_messages")
          .update({ status: "bounced", error_detail: kind === "hard" ? "硬退信（信箱不存在）" : "軟退信（暫時性）" })
          .eq("id", id)
          .eq("status", "sent");
      }
      await addToBlacklist(email, kind === "hard" ? "hard" : "soft", kind === "hard" ? "硬退信" : "軟退信");
      kind === "hard" ? hard++ : soft++;
    }
  }
  return { scanned: texts.length, hard, soft, ignored };
}

const EMAIL_G = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/**
 * 從退信內容抽出「真正失敗的收件人」。
 * 1) 優先 DSN 標準欄位 Final-Recipient / Original-Recipient（最可靠）。
 * 2) 否則用 Gmail 中英文退信措辭附近的信箱（你寄到 X、系統找不到 X、to X…）。
 * 都抽不到才回空（不再盲目比對全文，避免誤封簽名/退訂信箱）。
 */
function extractFailedRecipients(text: string): string[] {
  const out = new Set<string>();
  const dsn = [...text.matchAll(/(?:final|original)-recipient:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/gi)];
  for (const m of dsn) out.add(m[1].toLowerCase());
  if (out.size > 0) return [...out];

  // Gmail 措辭：你寄到 X 的郵件 / 系統找不到 X / address X / to X
  const phraseRe = /(?:你寄到|寄至|系統找不到|找不到地址[：: ]*|address not found[^A-Za-z0-9]*|recipient[^A-Za-z0-9]*|to\s+)\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/gi;
  for (const m of [...text.matchAll(phraseRe)]) out.add(m[1].toLowerCase());
  if (out.size > 0) return [...out];

  // 真的抽不到結構 → 回全文所有信箱（交由上層用「確實寄過」清單過濾）
  return [...new Set((text.match(EMAIL_G) || []).map((e) => e.toLowerCase()))];
}
