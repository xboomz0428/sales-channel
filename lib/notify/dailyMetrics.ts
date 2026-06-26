import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 平台累計數據快照 + 昨日對比 + 今日執行進度的彙整邏輯。
 * 供 /api/cron/daily-report（晚報）與手動觸發使用。
 */

export interface PlatformMetrics {
  brands: number;          // 品牌總數
  stores: number;          // 採集據點總數
  channels: number;        // 管道（聯絡方式）總數
  govRecords: number;      // 工商登記比對數
  contacts: number;        // 聯絡人總數
  emailsSent: number;      // 累計寄出郵件
  quotes: number;          // 報價單總數
  opportunities: number;   // 商機總數
  // 管道狀態分佈
  status: Record<string, number>;
}

const STATUS_KEYS = ["new", "contacted", "sampling", "quoting", "negotiating", "won", "lost"] as const;

const STATUS_LABEL: Record<string, string> = {
  new: "🆕 新名單",
  contacted: "📬 已聯繫",
  sampling: "🧪 打樣中",
  quoting: "💰 報價中",
  negotiating: "🤝 議約中",
  won: "✅ 成交",
  lost: "❌ 流失",
};

async function countRows(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

/** 取得當前平台累計數據 */
export async function collectPlatformMetrics(): Promise<PlatformMetrics> {
  const [brands, stores, channels, govRecords, contacts, emailsSent, quotes, opportunities] = await Promise.all([
    countRows("brands"),
    countRows("stores"),
    countRows("brand_channels"),
    countRows("gov_records"),
    countRows("contacts"),
    countRows("outreach_messages", (q) => q.eq("channel", "EM").eq("status", "sent")),
    countRows("quotes"),
    countRows("opportunities"),
  ]);

  // 狀態分佈（分頁取回避免 1000 筆上限）
  const status: Record<string, number> = {};
  for (const k of STATUS_KEYS) status[k] = 0;
  let offset = 0;
  while (true) {
    const { data } = await supabaseAdmin.from("brands").select("status").range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const b of data) {
      const s = (b.status as string) || "new";
      status[s] = (status[s] || 0) + 1;
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  return { brands, stores, channels, govRecords, contacts, emailsSent, quotes, opportunities, status };
}

/** 今日台灣時間 0 點的 UTC ISO（用於 created_at 篩選） */
export function twTodayStartIso(): string {
  const tzOffset = 8 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  return new Date(Math.floor((nowUtc + tzOffset) / 86400000) * 86400000 - tzOffset).toISOString();
}

/** 今日執行進度（今天台灣時間內 created 的活動） */
export async function collectTodayProgress(): Promise<Record<string, number>> {
  const since = twTodayStartIso();
  const [newBrands, newStores, newChannels, newGov, emails, logs, quotes, contacts] = await Promise.all([
    countRows("brands", (q) => q.gte("created_at", since)),
    countRows("stores", (q) => q.gte("created_at", since)),
    countRows("brand_channels", (q) => q.gte("created_at", since)),
    countRows("gov_records", (q) => q.gte("imported_at", since)),
    countRows("outreach_messages", (q) => q.eq("channel", "EM").eq("status", "sent").gte("sent_at", since)),
    countRows("outreach_logs", (q) => q.gte("created_at", since)),
    countRows("quotes", (q) => q.gte("created_at", since)),
    countRows("contacts", (q) => q.gte("created_at", since)),
  ]);
  return { newBrands, newStores, newChannels, newGov, emails, logs, quotes, contacts };
}

/** 讀昨日（或最近一筆）快照 */
export async function loadPrevSnapshot(beforeDate: string): Promise<PlatformMetrics | null> {
  const { data } = await supabaseAdmin
    .from("daily_metrics")
    .select("metrics, snapshot_date")
    .lt("snapshot_date", beforeDate)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.metrics ? (data.metrics as PlatformMetrics) : null;
}

/** 存今日快照（upsert by date） */
export async function saveSnapshot(date: string, metrics: PlatformMetrics): Promise<void> {
  await supabaseAdmin.from("daily_metrics").upsert(
    { snapshot_date: date, metrics: metrics as unknown as Record<string, unknown> },
    { onConflict: "snapshot_date" }
  );
}

/** 數字差異格式：+12 / -3 / ±0 */
function delta(now: number, prev: number | undefined): string {
  if (prev === undefined) return "";
  const d = now - prev;
  if (d > 0) return ` (▲+${d})`;
  if (d < 0) return ` (▼${d})`;
  return " (±0)";
}

/**
 * 組合彙整版 LINE 晚報訊息。
 * 包含：今日執行進度 + 平台數據（含昨日對比）+ 管道狀態。
 * 同時把今日快照寫入 daily_metrics。
 */
export async function buildDailyReport(extraNotes: string[] = []): Promise<string> {
  const todayDate = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // 台灣日期

  const [current, progress, prev] = await Promise.all([
    collectPlatformMetrics(),
    collectTodayProgress(),
    loadPrevSnapshot(todayDate),
  ]);

  const dateLabel = new Date().toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei", month: "long", day: "numeric", weekday: "short",
  });

  const lines: string[] = [
    "📊 HeroHerb 通路開發 — 每日彙整",
    `🗓 ${dateLabel}`,
  ];

  // ── 今日執行進度 ────────────────────────────────
  const progressItems: string[] = [];
  if (progress.newBrands) progressItems.push(`・採集品牌 +${progress.newBrands}`);
  if (progress.newStores) progressItems.push(`・採集據點 +${progress.newStores}`);
  if (progress.newChannels) progressItems.push(`・補齊管道 +${progress.newChannels}`);
  if (progress.newGov) progressItems.push(`・工商比對 +${progress.newGov}`);
  if (progress.emails) progressItems.push(`・寄出郵件 ${progress.emails} 封`);
  if (progress.logs) progressItems.push(`・聯繫紀錄 ${progress.logs} 筆`);
  if (progress.contacts) progressItems.push(`・新增聯絡人 +${progress.contacts}`);
  if (progress.quotes) progressItems.push(`・建立報價 ${progress.quotes} 張`);
  for (const n of extraNotes) progressItems.push(`・${n}`);

  lines.push("", "▍今日執行進度");
  lines.push(progressItems.length ? progressItems.join("\n") : "・今日無新活動");

  // ── 平台數據（昨日對比）──────────────────────────
  lines.push("", "▍平台數據（vs 昨日）");
  lines.push(`・品牌名單　${current.brands.toLocaleString()}${delta(current.brands, prev?.brands)}`);
  lines.push(`・採集據點　${current.stores.toLocaleString()}${delta(current.stores, prev?.stores)}`);
  lines.push(`・聯絡管道　${current.channels.toLocaleString()}${delta(current.channels, prev?.channels)}`);
  lines.push(`・工商登記　${current.govRecords.toLocaleString()}${delta(current.govRecords, prev?.govRecords)}`);
  lines.push(`・聯絡人　　${current.contacts.toLocaleString()}${delta(current.contacts, prev?.contacts)}`);
  lines.push(`・累計寄信　${current.emailsSent.toLocaleString()}${delta(current.emailsSent, prev?.emailsSent)}`);
  lines.push(`・報價單　　${current.quotes.toLocaleString()}${delta(current.quotes, prev?.quotes)}`);

  // ── 管道狀態分佈（昨日對比）─────────────────────
  lines.push("", "▍管道狀態");
  for (const k of STATUS_KEYS) {
    const cnt = current.status[k] || 0;
    if (cnt === 0 && !(prev?.status?.[k])) continue;
    lines.push(`・${STATUS_LABEL[k]}　${cnt}${delta(cnt, prev?.status?.[k])}`);
  }

  lines.push("", prev ? "" : "（首次快照，明日起顯示每日變化）", "cc.wesmilegood.com");

  // 存今日快照供明天對比
  await saveSnapshot(todayDate, current);

  return lines.filter((l) => l !== undefined).join("\n");
}
