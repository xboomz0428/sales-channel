import { ImapFlow } from "imapflow";
import { getCfgMany } from "@/lib/settings";

/**
 * 用 Gmail app password 走 IMAP 讀信箱（取代失效的 Gmail API access token）。
 * 寄信用的同一組 GMAIL_USER / GMAIL_APP_PASSWORD 即可，不需另外 OAuth。
 *
 * 回傳近 N 天內、寄件者為 mailer-daemon / postmaster 的退信信件「原始內容文字」，
 * 供 scanBounces 比對收件人並分類硬/軟退信。
 */
export async function fetchBounceTexts(days = 3, max = 80): Promise<string[]> {
  const c = await getCfgMany(["GMAIL_USER", "GMAIL_APP_PASSWORD"]);
  if (!c.GMAIL_USER || !c.GMAIL_APP_PASSWORD) {
    throw new Error("未設定 GMAIL_USER / GMAIL_APP_PASSWORD，無法讀取信箱");
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: c.GMAIL_USER, pass: c.GMAIL_APP_PASSWORD },
    logger: false,
    // 連線/握手逾時，避免卡死整個函式
    socketTimeout: 30_000,
  });

  const texts: string[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // 優先用 Gmail 原生搜尋語法（精準鎖定退信寄件者）
      let found: number[] | false = false;
      try {
        found = await client.search(
          { gmailraw: `from:(mailer-daemon OR postmaster) newer_than:${days}d` } as Record<string, unknown>,
          { uid: true }
        );
      } catch {
        found = false;
      }
      if (!found || found.length === 0) {
        // 後援：用標準 IMAP since 搜尋，再於下方以內容過濾
        const since = new Date(Date.now() - days * 86400_000);
        found = await client.search({ since }, { uid: true });
      }
      const uids = Array.isArray(found) ? found : [];
      if (uids.length === 0) return [];

      // 只取最近的 max 封
      const pick = uids.slice(-max);
      for await (const msg of client.fetch(
        pick,
        { source: true },
        { uid: true }
      )) {
        const raw = msg.source ? msg.source.toString("utf-8") : "";
        if (!raw) continue;
        // 後援搜尋時，過濾掉非退信信
        if (!/mailer-daemon|postmaster|delivery status|delivery to the following|退信|無法投遞|已遭封鎖|找不到地址/i.test(raw)) continue;
        texts.push(raw);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return texts;
}
