import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * 財政部營業（稅籍）登記資料匯入
 *
 * 獨資/合夥商號不在 GCIS 公司登記，需用財政部「營業(稅籍)登記資料」
 * 開放資料（BGMOPEN1.csv，https://data.gov.tw/dataset/9400）。
 * 檔案約數百 MB，無法即時查詢，採「篩選匯入本地表」策略：
 *
 * POST /api/gov/registry
 *   { url, city?, keyword?, maxRows? }  → 串流下載 CSV，邊讀邊篩選匯入
 *   { csv, city?, keyword? }            → 直接貼上 CSV 內容（小量手動匯入）
 *   city    過濾營業地址開頭（例「台中市」，自動含「臺」寫法）
 *   keyword 過濾營業人名稱包含（例「養生」）
 *   maxRows 最多匯入筆數（預設 5000，上限 20000）
 *
 * GET /api/gov/registry → { count, last_imported }
 *
 * 匯入後 /api/gov/lookup 會在 GCIS 查不到時自動改查本表。
 */

export const maxDuration = 300;

const MAX_ROWS_DEFAULT = 5000;
const MAX_ROWS_CAP = 20000;
const SCAN_CAP = 2_000_000; // 最多掃描的 CSV 行數（防止無篩選條件掃整檔逾時）
const BATCH_SIZE = 500;

// BGMOPEN1.csv 欄位（依表頭名稱定位，順序變動也能對上）
const COL = {
  address: "營業地址",
  taxId: "統一編號",
  hqTaxId: "總機構統一編號",
  name: "營業人名稱",
  capital: "資本額",
  setupDate: "設立日期",
  orgType: "組織別名稱",
  industryCode: "行業代號",
};

// 簡易 CSV 行解析（處理雙引號包覆欄位）
function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuote = false;
      } else cur += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

interface RegistryRow {
  tax_id: string;
  name: string;
  address: string | null;
  city: string | null;
  capital: number | null;
  setup_date: string | null;
  organization_type: string | null;
  industry_codes: string[];
}

function rowCity(address: string): string | null {
  const m = address.match(/^(臺|台)?(北|中|南|東)?[一-鿿]{0,2}(市|縣)/);
  return m ? m[0].replace(/^臺/, "台") : null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "參數格式錯誤" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const csvText = typeof body.csv === "string" ? body.csv : "";
  if (!url && !csvText) {
    return NextResponse.json({ success: false, error: "請提供 url 或 csv" }, { status: 400 });
  }
  if (url && !/^https:\/\//.test(url)) {
    return NextResponse.json({ success: false, error: "url 必須是 https 連結" }, { status: 400 });
  }

  // 城市過濾：「台中市」也要匹配「臺中市」
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const cityVariants = city ? [city, city.replace(/^台/, "臺"), city.replace(/^臺/, "台")] : [];
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const maxRows = Math.min(Math.max(Number(body.maxRows) || MAX_ROWS_DEFAULT, 1), MAX_ROWS_CAP);

  const supabase = getSupabaseServerClient();

  let header: string[] | null = null;
  let idx: Record<keyof typeof COL, number> | null = null;
  let scanned = 0;
  let matched = 0;
  let imported = 0;
  let batch: RegistryRow[] = [];
  const seen = new Set<string>(); // 同檔內去重（總/分支機構同統編多列）

  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await supabase.from("gov_registry").upsert(batch, { onConflict: "tax_id" });
    if (error) throw new Error(`寫入失敗：${error.message}`);
    imported += batch.length;
    batch = [];
  };

  const handleLine = (line: string): boolean => {
    // 回傳 false 表示已達上限、停止讀取
    const cleaned = line.charCodeAt(0) === 0xfeff ? line.slice(1) : line; // 檔首 BOM
    const cells = parseCsvLine(cleaned.trim());
    if (!header) {
      header = cells;
      idx = {
        address: header.indexOf(COL.address),
        taxId: header.indexOf(COL.taxId),
        hqTaxId: header.indexOf(COL.hqTaxId),
        name: header.indexOf(COL.name),
        capital: header.indexOf(COL.capital),
        setupDate: header.indexOf(COL.setupDate),
        orgType: header.indexOf(COL.orgType),
        industryCode: header.indexOf(COL.industryCode),
      };
      if (idx.taxId < 0 || idx.name < 0) {
        throw new Error(`CSV 表頭缺少「${COL.taxId}」或「${COL.name}」欄位，請確認是 BGMOPEN1 格式`);
      }
      return true;
    }
    scanned++;
    if (scanned > SCAN_CAP) return false;

    const taxId = (cells[idx!.taxId] || "").trim();
    const name = (cells[idx!.name] || "").trim();
    if (!/^\d{8}$/.test(taxId) || !name) return true;
    const address = (cells[idx!.address] || "").trim();

    if (cityVariants.length && !cityVariants.some((c) => address.startsWith(c))) return true;
    if (keyword && !name.includes(keyword)) return true;
    if (seen.has(taxId)) return true;
    seen.add(taxId);

    // 行業代號散落在「行業代號」「行業代號1」…等欄位
    const codes: string[] = [];
    header!.forEach((h, i) => {
      if (h.startsWith(COL.industryCode) && cells[i]?.trim()) codes.push(cells[i].trim());
    });

    batch.push({
      tax_id: taxId,
      name,
      address: address || null,
      city: address ? rowCity(address) : null,
      capital: idx!.capital >= 0 && cells[idx!.capital]?.trim() ? Number(cells[idx!.capital]) || null : null,
      setup_date: idx!.setupDate >= 0 ? cells[idx!.setupDate]?.trim() || null : null,
      organization_type: idx!.orgType >= 0 ? cells[idx!.orgType]?.trim() || null : null,
      industry_codes: codes,
    });
    matched++;
    return matched < maxRows;
  };

  try {
    if (csvText) {
      for (const line of csvText.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (!handleLine(line)) break;
        if (batch.length >= BATCH_SIZE) await flush();
      }
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(280_000) });
      if (!res.ok || !res.body) throw new Error(`下載失敗：HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let stop = false;
      while (!stop) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          if (!handleLine(line)) {
            stop = true;
            break;
          }
          if (batch.length >= BATCH_SIZE) await flush();
        }
      }
      if (!stop && buf.trim()) handleLine(buf);
      reader.cancel().catch(() => {});
    }
    await flush();

    return NextResponse.json({
      success: true,
      data: {
        scanned,
        matched,
        imported,
        hit_scan_cap: scanned > SCAN_CAP,
        filters: { city: city || null, keyword: keyword || null, maxRows },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "匯入失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { count } = await supabase.from("gov_registry").select("*", { count: "exact", head: true });
    const { data: latest } = await supabase
      .from("gov_registry")
      .select("imported_at")
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      data: { count: count || 0, last_imported: latest?.imported_at || null },
    });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}
