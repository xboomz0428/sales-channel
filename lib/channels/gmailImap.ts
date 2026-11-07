import { ImapFlow } from "imapflow";
import { getCfgMany } from "@/lib/settings";
import { chunk, selectNewUids } from "@/lib/outreach/bounceScanCore";

/**
 * 用 Gmail app password 走 IMAP 讀信箱（取代失效的 Gmail API access token）。
 * 寄信用的同一組 GMAIL_USER / GMAIL_APP_PASSWORD 即可，不需另外 OAuth。
 */

/** 每批向 IMAP 取幾封原始內容（避免一次拉回大量信件） */
const FETCH_BATCH = 100;
/** 單封退信原始內容最多保留的字元數（退信通知可能附整封原信；DSN 狀態段在原信之前） */
const MAX_RAW_CHARS = 256_000;

const BOUNCE_TEXT_RE = /mailer-daemon|postmaster|delivery status|delivery to the following|退信|無法投遞|已遭封鎖|找不到地址/i;

export interface BounceNotice {
  uid: number;
  text: string;
}

export interface BounceNoticeResult {
  /** 信箱 UIDVALIDITY（字串；UID 只在同一個 UIDVALIDITY 內有意義） */
  uidValidity: string | null;
  /** 本次實際取回並檢查過的 UID（含被內容過濾掉的非退信信），供呼叫端推進掃描水位 */
  fetchedUids: number[];
  /** 判定為退信通知的信件 */
  notices: BounceNotice[];
}

/**
 * 讀近 days 天內、寄件者為 mailer-daemon / postmaster 的退信通知。
 * - sinceUid：只取 UID 大於此值者（掃描水位；0 = 不限）
 * - max：本次最多處理幾封，取最舊的 max 封（其餘留給下一次掃描）
 * - 每 FETCH_BATCH 封分批 fetch
 */
export async function fetchBounceNotices(opts: { days?: number; max?: number; sinceUid?: number } = {}): Promise<BounceNoticeResult> {
  const days = opts.days ?? 7;
  const max = opts.max ?? 500;
  const sinceUid = opts.sinceUid ?? 0;

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

  const result: BounceNoticeResult = { uidValidity: null, fetchedUids: [], notices: [] };
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      if (mb && typeof mb === "object" && mb.uidValidity != null) result.uidValidity = String(mb.uidValidity);

      // 優先用 Gmail 原生搜尋語法（精準鎖定退信寄件者）；只有伺服器不支援時才退回標準 IMAP since 搜尋。
      // （舊版在「搜不到退信」時也會退回 since 搜尋，等於把整個收件匣近 N 天的信全抓回來再過濾。）
      let found: number[] | false = false;
      try {
        found = await client.search(
          { gmailraw: `from:(mailer-daemon OR postmaster) newer_than:${days}d` } as Record<string, unknown>,
          { uid: true }
        );
      } catch {
        const since = new Date(Date.now() - days * 86400_000);
        found = await client.search({ since }, { uid: true });
      }
      const uids = Array.isArray(found) ? found : [];
      const pick = selectNewUids(uids, sinceUid, max);
      if (pick.length === 0) return result;

      for (const batch of chunk(pick, FETCH_BATCH)) {
        for await (const msg of client.fetch(batch, { source: true }, { uid: true })) {
          result.fetchedUids.push(msg.uid);
          let raw = msg.source ? msg.source.toString("utf-8") : "";
          if (!raw) continue;
          if (raw.length > MAX_RAW_CHARS) raw = raw.slice(0, MAX_RAW_CHARS);
          // 後援搜尋時，過濾掉非退信信
          if (!BOUNCE_TEXT_RE.test(raw)) continue;
          result.notices.push({ uid: msg.uid, text: raw });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return result;
}

/**
 * 相容舊介面：回傳近 N 天退信通知的原始內容文字（不使用掃描水位）。
 * 預設 7 天、最多 500 封，分批抓取。
 */
export async function fetchBounceTexts(days = 7, max = 500): Promise<string[]> {
  const r = await fetchBounceNotices({ days, max, sinceUid: 0 });
  return r.notices.map((n) => n.text);
}
