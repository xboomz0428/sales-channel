import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logApiUsage } from "@/lib/api-usage";
import { getCfg } from "@/lib/settings";

/**
 * 經濟部商工登記公示資料串接（GCIS OData，免 token）
 *
 * POST /api/gov/lookup
 *   { brand_id }               → 用品牌名稱/統編查詢並回寫
 *   { brand_id, manual_tax_id }→ Step B：手動指定統編，強制回寫
 *   { name } 或 { tax_id }     → 純查詢（回候選清單，供前端 Step B 用）
 *   { all: true }              → 批次比對所有缺統編的品牌
 *
 * 查詢策略（依序）：
 *   已有統編  直接 searchByTaxId
 *   0A        爬品牌官網找統一編號（若有 website）
 *   0B        Google Custom Search API 找公司名/統編（需 GOOGLE_CSE_ID）
 *   A         漸進式 GCIS 名稱搜尋（5字 → 去通路詞 → 3字）
 *   Fallback  本地 gov_registry（財政部稅籍，獨資/合夥商號）
 */

const GCIS = "https://data.gcis.nat.gov.tw/od/data/api";
const BY_TAXID = "5F64D864-61CB-4D0D-8AD9-492047CC1EA6";
const BY_NAME = "6BBA2268-1367-4B42-9CCA-BC17499EBE8C";

// 通路詞：出現在品牌名但通常不在公司登記名中
const VENUE_RE = /養生館|養生會館|足湯|足體|按摩|美容|美髮|洗髮|洗頭|SPA|spa|Spa|會館|行館|商行|工作室|造型|美學/g;

interface GcisCompany {
  Business_Accounting_NO: string;
  Company_Name: string;
  Company_Status?: string;
  Company_Status_Desc?: string;
  Capital_Stock_Amount?: number;
  Paid_In_Capital_Amount?: number;
  Responsible_Name?: string;
  Company_Location?: string;
  Register_Organization_Desc?: string;
  Company_Setup_Date?: string;
}

async function gcisFetch(url: string): Promise<GcisCompany[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.includes("API不存在") || text.includes("參數有誤")) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function searchByTaxId(taxId: string): Promise<GcisCompany[]> {
  const filter = encodeURIComponent(`Business_Accounting_NO eq '${taxId}'`);
  return gcisFetch(`${GCIS}/${BY_TAXID}?$format=json&$filter=${filter}&$skip=0&$top=3`);
}

// activeOnly=true 給自動比對用（只找在籍公司），false 給手動搜尋用（顯示全部）
async function searchByName(name: string, activeOnly = true): Promise<GcisCompany[]> {
  const statusClause = activeOnly ? ` and Company_Status eq '01'` : "";
  const filter = encodeURIComponent(`Company_Name like '%${name}%'${statusClause}`);
  return gcisFetch(`${GCIS}/${BY_NAME}?$format=json&$filter=${filter}&$skip=0&$top=10`);
}

// 經濟部 findbiz 商業登記（獨資/合夥，GCIS 查不到的商號）
async function searchFindbiz(name: string): Promise<GcisCompany[]> {
  try {
    const url = `https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?request_locale=zh_TW&fhl=zh_TW&queryType=cmpyType&queryString=${encodeURIComponent(name)}&isAlive=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // 解析搜尋結果：統一編號 8 碼 + 公司名稱
    const results: GcisCompany[] = [];
    const rows = html.matchAll(/<tr[^>]*class="[^"]*datarow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]*>/g, "").trim());
      // findbiz 表格欄位順序：統一編號、公司名稱、代表人、公司所在地、核准設立日期、狀態
      if (cells.length >= 4 && /^\d{8}$/.test(cells[0])) {
        results.push({
          Business_Accounting_NO: cells[0],
          Company_Name: cells[1] || name,
          Responsible_Name: cells[2] || undefined,
          Company_Location: cells[3] || undefined,
        });
      }
      if (results.length >= 5) break;
    }
    return results;
  } catch { return []; }
}

// 名稱比對信心度：登記名包含品牌名（或反之）→ high
function confidence(brandName: string, companyName: string): "high" | "low" {
  const a = brandName.replace(/\s+/g, "");
  const b = companyName.replace(/(股份|有限|公司|商行|企業社|工作室)/g, "").replace(/\s+/g, "");
  if (!a || !b) return "low";
  return b.includes(a) || a.includes(b) ? "high" : "low";
}

type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

// GCIS 查不到時改查本地稅籍鏡像表（獨資/合夥商號）
async function searchRegistry(supabase: SupabaseServerClient, name: string): Promise<GcisCompany[]> {
  const { data } = await supabase
    .from("gov_registry")
    .select("tax_id, name, address, capital, setup_date, organization_type")
    .ilike("name", `%${name}%`)
    .limit(5);
  return (data || []).map((r) => ({
    Business_Accounting_NO: r.tax_id,
    Company_Name: r.name,
    Company_Location: r.address || undefined,
    Capital_Stock_Amount: r.capital || undefined,
    Company_Setup_Date: r.setup_date || undefined,
    Register_Organization_Desc: r.organization_type || undefined,
  }));
}

// ── Step 0A：爬官網 — 同時抓統一編號 + 聯絡管道 ──────────────────────────────
const WEBSITE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const EMAIL_JUNK = /^(?:noreply|no-reply|support|webmaster|admin|postmaster)/i;
const FB_JUNK    = /^(?:sharer|share\.php|dialog|plugins|help|policies|legal|login|l\.php|photo|video|events|groups|pages|permalink|profile\.php|messages)/i;
const IG_JUNK    = /^(?:p|explore|accounts|stories|reels|tv|a|static)/i;

interface WebsiteScrape {
  taxId: string | null;
  channels: Record<string, string>; // channel → value
}

async function scrapeWebsite(website: string): Promise<WebsiteScrape> {
  const out: WebsiteScrape = { taxId: null, channels: {} };
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": WEBSITE_UA, "Accept": "text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return out;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return out;

    const buf = await res.arrayBuffer();
    let charset = (ct.match(/charset=([^\s;]+)/i) ?? [])[1] ?? "utf-8";
    charset = charset.toLowerCase().replace(/^x-/, "");
    if (charset === "big5-hkscs") charset = "big5";
    let html: string;
    try { html = new TextDecoder(charset, { fatal: false }).decode(buf).slice(0, 400_000); }
    catch { html = new TextDecoder("utf-8", { fatal: false }).decode(buf).slice(0, 400_000); }

    // 統一編號
    for (const p of [
      /統[一]?編號?[：:\s]{0,3}(\d{8})/,
      /稅籍編號[：:\s]{0,3}(\d{8})/,
      /統\s*編[：:\s]{0,3}(\d{8})/,
      /公司統編[：:\s]{0,3}(\d{8})/,
      /GUI[：:\s]{0,5}(\d{8})/i,
    ]) {
      const m = html.match(p);
      if (m?.[1] && /^\d{8}$/.test(m[1])) { out.taxId = m[1]; break; }
    }

    // Email
    for (const m of html.matchAll(/\b([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g)) {
      const e = m[1];
      if (!EMAIL_JUNK.test(e.split("@")[0]) && !/\.(png|jpg|gif|svg|webp|ico)$/i.test(e)) {
        out.channels.email = e; break;
      }
    }

    // 電話（tel: href 優先，再 regex）
    const telHref = html.match(/href=["']tel:([+0-9\-\s()]+)["']/i);
    if (telHref) {
      const n = telHref[1].replace(/[\s\-().+]/g, "").replace(/^886/, "0");
      if (/^0[2-9]/.test(n)) out.channels.phone = n;
    }
    if (!out.channels.phone) {
      const pm = html.match(/0[2-8]-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3}/);
      if (pm) out.channels.phone = pm[0];
    }

    // LINE
    const lineUrl = html.match(/https?:\/\/(?:line\.me\/(?:R\/)?(?:ti\/p\/|ti\/g2\/)[@%\w\-.]+|lin\.ee\/\w+|page\.line\.me\/[\w.\-]+)/i);
    if (lineUrl) out.channels.line = lineUrl[0];
    if (!out.channels.line) {
      const lineAt = html.match(/(?:line|賴|加好友|官方帳號)[^\n@＠]{0,40}[@＠]([\w.\-]{3,20})/i);
      if (lineAt) out.channels.line_id = "@" + lineAt[1];
    }

    // Facebook
    for (const m of html.matchAll(/https?:\/\/(?:www\.|m\.)?facebook\.com\/([\w.\-]{3,80})/gi)) {
      const path = m[1].split(/[?#]/)[0].replace(/\/$/, "");
      if (path && !FB_JUNK.test(path)) { out.channels.fb = `https://facebook.com/${path}`; break; }
    }

    // Instagram
    for (const m of html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([\w.\-]{1,30})/gi)) {
      const user = m[1].split(/[?#]/)[0].replace(/\/$/, "");
      if (user && !IG_JUNK.test(user)) { out.channels.ig = `https://instagram.com/${user}`; break; }
    }
  } catch {}
  return out;
}

// 將官網採集到的管道寫入 brand_channels（只補缺失）
async function saveWebsiteChannels(
  supabase: SupabaseServerClient,
  brandId: string,
  channels: Record<string, string>,
  sourceUrl: string
): Promise<string[]> {
  if (Object.keys(channels).length === 0) return [];
  const { data: exist } = await supabase
    .from("brand_channels").select("channel").eq("brand_id", brandId);
  const have = new Set((exist ?? []).map((r) => r.channel));
  const saved: string[] = [];
  for (const [ch, value] of Object.entries(channels)) {
    if (have.has(ch)) continue;
    const { error } = await supabase.from("brand_channels").insert({
      brand_id: brandId, channel: ch, value,
      source_url: sourceUrl, fetched_at: new Date().toISOString(),
    });
    if (!error) saved.push(ch);
  }
  return saved;
}

// ── Step 0B：Google CSE 找公司名/統編 ────────────────────────────────────────
async function googleCseFindOne(
  q: string,
  apiKey: string,
  cseId: string
): Promise<{ taxId?: string; companyName?: string } | null> {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(`"${q}" 統一編號 公司登記`)}&num=5&hl=zh-TW&gl=tw`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    logApiUsage("cse", 1);
    if (!res.ok) return null;
    const data = (await res.json()) as { error?: unknown; items?: { title?: unknown; snippet?: unknown }[] };
    if (data.error) return null;
    const text = (data.items || []).map((i) => `${i.title || ""} ${i.snippet || ""}`).join(" ");
    const taxMatch = text.match(/統[一]?編號?[：:\s]{0,3}(\d{8})/);
    if (taxMatch?.[1]) return { taxId: taxMatch[1] };
    const nameMatch = text.match(/[一-鿿]{2,15}(?:股份)?有限公司/);
    if (nameMatch?.[0]) return { companyName: nameMatch[0] };
    return null;
  } catch {
    return null;
  }
}

async function googleCseFind(
  brandName: string,
  apiKey: string,
  cseId: string
): Promise<{ taxId?: string; companyName?: string; query?: string } | null> {
  for (const q of getNameVariants(brandName)) {
    const result = await googleCseFindOne(q, apiKey, cseId);
    if (result) return { ...result, query: q };
  }
  return null;
}

// ── Step 0C-1：mygov.tw（統編快搜）直接查詢 ────────────────────────────────────
// 回傳完整 HTML 表格：公司名稱、統一編號、設立日期、營業地址、資本額、行業、登記人
async function fetchMygovSearch(query: string): Promise<GcisCompany | null> {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(`https://mygov.tw/search?q=${q}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 解析搜尋結果表格第一列 <tr><td>...</td>...</tr>
    const rowMatch = html.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>/);
    if (!rowMatch) return null;
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (m) => m[1].replace(/<[^>]*>/g, "").trim()
    );
    // 欄位順序：公司名稱、統一編號、設立日期、營業地址、資本額、行業、登記人
    if (cells.length < 5 || !cells[1]?.match(/^\d{8}$/)) return null;

    const setupRaw = (cells[2] || "").replace(/-/g, "");
    // mygov 日期格式 YYYYMMDD → 轉民國 YYYMMDD
    let rocDate: string | undefined;
    if (/^\d{8}$/.test(setupRaw)) {
      const y = parseInt(setupRaw.slice(0, 4)) - 1911;
      rocDate = `${y}${setupRaw.slice(4)}`;
    }

    const capitalStr = (cells[4] || "").replace(/[,，\s]/g, "");
    const capital = parseInt(capitalStr) || undefined;
    const owner = cells[6] && cells[6] !== "無" ? cells[6] : undefined;

    return {
      Business_Accounting_NO: cells[1],
      Company_Name: cells[0] || query,
      Company_Location: cells[3] || undefined,
      Capital_Stock_Amount: capital,
      Company_Setup_Date: rocDate,
      Responsible_Name: owner,
    };
  } catch {
    return null;
  }
}

// 共用：從品牌名產生漸進搜尋變體（全名 → 前10字 → 前7字 → 前5字 → 去通路詞）
// 工商登記名為純中文，先去除英文、數字、符號（保留中文與全形括號）。
function cleanGovName(s: string): string {
  return s
    .split(/[｜|│]/)[0]
    .replace(/[A-Za-z0-9]/g, "")               // 去英文與數字
    .replace(/[^一-鿿（）()]/g, "")     // 只保留中文與括號
    .trim();
}
function getNameVariants(brandName: string): string[] {
  const raw0 = brandName.split(/[｜|│]/)[0].trim();
  const cjk = cleanGovName(brandName);
  const raw = cjk.length >= 2 ? cjk : raw0;
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (s: string) => { const t = s.trim(); if (t.length >= 2 && !seen.has(t)) { seen.add(t); result.push(t); } };
  push(raw);
  if (raw.length > 10) push(raw.slice(0, 10));
  if (raw.length > 7) push(raw.slice(0, 7));
  if (raw.length > 5) push(raw.slice(0, 5));
  // 更積極：前 4 字、前 3 字（很多公司名只有 3-4 個中文字）
  if (raw.length > 4) push(raw.slice(0, 4));
  if (raw.length > 3) push(raw.slice(0, 3));
  push(raw.replace(VENUE_RE, "").trim());
  // 去通路詞後再試短版
  const stripped = raw.replace(VENUE_RE, "").trim();
  if (stripped.length > 4) push(stripped.slice(0, 4));
  if (stripped.length > 3) push(stripped.slice(0, 3));
  return result;
}

async function searchMygov(brandName: string): Promise<GcisCompany | null> {
  for (const q of getNameVariants(brandName)) {
    const result = await fetchMygovSearch(q);
    if (result) return result;
  }
  return null;
}

// ── Step 0C-1.5：Google → mygov.tw（用 Google 搜品牌名，找 mygov 頁面再爬詳情）───
// mygov.tw 自身搜尋有時命中率低，但 Google 索引更完整。
// 策略：Google CSE 搜 "品牌名 統一編號 site:mygov.tw" → 從結果提取統編或 mygov URL → 抓 mygov 詳情
async function googleSearchMygov(
  brandName: string,
  apiKey: string,
  cseId: string
): Promise<GcisCompany | null> {
  for (const q of getNameVariants(brandName)) {
    const result = await googleSearchMygovOne(q, apiKey, cseId);
    if (result) return result;
  }
  return null;
}

async function googleSearchMygovOne(
  query: string,
  apiKey: string,
  cseId: string
): Promise<GcisCompany | null> {
  try {
    // 搜尋時加上 mygov 關鍵字讓 Google 優先回傳 mygov.tw 結果
    const searchQ = `"${query}" 統一編號 site:mygov.tw`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(searchQ)}&num=5&hl=zh-TW&gl=tw`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    logApiUsage("cse", 1);
    if (!res.ok) return null;
    const data = (await res.json()) as { error?: unknown; items?: { title?: string; link?: string; snippet?: string }[] };
    if (data.error || !data.items?.length) return null;

    // 優先：從結果中找 mygov.tw 連結，提取統編
    for (const item of data.items) {
      const link = item.link || "";
      // mygov.tw URL 通常含統編：mygov.tw/company/12345678 或 /item/12345678
      const urlTaxMatch = link.match(/mygov\.tw\/(?:company|item)\/(\d{8})/);
      if (urlTaxMatch?.[1]) {
        // 用統編直接查 mygov 詳情頁
        const detail = await fetchMygovSearch(urlTaxMatch[1]);
        if (detail) return detail;
        // mygov search 沒結果就用統編直接查 GCIS
        const gcis = await searchByTaxId(urlTaxMatch[1]);
        if (gcis.length > 0) return gcis[0];
      }

      // 從 snippet 提取統編
      const snippetText = `${item.title || ""} ${item.snippet || ""}`;
      const taxMatch = snippetText.match(/統[一]?編號?[：:\s]{0,3}(\d{8})/);
      if (taxMatch?.[1]) {
        const detail = await fetchMygovSearch(taxMatch[1]);
        if (detail) return detail;
        const gcis = await searchByTaxId(taxMatch[1]);
        if (gcis.length > 0) return gcis[0];
      }
    }

    // 備用：snippet 裡只找到公司名+統編的數字
    for (const item of data.items) {
      const snippetText = `${item.title || ""} ${item.snippet || ""}`;
      const taxDigits = snippetText.match(/\b(\d{8})\b/);
      if (taxDigits?.[1] && (item.link || "").includes("mygov.tw")) {
        const detail = await fetchMygovSearch(taxDigits[1]);
        if (detail) return detail;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Step 0C-2：twincn.com（台灣公司網）直接查詢 ──────────────────────────────────
// 1) Lq.aspx?q=品牌名 → 從搜尋結果取得統編（item.aspx?no=XXXXXXXX）
// 2) item.aspx?no=統編 → 從 meta tags 取得公司名、地址、稅籍狀態
async function fetchTwincnSearch(
  q: string,
  ua: string
): Promise<{ taxId?: string; companyName?: string; address?: string } | null> {
  try {
    const searchRes = await fetch(`https://twincn.com/Lq.aspx?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!searchRes.ok) return null;
    const searchHtml = await searchRes.text();

    const noMatches = [...searchHtml.matchAll(/item\.aspx\?no=(\d{8})/g)];
    if (noMatches.length === 0) return null;
    const taxId = noMatches[0][1];

    const detailRes = await fetch(`https://twincn.com/item.aspx?no=${taxId}`, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!detailRes.ok) return { taxId };
    const detailHtml = await detailRes.text();

    const metaMatch = detailHtml.match(/content="([^"]*統編[^"]*)"/);
    const result: { taxId: string; companyName?: string; address?: string } = { taxId };
    if (metaMatch?.[1]) {
      const meta = metaMatch[1];
      const nameMatch = meta.match(/^([^,，]+)/);
      if (nameMatch) result.companyName = nameMatch[1].trim();
      const addrMatch = meta.match(/所在地[：:]([^,，"]+)/);
      if (addrMatch) result.address = addrMatch[1].trim();
    }
    return result;
  } catch {
    return null;
  }
}

async function searchTwincn(
  brandName: string
): Promise<{ taxId?: string; companyName?: string; address?: string } | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  for (const q of getNameVariants(brandName)) {
    const result = await fetchTwincnSearch(q, ua);
    if (result) return result;
  }
  return null;
}

// 從 stores/brand_channels 提取第一個網站 URL
function extractWebsite(b: {
  stores?: { website?: string | null }[];
  brand_channels?: { channel: string; value: string }[];
}): string | null {
  const ch = (b.brand_channels || []).find((c) => c.channel === "website")?.value || null;
  const st = (b.stores || []).find((s) => s.website)?.website || null;
  return ch || st || null;
}

type EmitStep = (text: string) => void;

async function matchBrand(
  supabase: SupabaseServerClient,
  brand: { id: string; name: string; brand_key?: string | null; tax_id?: string | null; website?: string | null; stores?: { address?: string }[] },
  emit?: EmitStep,
) {
  const step = (text: string) => emit?.(text);
  let source = "gcis_company";
  let candidates: GcisCompany[] = [];
  let resolvedTaxId = brand.tax_id || null;

  // ── 已有統編：直接查 ─────────────────────────────────
  if (resolvedTaxId) {
    step(`[GCIS] 已有統編 ${resolvedTaxId}，直接查詢…`);
    candidates = await searchByTaxId(resolvedTaxId);
  }

  // ── Step 1：mygov.tw（統編快搜，漸進式名稱搜尋）────────
  if (candidates.length === 0) {
    step(`[mygov.tw] 搜尋「${brand.name}」…`);
    const mygovResult = await searchMygov(brand.name);
    if (mygovResult) {
      candidates = [mygovResult];
      resolvedTaxId = mygovResult.Business_Accounting_NO;
      source = "mygov";
      step(`[mygov.tw] ✓ 命中 ${mygovResult.Company_Name}（${resolvedTaxId}）`);
    } else {
      step(`[mygov.tw] 未找到`);
    }
  }

  // ── Step 1.5：Google → mygov.tw（mygov 直搜失敗時，改透過 Google 找 mygov 頁面）──
  const googleApiKey = await getCfg("GOOGLE_PLACES_API_KEY");
  const cseId = await getCfg("GOOGLE_CSE_ID");
  if (candidates.length === 0 && googleApiKey && cseId) {
    step(`[Google→mygov] 搜尋「${brand.name}」…`);
    const gmResult = await googleSearchMygov(brand.name, googleApiKey, cseId);
    if (gmResult) {
      candidates = [gmResult];
      resolvedTaxId = gmResult.Business_Accounting_NO;
      source = "google_mygov";
      step(`[Google→mygov] ✓ 命中 ${gmResult.Company_Name}（${resolvedTaxId}）`);
    } else {
      step(`[Google→mygov] 未找到`);
    }
  }

  // ── Step 2：twincn.com ─────────────────────────────
  if (candidates.length === 0) {
    step(`[twincn.com] 搜尋「${brand.name}」…`);
    const twincnResult = await searchTwincn(brand.name);
    if (twincnResult?.taxId) {
      const taxCands = await searchByTaxId(twincnResult.taxId);
      if (taxCands.length > 0) {
        candidates = taxCands;
        resolvedTaxId = twincnResult.taxId;
        source = "twincn";
        step(`[twincn.com] ✓ 命中 ${taxCands[0].Company_Name}（${resolvedTaxId}）`);
      } else {
        candidates = [{
          Business_Accounting_NO: twincnResult.taxId,
          Company_Name: twincnResult.companyName || brand.name,
          Company_Location: twincnResult.address || undefined,
        }];
        resolvedTaxId = twincnResult.taxId;
        source = "twincn";
        step(`[twincn.com] ✓ 統編 ${resolvedTaxId}（無 GCIS 詳情）`);
      }
    } else {
      step(`[twincn.com] 未找到`);
    }
  }

  // ── Step 3：爬官網 — 統編 + 聯絡管道 ────────────────
  if (brand.website && candidates.length === 0) {
    step(`[官網爬蟲] 掃描 ${brand.website}…`);
    const scraped = await scrapeWebsite(brand.website);

    // 聯絡管道：寫入 DB，無論統編是否找到
    if (Object.keys(scraped.channels).length > 0) {
      const saved = await saveWebsiteChannels(supabase, brand.id, scraped.channels, brand.website);
      if (saved.length > 0) step(`[官網爬蟲] 順帶找到聯絡管道：${saved.join("、")}，已寫入`);
    }

    if (scraped.taxId && !resolvedTaxId) {
      step(`[官網爬蟲] ✓ 找到統編 ${scraped.taxId}，查詢 GCIS…`);
      const taxCands = await searchByTaxId(scraped.taxId);
      if (taxCands.length > 0) {
        candidates = taxCands;
        resolvedTaxId = scraped.taxId;
        step(`[官網爬蟲] ✓ 命中 ${taxCands[0].Company_Name}`);
      }
    } else if (!scraped.taxId && candidates.length === 0) {
      step(`[官網爬蟲] 未找到統編`);
    }
  }

  // ── Step 4：Google CSE ──────────────────────────────
  if (candidates.length === 0 && googleApiKey && cseId) {
    step(`[Google CSE] 漸進搜尋「${brand.name}」統編…`);
    const cseResult = await googleCseFind(brand.name, googleApiKey, cseId);
    if (cseResult?.taxId) {
      step(`[Google CSE] ✓ 搜尋詞「${cseResult.query}」找到統編 ${cseResult.taxId}，查詢 GCIS…`);
      const taxCands = await searchByTaxId(cseResult.taxId);
      if (taxCands.length > 0) {
        candidates = taxCands;
        resolvedTaxId = cseResult.taxId;
        step(`[Google CSE] ✓ 命中 ${taxCands[0].Company_Name}`);
      }
    } else if (cseResult?.companyName) {
      step(`[Google CSE] 搜尋詞「${cseResult.query}」找到公司名「${cseResult.companyName}」，查詢 GCIS…`);
      candidates = await searchByName(cseResult.companyName.slice(0, 8));
      if (candidates.length > 0) step(`[Google CSE] ✓ GCIS 命中 ${candidates[0].Company_Name}`);
    } else {
      step(`[Google CSE] 未找到`);
    }
  }

  // ── Step 5：漸進式 GCIS 名稱搜尋 ─────────────────────
  if (candidates.length === 0) {
    const baseName = brand.brand_key || brand.name;
    for (const q of getNameVariants(baseName)) {
      step(`[GCIS] 名稱搜尋「${q}」…`);
      candidates = await searchByName(q);
      if (candidates.length > 0) {
        step(`[GCIS] ✓ 命中 ${candidates[0].Company_Name}`);
        break;
      }
    }

    // ── Step 5.5：findbiz.nat.gov.tw（商業登記，GCIS 查不到的獨資/合夥商號）──
    if (candidates.length === 0) {
      for (const q of getNameVariants(baseName).slice(0, 3)) {
        step(`[findbiz] 搜尋「${q}」…`);
        candidates = await searchFindbiz(q);
        if (candidates.length > 0) {
          resolvedTaxId = candidates[0].Business_Accounting_NO;
          source = "findbiz";
          step(`[findbiz] ✓ 命中 ${candidates[0].Company_Name}（${resolvedTaxId}）`);
          break;
        }
      }
    }

    // ── Step 5.6：用門市地址輔助 Google 搜尋（品牌名＋地址關鍵字 → 統編）──
    if (candidates.length === 0 && googleApiKey && cseId) {
      const addr = (brand.stores || []).find((s) => s.address)?.address || "";
      const addrCity = addr.match(/[一-鿿]{2,3}[市縣]/)?.[0] || "";
      if (addrCity) {
        step(`[Google+地址] 搜尋「${baseName.slice(0, 8)} ${addrCity} 統一編號」…`);
        const q = encodeURIComponent(`"${cleanGovName(baseName).slice(0, 8)}" "${addrCity}" 統一編號`);
        try {
          const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${cseId}&q=${q}&num=5&hl=zh-TW&gl=tw`;
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          await logApiUsage("cse", 1);
          if (res.ok) {
            const data = (await res.json()) as { items?: { snippet?: string }[] };
            const text = (data.items || []).map((i) => i.snippet || "").join(" ");
            const taxMatch = text.match(/統[一]?編號?[：:\s]{0,3}(\d{8})/);
            if (taxMatch?.[1]) {
              step(`[Google+地址] ✓ 找到統編 ${taxMatch[1]}，查 GCIS…`);
              const taxCands = await searchByTaxId(taxMatch[1]);
              if (taxCands.length > 0) { candidates = taxCands; resolvedTaxId = taxMatch[1]; source = "google_addr"; }
              else {
                const mygov = await fetchMygovSearch(taxMatch[1]);
                if (mygov) { candidates = [mygov]; resolvedTaxId = taxMatch[1]; source = "google_addr_mygov"; }
              }
              if (candidates.length > 0) step(`[Google+地址] ✓ 命中 ${candidates[0].Company_Name}`);
            }
          }
        } catch { /* CSE 失敗 → 略過 */ }
      }
    }

    if (candidates.length === 0) {
      const rawName = baseName.split(/[｜|│]/)[0].trim();
      step(`[財政部稅籍] 查詢「${rawName.slice(0, 5)}」（獨資/合夥商號）…`);
      candidates = await searchRegistry(supabase, rawName.slice(0, 5));
      source = "fia_registry";
      if (candidates.length > 0) step(`[財政部稅籍] ✓ 命中 ${candidates[0].Company_Name}`);
      else step(`[財政部稅籍] 未找到`);
    }
  }

  if (candidates.length === 0) {
    // 記錄已比對過（即使未命中），下次批次會排到最後、優先處理沒比對過的
    await supabase.from("brands").update({ gov_checked_at: new Date().toISOString() }).eq("id", brand.id);
    return { brand: brand.name, matched: false, candidates: 0 };
  }

  const best = candidates[0];
  const conf = resolvedTaxId ? "high" : confidence(brand.name, best.Company_Name);

  // ── 寫入 gov_records ─────────────────────────────────
  const { data: existRec } = await supabase
    .from("gov_records")
    .select("id")
    .eq("matched_brand_id", brand.id)
    .eq("tax_id", best.Business_Accounting_NO)
    .maybeSingle();
  if (!existRec) {
    await supabase.from("gov_records").insert({
      source,
      tax_id: best.Business_Accounting_NO,
      name: best.Company_Name,
      address: best.Company_Location || null,
      owner_name: best.Responsible_Name || null,
      extra: best,
      matched_brand_id: brand.id,
      match_confidence: conf,
    });
  }

  // ── 回寫品牌 ─────────────────────────────────────────
  {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), gov_checked_at: new Date().toISOString() };
    if (conf === "high") {
      if (!brand.tax_id) patch.tax_id = best.Business_Accounting_NO;
      patch.registered_name = best.Company_Name;
      if (best.Responsible_Name) patch.owner_name = best.Responsible_Name;
      if (best.Capital_Stock_Amount) patch.capital = best.Capital_Stock_Amount;
      if (best.Company_Location) patch.company_address = best.Company_Location;
      if (best.Company_Setup_Date) patch.setup_date = best.Company_Setup_Date;
    } else {
      patch.registered_name = best.Company_Name;
    }
    await supabase.from("brands").update(patch).eq("id", brand.id);
  }

  return {
    brand: brand.name,
    matched: conf === "high",
    confidence: conf,
    registered_name: best.Company_Name,
    tax_id: best.Business_Accounting_NO,
    owner: best.Responsible_Name,
    candidates: candidates.length,
    source,
  };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "參數格式錯誤" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  try {
    // 純查詢模式（不寫入），供前端 Step B 手動搜尋用
    if (body.name || body.tax_id) {
      const nameQ = String(body.name || "").split(/[｜|│]/)[0].trim();
      let candidates: GcisCompany[] = [];

      if (body.tax_id) {
        const tid = String(body.tax_id).replace(/\D/g, "");
        candidates = await searchByTaxId(tid);
        // GCIS 公司查無（多為獨資/合夥商號）→ 改查 mygov.tw 統編
        if (candidates.length === 0) {
          const mygov = await fetchMygovSearch(tid);
          if (mygov) candidates = [mygov];
        }
      } else {
        // 漸進式（最多 8 字 → 去通路詞 → 3 字 → registry）；手動搜尋不限在籍狀態
        candidates = await searchByName(nameQ.slice(0, 8), false);
        if (candidates.length === 0) {
          const stripped = nameQ.replace(VENUE_RE, "").trim();
          if (stripped.length >= 2 && stripped !== nameQ) {
            candidates = await searchByName(stripped.slice(0, 8), false);
          }
        }
        if (candidates.length === 0 && nameQ.length > 3) {
          candidates = await searchByName(nameQ.slice(0, 3), false);
        }
        if (candidates.length === 0) {
          candidates = await searchRegistry(supabase, nameQ.slice(0, 5));
        }
      }
      return NextResponse.json({ success: true, data: { candidates } });
    }

    // Step B：手動指定統編，強制回寫（不受信心度限制）
    if (body.brand_id && body.manual_tax_id) {
      const { data: brand, error } = await supabase
        .from("brands")
        .select("id, name, brand_key, tax_id")
        .eq("id", String(body.brand_id))
        .single();
      if (error || !brand) {
        return NextResponse.json({ success: false, error: "品牌不存在" }, { status: 404 });
      }

      const cands = await searchByTaxId(String(body.manual_tax_id));
      if (cands.length === 0) {
        return NextResponse.json({ success: false, error: "找不到該統一編號的登記資料" }, { status: 404 });
      }
      const best = cands[0];

      const { data: existRec } = await supabase
        .from("gov_records")
        .select("id")
        .eq("matched_brand_id", brand.id)
        .eq("tax_id", best.Business_Accounting_NO)
        .maybeSingle();
      if (!existRec) {
        await supabase.from("gov_records").insert({
          source: "gcis_company",
          tax_id: best.Business_Accounting_NO,
          name: best.Company_Name,
          address: best.Company_Location || null,
          owner_name: best.Responsible_Name || null,
          extra: best,
          matched_brand_id: brand.id,
          match_confidence: "high",
        });
      }

      // 強制寫入 tax_id（不判斷是否已有舊值）
      const patch: Record<string, unknown> = {
        tax_id: best.Business_Accounting_NO,
        registered_name: best.Company_Name,
        updated_at: new Date().toISOString(),
      };
      if (best.Responsible_Name) patch.owner_name = best.Responsible_Name;
      if (best.Capital_Stock_Amount) patch.capital = best.Capital_Stock_Amount;
      if (best.Company_Location) patch.company_address = best.Company_Location;
      if (best.Company_Setup_Date) patch.setup_date = best.Company_Setup_Date;
      await supabase.from("brands").update(patch).eq("id", brand.id);

      return NextResponse.json({
        success: true,
        data: { brand: brand.name, matched: true, registered_name: best.Company_Name, tax_id: best.Business_Accounting_NO },
      });
    }

    // 單一品牌比對（串流 NDJSON）
    if (body.brand_id) {
      const { data: brand, error } = await supabase
        .from("brands")
        .select("id, name, brand_key, tax_id, brand_channels(channel, value), stores(website)")
        .eq("id", body.brand_id)
        .single();
      if (error || !brand) {
        return NextResponse.json({ success: false, error: "品牌不存在" }, { status: 404 });
      }
      const website = extractWebsite(brand as unknown as { stores?: { website?: string | null }[]; brand_channels?: { channel: string; value: string }[] });

      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const enc = new TextEncoder();
      const send = (obj: object) => writer.write(enc.encode(JSON.stringify(obj) + "\n"));

      (async () => {
        try {
          send({ type: "step", text: `開始比對「${brand.name}」…` });
          const result = await matchBrand(supabase, { ...brand, website, stores: ((brand as any).stores || []) as { address?: string }[] }, (text) => send({ type: "step", text }));
          send({ type: "done", data: result });
        } catch (e) {
          send({ type: "error", text: e instanceof Error ? e.message : "比對失敗" });
        } finally {
          writer.close();
        }
      })();

      return new Response(stream.readable, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
      });
    }

    // 批次比對（串流 NDJSON）— 支援 brand_ids（篩選後）或 all（全部缺統編）
    if (body.all || (Array.isArray(body.brand_ids) && (body.brand_ids as string[]).length > 0)) {
      type BatchBrand = { id: string; name: string; brand_key?: string | null; tax_id?: string | null; gov_checked_at?: string | null; brand_channels?: { channel: string; value: string }[]; stores?: { website?: string | null }[] };
      let brands: BatchBrand[] = [];
      const SELECT = "id, name, brand_key, tax_id, gov_checked_at, brand_channels(channel, value), stores(website, address)";
      // 排序：沒比對過(null)優先，其次最久沒比對的；本次最多處理 200 個
      const BATCH_LIMIT = 500;
      const byChecked = (a: BatchBrand, b: BatchBrand) =>
        (a.gov_checked_at ? new Date(a.gov_checked_at).getTime() : 0) - (b.gov_checked_at ? new Date(b.gov_checked_at).getTime() : 0);

      if (Array.isArray(body.brand_ids) && (body.brand_ids as string[]).length > 0) {
        // 前端傳入篩選後的 ID 清單；分批查避免 URL 過長，僅取缺統編者
        const allIds = body.brand_ids as string[];
        const CHUNK = 400;
        let fetched: BatchBrand[] = [];
        for (let i = 0; i < allIds.length; i += CHUNK) {
          const part = allIds.slice(i, i + CHUNK);
          const { data } = await supabase.from("brands").select(SELECT).in("id", part).is("tax_id", null);
          if (data) fetched = fetched.concat(data as unknown as BatchBrand[]);
        }
        fetched.sort(byChecked);
        brands = fetched.slice(0, BATCH_LIMIT);
      } else {
        const industry = body.industry ? String(body.industry) : null;
        let q = supabase
          .from("brands")
          .select(SELECT)
          .is("tax_id", null)
          .order("gov_checked_at", { ascending: true, nullsFirst: true })
          .limit(BATCH_LIMIT);
        if (industry) q = q.ilike("industry", `%${industry}%`);
        const { data } = await q;
        brands = (data as unknown as BatchBrand[]) ?? [];
      }

      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const enc = new TextEncoder();
      const send = (obj: object) => writer.write(enc.encode(JSON.stringify(obj) + "\n"));

      (async () => {
        const list = brands;
        const neverChecked = list.filter((b) => !b.gov_checked_at).length;
        const GOV_CONCURRENCY = Math.min(10, Math.max(3, Math.ceil(list.length / 30) * 3));
        send({ type: "step", text: `本次處理 ${list.length} 個（${GOV_CONCURRENCY} 並行，優先未比對過的 ${neverChecked} 個）…` });
        const results: any[] = [];
        let doneCount = 0;

        const processGov = async (idx: number) => {
          const b = list[idx];
          const website = extractWebsite(b as unknown as { stores?: { website?: string | null }[]; brand_channels?: { channel: string; value: string }[] });
          const stores = (b as any).stores || [];
          try {
            const r = await matchBrand(supabase, { ...b, website, stores }, (text) => send({ type: "step", text }));
            results.push(r);
            doneCount++;
            const ok = r.matched;
            send({ type: "store", ok, text: ok ? `  ✓ ${r.registered_name}（${r.tax_id}）[${r.source}]` : `  ✗ ${b.name} 未比對到` });
          } catch (e) {
            results.push({ brand: b.name, matched: false });
            doneCount++;
            send({ type: "store", ok: false, text: `  ✗ ${b.name} 錯誤：${e instanceof Error ? e.message : "失敗"}` });
          }
        };

        let running = 0;
        let nextIdx = 0;
        await new Promise<void>((resolve) => {
          const tryNext = () => {
            while (running < GOV_CONCURRENCY && nextIdx < list.length) {
              const idx = nextIdx++;
              running++;
              processGov(idx).finally(() => {
                running--;
                if (nextIdx >= list.length && running === 0) resolve();
                else tryNext();
              });
            }
          };
          if (list.length === 0) resolve();
          else tryNext();
        });

        const matched = results.filter((r) => r.matched).length;
        send({ type: "done", data: { total: results.length, matched, low_confidence: results.length - matched, results } });
        writer.close();
      })();

      return new Response(stream.readable, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
      });
    }

    return NextResponse.json({ success: false, error: "請提供 brand_id、name、tax_id 或 all" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查詢失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
