import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBounceNotices } from "@/lib/channels/gmailImap";
import { classifyBounce, addToBlacklist } from "@/lib/outreach/blacklist";
import { saveSettings } from "@/lib/settings";
import {
  BOUNCE_WATERMARK_KEY,
  buildSentIndex,
  effectiveSinceUid,
  fetchAllPages,
  formatWatermark,
  nextWatermark,
  parseWatermark,
  runScanLoop,
  type BounceWatermark,
} from "@/lib/outreach/bounceScanCore";

/** 讀退信通知與比對寄出紀錄的天數視窗（兩者一致） */
const SCAN_DAYS = 7;
/** 每次掃描最多處理的退信通知封數（超過的留給下次；水位只推進到已處理的部分，不會跳過） */
const SCAN_MAX = 150;
/** 每處理滿幾封通知就存一次水位 */
const CHECKPOINT_EVERY = 25;
/** 預設時間預算（毫秒）：從 scanBounces 開始計時，超過就停止並存水位 */
const DEFAULT_TIME_BUDGET_MS = 60_000;

export interface ScanBouncesResult {
  scanned: number;
  hard: number;
  soft: number;
  policy: number;
  ignored: number;
  /** 寫入失敗中止、或存水位失敗時的訊息（其餘欄位仍為已完成部分的統計） */
  error?: string;
  /** 因時間預算或寫入失敗而留待下次掃描的通知封數 */
  deferred?: number;
}

class WriteError extends Error {}

/** 直接查 app_settings 讀水位（不走 getSettings 的快取與吞錯）；查詢失敗即 throw，不退回「從頭掃」。 */
async function readWatermark(): Promise<BounceWatermark | null> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", BOUNCE_WATERMARK_KEY)
    .maybeSingle();
  if (error) throw new Error(`讀取退信掃描進度失敗，已中止本次掃描：${error.message}`);
  return parseWatermark(data?.value ?? null);
}

/** 存水位：失敗重試一次，仍失敗回傳錯誤訊息（不 throw）。 */
async function writeWatermark(mark: BounceWatermark): Promise<string | null> {
  const value = formatWatermark(mark);
  let last = "";
  for (let i = 0; i < 2; i++) {
    const r = await saveSettings({ [BOUNCE_WATERMARK_KEY]: value }).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    if (r.ok) return null;
    last = r.error || "未知錯誤";
  }
  return `儲存退信掃描進度失敗（${value}）：${last}`;
}

/**
 * 掃 Gmail 信箱裡的退信通知（mailer-daemon / postmaster），
 * 比對近 7 天寄出的收件人，分類硬/軟退信並寫入黑名單。
 * 對方以安全／政策理由拒收（5.7.x，例如寄件網域缺 SPF/DKIM/DMARC）的，信箱本身有效：只把該封標為退信、不列入黑名單。
 *
 * 掃描進度：app_settings.BOUNCE_SCAN_WATERMARK 記錄「信箱 UIDVALIDITY:已處理的最大 UID」，每次只讀 UID 大於水位的通知。
 * - 通知依 UID 由小到大處理；任一寫入失敗即中止，水位只推進到連續處理完成的最後一封
 * - 每處理滿 25 封存一次水位；每次最多處理 150 封；超過時間預算（預設 60 秒）就停止並存水位
 *
 * 每位收件人的寫入順序是「先黑名單、後寄送紀錄」（理由見 processNotice 內註解）。因此失敗後重掃的後果是：
 * - 黑名單寫入失敗 → 第一次什麼都沒寫；寄送紀錄仍為 sent，重掃會再處理到這位收件人，計數不會重複
 * - 黑名單寫入成功、寄送紀錄更新失敗 → 重掃會再處理到：blocked 狀態不變，但 fail_count（硬）或 soft_count（軟）會再 +1，黑名單頁的累計次數會多 1
 * - 一封通知多位收件人，前面的已寫完、後面的寫入失敗 → 前面的收件人已進黑名單且紀錄已改為 bounced，但這次不計入統計、重掃時也不在比對清單內，LINE 通知的封數會少算
 * - 寄送紀錄已改為 bounced 的收件人，重掃時不在比對清單內，不會再被計一次
 * 其他仍可能重複計數的情況（無法完全避免）：
 * - 寫入成功但存水位失敗（或存水位前函式被平台中止）→ 最後一次成功存檔之後處理的通知，下次重掃時其中寄送紀錄仍為 sent 的收件人會再被計一次
 * - 兩次掃描同時執行（例如排程與手動按鈕同時觸發）→ 兩邊都可能讀到同一批通知
 * 水位值格式不正確時視同沒有水位（重看 7 天視窗），不會中止掃描
 */
export async function scanBounces(opts: { timeBudgetMs?: number } = {}): Promise<ScanBouncesResult> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const since = new Date(Date.now() - SCAN_DAYS * 86400_000).toISOString();
  // 寄出紀錄分頁讀完（PostgREST 單次上限 1000 列）；依寄出時間新→舊，退信標記在該信箱最新的一封
  const recent = await fetchAllPages<{ id: string; to_email: string | null }>((from, to) =>
    supabaseAdmin
      .from("outreach_messages")
      .select("id, to_email")
      .eq("channel", "EM")
      .eq("status", "sent")
      .gte("created_at", since)
      .not("to_email", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );

  if (recent.length === 0) return { scanned: 0, hard: 0, soft: 0, policy: 0, ignored: 0 };

  // 只認我們確實寄過的信箱，避免誤把退信內文引用到的簽名/退訂信箱（如自家地址）也封鎖
  const { sentSet, idByEmail } = buildSentIndex(recent);

  const prevMark = await readWatermark();
  const fetched = await fetchBounceNotices({ days: SCAN_DAYS, max: SCAN_MAX, sinceUid: prevMark?.uid ?? 0 });
  if (prevMark && fetched.uidValidity != null && effectiveSinceUid(prevMark, fetched.uidValidity) === 0) {
    // UIDVALIDITY 改變（UID 重新編號）→ 舊水位失效，重抓一次不帶水位
    const again = await fetchBounceNotices({ days: SCAN_DAYS, max: SCAN_MAX, sinceUid: 0 });
    fetched.fetchedUids = again.fetchedUids;
    fetched.uidValidity = again.uidValidity;
    fetched.notices = again.notices;
  }
  const uidValidity = fetched.uidValidity;

  let hard = 0, soft = 0, policy = 0, ignored = 0;
  const handled = new Set<string>();
  let saved = prevMark ? formatWatermark(prevMark) : "";

  const loop = await runScanLoop({
    notices: fetched.notices,
    fetchedUids: fetched.fetchedUids,
    deadline,
    checkpointEvery: CHECKPOINT_EVERY,
    checkpoint: async (doneUids) => {
      if (uidValidity == null) return null; // 拿不到 UIDVALIDITY 就不記進度（下次重看視窗）
      const mark = nextWatermark(prevMark, uidValidity, doneUids);
      if (formatWatermark(mark) === saved) return null;
      const err = await writeWatermark(mark);
      if (!err) saved = formatWatermark(mark);
      return err;
    },
    processNotice: async ({ text }) => {
      // 先整理出這封通知的收件人清單：精準抽出「真正失敗的收件人」（優先 DSN 標準欄位，再用 Gmail 中英文退信措辭）
      const failed = extractFailedRecipients(text).filter((e) => sentSet.has(e) && !handled.has(e));
      if (failed.length === 0) return;

      const kind = classifyBounce(text);
      if (kind === "none") { ignored += failed.length; return; }

      // 這封通知的統計先累計在區域變數，全部收件人寫入成功才併入總數；任一寫入失敗就 throw，整封視為未處理
      let h = 0, s = 0, p = 0;
      for (const email of failed) {
        // 寫入順序：先黑名單、後寄送紀錄。
        // 重掃時只比對 status='sent' 的寄送紀錄，若先把紀錄改成 bounced 再寫黑名單、而黑名單寫入失敗，
        // 下次重掃就找不到這個收件人，該信箱會永遠進不了黑名單。先寫黑名單則失敗時紀錄仍是 sent，重掃一定會再處理到。
        // 對方伺服器以安全／政策理由拒收：信箱有效、問題在寄件端 → 只標為退信（可重寄、不再被跟進），不列入黑名單
        if (kind !== "policy") {
          const r = await addToBlacklist(email, kind === "hard" ? "hard" : "soft", kind === "hard" ? "硬退信" : "軟退信");
          if (!r.ok) throw new WriteError(`${email}：${r.error || "寫入黑名單失敗"}`);
        }
        const id = idByEmail.get(email);
        if (id) {
          const detail = kind === "policy"
            ? "對方伺服器拒收（寄件網域驗證／政策問題；信箱有效，未列入黑名單）"
            : kind === "hard" ? "硬退信（信箱不存在）" : "軟退信（暫時性）";
          const { error } = await supabaseAdmin
            .from("outreach_messages")
            .update({ status: "bounced", error_detail: detail })
            .eq("id", id)
            .eq("status", "sent");
          if (error) throw new WriteError(`更新寄送紀錄失敗（${email}）：${error.message}`);
        }
        if (kind === "policy") p++; else if (kind === "hard") h++; else s++;
      }
      for (const email of failed) handled.add(email);
      hard += h; soft += s; policy += p;
    },
  });

  const result: ScanBouncesResult = { scanned: loop.processed, hard, soft, policy, ignored };
  const deferred = fetched.notices.length - loop.processed;
  if (deferred > 0) result.deferred = deferred;
  if (loop.error) result.error = loop.error;
  return result;
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
