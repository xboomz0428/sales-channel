/**
 * 退信掃描的純函式（不連資料庫、不連 IMAP），供 scanBounces / gmailImap 使用，並由
 * tests/bounce-scan.test.mjs 直接以 node --test 載入（本檔不可 import "@/..." 路徑別名）。
 */

/** 掃描進度：IMAP 信箱的 UIDVALIDITY ＋ 已處理過的最大 UID。存在 app_settings（key 見 BOUNCE_WATERMARK_KEY）。 */
export interface BounceWatermark {
  uidValidity: string;
  uid: number;
}

export const BOUNCE_WATERMARK_KEY = "BOUNCE_SCAN_WATERMARK";

/** app_settings.value（字串，格式 "<uidValidity>:<uid>"）→ 水位；格式不對回 null（視為從未掃過）。 */
export function parseWatermark(value: string | null | undefined): BounceWatermark | null {
  if (!value) return null;
  const m = /^\s*(\d+):(\d+)\s*$/.exec(String(value));
  if (!m) return null;
  const uid = Number(m[2]);
  if (!Number.isSafeInteger(uid) || uid < 0) return null;
  return { uidValidity: m[1], uid };
}

export function formatWatermark(w: BounceWatermark): string {
  return `${w.uidValidity}:${w.uid}`;
}

/**
 * 依目前信箱的 UIDVALIDITY 決定「只處理 UID 大於多少」的通知。
 * UIDVALIDITY 改變代表信箱 UID 重新編號，舊水位失效 → 回 0（視窗內全部重看）。
 */
export function effectiveSinceUid(w: BounceWatermark | null, currentUidValidity: string | null): number {
  if (!w || currentUidValidity == null) return 0;
  return w.uidValidity === String(currentUidValidity) ? w.uid : 0;
}

/**
 * 從 IMAP search 回傳的 UID 清單挑出本次要處理的：
 * 只留 > sinceUid 者、由小到大排序、取最舊的 max 封（超出的留給下次，水位只推進到已處理的最大 UID，不會跳過）。
 */
export function selectNewUids(uids: readonly number[], sinceUid: number, max: number): number[] {
  const out = [...new Set(uids.filter((u) => Number.isInteger(u) && u > sinceUid))].sort((a, b) => a - b);
  return max > 0 ? out.slice(0, max) : [];
}

/** 切成每批 size 個（IMAP 分批 fetch 用）。 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** 本次處理後的新水位：取「先前水位」與「本次處理過的最大 UID」較大者。 */
export function nextWatermark(prev: BounceWatermark | null, uidValidity: string, processedUids: readonly number[]): BounceWatermark {
  const base = prev && prev.uidValidity === uidValidity ? prev.uid : 0;
  const maxUid = processedUids.reduce((m, u) => (u > m ? u : m), base);
  return { uidValidity, uid: maxUid };
}

/**
 * 本次可安全推進水位的 UID：
 * 退信通知依 UID 由小到大處理，若在第 processedCount 封之後中斷，只有「小於第一封未處理通知」的 UID 算處理完
 * （含被內容過濾掉的非退信信）；全部處理完則回傳全部 fetchedUids。
 */
export function safeProcessedUids(fetchedUids: readonly number[], sortedNoticeUids: readonly number[], processedCount: number): number[] {
  if (processedCount >= sortedNoticeUids.length) return [...fetchedUids];
  const firstPending = sortedNoticeUids[processedCount];
  return fetchedUids.filter((u) => u < firstPending);
}

export interface ScanLoopResult {
  /** 依 UID 由小到大、連續處理完成的通知數 */
  processed: number;
  /** done=全部處理完；budget=時間預算用完提早停止；error=某封通知寫入失敗而中止 */
  stoppedBy: "done" | "budget" | "error";
  /** 可安全推進水位的 UID（見 safeProcessedUids） */
  doneUids: number[];
  /** 中止原因或存水位失敗的訊息 */
  error?: string;
}

/**
 * 依 UID 由小到大逐封處理退信通知，並分段推進水位：
 * - processNotice 丟錯（寫入失敗）→ 該封不算處理完，立即停止；水位只推進到它之前
 * - 每處理滿 checkpointEvery 封呼叫一次 checkpoint；結束時（不論原因）再呼叫一次
 * - 每封處理前檢查 now() 是否已超過 deadline，超過即停止（不等平台砍函式）
 * checkpoint 回傳錯誤字串（存水位失敗）時記在 error，不中止處理。
 */
export async function runScanLoop<N extends { uid: number }>(opts: {
  notices: readonly N[];
  fetchedUids: readonly number[];
  processNotice: (n: N) => Promise<void>;
  checkpoint: (doneUids: number[]) => Promise<string | null>;
  deadline: number;
  now?: () => number;
  checkpointEvery?: number;
}): Promise<ScanLoopResult> {
  const now = opts.now ?? Date.now;
  const every = Math.max(1, opts.checkpointEvery ?? 25);
  const notices = [...opts.notices].sort((a, b) => a.uid - b.uid);
  const noticeUids = notices.map((n) => n.uid);
  let processed = 0;
  let stoppedBy: ScanLoopResult["stoppedBy"] = "done";
  let error: string | undefined;
  let saveError: string | null = null;

  for (const n of notices) {
    if (now() >= opts.deadline) { stoppedBy = "budget"; break; }
    try {
      await opts.processNotice(n);
    } catch (e) {
      stoppedBy = "error";
      error = `退信通知 UID ${n.uid} 處理失敗，已中止本次掃描：${e instanceof Error ? e.message : String(e)}`;
      break;
    }
    processed++;
    if (processed % every === 0 && processed < notices.length) {
      saveError = (await opts.checkpoint(safeProcessedUids(opts.fetchedUids, noticeUids, processed))) || saveError;
    }
  }
  const doneUids = safeProcessedUids(opts.fetchedUids, noticeUids, processed);
  saveError = (await opts.checkpoint(doneUids)) || saveError;
  if (saveError) error = error ? `${error}；${saveError}` : saveError;
  return { processed, stoppedBy, doneUids, error };
}

/** Supabase 查詢回傳形狀（{ data, error }）。 */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * 以 .range(from, to) 分頁讀完全部列（PostgREST 單次最多 1000 列）。
 * 某頁不足 pageSize 即結束；任一頁出錯就丟錯（不把錯誤當成「沒有資料」）。
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
  maxPages = 200,
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const from = p * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`讀取寄出紀錄失敗：${error.message}`);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

/**
 * 寄出紀錄 → 「確實寄過的信箱」集合與「信箱 → 訊息 id」對照。
 * rows 須依 created_at 由新到舊排序：同一信箱寄過多封時，退信標記在最新那封。
 */
export function buildSentIndex(rows: readonly { id: string; to_email: string | null }[]): {
  sentSet: Set<string>;
  idByEmail: Map<string, string>;
} {
  const sentSet = new Set<string>();
  const idByEmail = new Map<string, string>();
  for (const m of rows) {
    const e = (m.to_email || "").trim().toLowerCase();
    if (!e) continue;
    sentSet.add(e);
    if (!idByEmail.has(e)) idByEmail.set(e, m.id);
  }
  return { sentSet, idByEmail };
}
