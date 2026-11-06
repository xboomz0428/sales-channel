/**
 * 退信分類（純函式，無任何相依，可被 node --test 直接 import）。
 *
 * policy：對方伺服器以「安全／政策」理由拒收（RFC 3463 的 5.7.x 類別），例如寄件網域缺 SPF／DKIM／DMARC、
 *   被判為垃圾信、對方設定拒收。收件信箱本身有效，問題在寄件端，所以「不可列入黑名單」。
 *   實際樣本（2026-11-06，Outlook 退回 hotmail 收件人）：
 *     550 5.7.1 Message rejected: Message lacks SPF/DKIM/DMARC Auth Records
 *   只認「SMTP 回覆碼＋5.7.x」這個組合，不比對 spf／dkim／dmarc 等單字：退信通知會附上原信標頭
 *   （DKIM-Signature、Authentication-Results…），單字比對會把所有退信都誤判成 policy。
 * hard：信箱不存在等永久性錯誤 → 立即封鎖。
 * soft：信箱已滿、暫時性錯誤 → 累計達門檻才封鎖。
 * none：純延遲通知，不是真退信。
 */
export type BounceKind = "hard" | "soft" | "policy" | "none";

const POLICY_RE = /\b5\d\d[ -]5\.7\.\d{1,3}\b/;
const HARD_RE = /(550|551|553|554)[\s-]|user unknown|no such user|does not exist|doesn'?t exist|mailbox not found|mailbox unavailable|recipient address rejected|address not found|invalid recipient|unknown recipient|no mailbox|account .* does not exist|address rejected|recipient not found|未知的收件|查無此|不存在/i;
const SOFT_RE = /(421|450|451|452)[\s-]|quota|mailbox full|over quota|temporar|try again|deferred|greylist|timed out|connection refused|rate limit|too many|信箱已滿|暫時/i;
const DELAY_RE = /delay|delayed|will retry|not yet been delivered|還在嘗試|延遲/i;

export function classifyBounce(text: string): BounceKind {
  const t = text.toLowerCase();
  if (POLICY_RE.test(t)) return "policy"; // 先判：5.7.x 的回覆碼開頭也是 550／554，會被下面的硬退信規則吃掉
  if (HARD_RE.test(t)) return "hard";
  if (DELAY_RE.test(t) && !HARD_RE.test(t) && !SOFT_RE.test(t)) return "none"; // 純延遲通知，先不處理
  if (SOFT_RE.test(t)) return "soft";
  return "hard"; // mailer-daemon 退回且無暫時性字眼 → 視為硬退信
}
