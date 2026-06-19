import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logApiUsage } from "@/lib/api-usage";

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
  return gcisFetch(`${GCIS}/${BY_NAME}?$format=json&$filter=${filter}&$skip=0&$top=5`);
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

// ── Step 0A：爬官網找統一編號 ─────────────────────────────────────────────────
async function findTaxIdOnWebsite(website: string): Promise<string | null> {
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    const html = (await res.text()).slice(0, 300_000);
    const patterns = [
      /統[一]?編號?[：:\s]{0,3}(\d{8})/,
      /稅籍編號[：:\s]{0,3}(\d{8})/,
      /統\s*編[：:\s]{0,3}(\d{8})/,
      /公司統編[：:\s]{0,3}(\d{8})/,
      /GUI[：:\s]{0,5}(\d{8})/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1] && /^\d{8}$/.test(m[1])) return m[1];
    }
  } catch {}
  return null;
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
function getNameVariants(brandName: string): string[] {
  const raw = brandName.split(/[｜|│]/)[0].trim();
  const seen = new Set<string>();
  const push = (s: string) => { if (s.length >= 2 && !seen.has(s)) { seen.add(s); result.push(s); } };
  const result: string[] = [];
  push(raw);
  if (raw.length > 10) push(raw.slice(0, 10));
  if (raw.length > 7) push(raw.slice(0, 7));
  if (raw.length > 5) push(raw.slice(0, 5));
  push(raw.replace(VENUE_RE, "").trim());
  return result;
}

async function searchMygov(brandName: string): Promise<GcisCompany | null> {
  for (const q of getNameVariants(brandName)) {
    const result = await fetchMygovSearch(q);
    if (result) return result;
  }
  return null;
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
  brand: { id: string; name: string; brand_key?: string | null; tax_id?: string | null; website?: string | null },
  emit?: EmitStep
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

  // ── Step 3：爬官網找統一編號 ──────────────────────────
  if (!resolvedTaxId && brand.website && candidates.length === 0) {
    step(`[官網爬蟲] 掃描 ${brand.website}…`);
    const found = await findTaxIdOnWebsite(brand.website);
    if (found) {
      step(`[官網爬蟲] ✓ 找到統編 ${found}，查詢 GCIS…`);
      const taxCands = await searchByTaxId(found);
      if (taxCands.length > 0) {
        candidates = taxCands;
        resolvedTaxId = found;
        step(`[官網爬蟲] ✓ 命中 ${taxCands[0].Company_Name}`);
      }
    } else {
      step(`[官網爬蟲] 未找到統編`);
    }
  }

  // ── Step 4：Google CSE ──────────────────────────────
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
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
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
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
        candidates = await searchByTaxId(String(body.tax_id));
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
          const result = await matchBrand(supabase, { ...brand, website }, (text) => send({ type: "step", text }));
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

    // 批次比對（串流 NDJSON）
    if (body.all) {
      const industry = body.industry ? String(body.industry) : null;
      let brandQuery = supabase
        .from("brands")
        .select("id, name, brand_key, tax_id, brand_channels(channel, value), stores(website)")
        .is("tax_id", null);
      if (industry) brandQuery = brandQuery.ilike("industry", `%${industry}%`);
      const { data: brands } = await brandQuery;

      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const enc = new TextEncoder();
      const send = (obj: object) => writer.write(enc.encode(JSON.stringify(obj) + "\n"));

      (async () => {
        const list = brands || [];
        send({ type: "step", text: `共 ${list.length} 個品牌待比對…` });
        const results = [];
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          send({ type: "brand", text: `[${i + 1}/${list.length}] ${b.name}` });
          const website = extractWebsite(b as unknown as { stores?: { website?: string | null }[]; brand_channels?: { channel: string; value: string }[] });
          try {
            const r = await matchBrand(supabase, { ...b, website }, (text) => send({ type: "step", text }));
            results.push(r);
            const ok = r.matched;
            send({ type: "store", ok, text: ok ? `  ✓ ${r.registered_name}（${r.tax_id}）[${r.source}]` : `  ✗ ${b.name} 未比對到` });
          } catch (e) {
            results.push({ brand: b.name, matched: false });
            send({ type: "store", ok: false, text: `  ✗ ${b.name} 錯誤：${e instanceof Error ? e.message : "失敗"}` });
          }
          await new Promise((r) => setTimeout(r, 400));
        }
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
