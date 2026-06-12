import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * 經濟部商工登記公示資料串接（GCIS OData，免 token）
 *
 * POST /api/gov/lookup
 *   { brand_id }            → 用品牌名稱/統編查詢並回寫
 *   { name } 或 { tax_id }  → 純查詢（回候選清單）
 *   { all: true }           → 批次比對所有缺統編的品牌（每次最多 15 筆）
 *
 * 已驗證端點：
 *  - 公司登記基本資料（依統編）  5F64D864-61CB-4D0D-8AD9-492047CC1EA6
 *  - 公司登記基本資料（依名稱）  6BBA2268-1367-4B42-9CCA-BC17499EBE8C
 * 註：獨資/合夥商號屬商業登記，GCIS 無穩定免費名稱查詢端點，
 *     需財政部稅籍資料集（整批 CSV 匯入，見 /api/gov/registry 規劃）。
 */

const GCIS = "https://data.gcis.nat.gov.tw/od/data/api";
const BY_TAXID = "5F64D864-61CB-4D0D-8AD9-492047CC1EA6";
const BY_NAME = "6BBA2268-1367-4B42-9CCA-BC17499EBE8C";

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
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text || text.includes("API不存在")) return [];
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function searchByTaxId(taxId: string): Promise<GcisCompany[]> {
  const filter = encodeURIComponent(`Business_Accounting_NO eq ${taxId}`);
  return gcisFetch(`${GCIS}/${BY_TAXID}?$format=json&$filter=${filter}&$skip=0&$top=3`);
}

async function searchByName(name: string): Promise<GcisCompany[]> {
  const filter = encodeURIComponent(`Company_Name like ${name} and Company_Status eq 01`);
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

async function matchBrand(
  supabase: SupabaseServerClient,
  brand: { id: string; name: string; brand_key?: string | null; tax_id?: string | null }
) {
  const queryName = (brand.brand_key || brand.name).slice(0, 12);
  const candidates = brand.tax_id ? await searchByTaxId(brand.tax_id) : await searchByName(queryName);

  if (candidates.length === 0) {
    return { brand: brand.name, matched: false, candidates: 0 };
  }

  const best = candidates[0];
  const conf = brand.tax_id ? "high" : confidence(brand.name, best.Company_Name);

  // 寫入政府名冊原始資料（保留來源紀錄）
  await supabase.from("gov_records").insert({
    source: "gcis_company",
    tax_id: best.Business_Accounting_NO,
    name: best.Company_Name,
    address: best.Company_Location || null,
    owner_name: best.Responsible_Name || null,
    extra: best,
    matched_brand_id: brand.id,
    match_confidence: conf,
  });

  // 高信心 → 回寫品牌（只補空欄位，不覆蓋人工資料）
  if (conf === "high") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (!brand.tax_id) patch.tax_id = best.Business_Accounting_NO;
    patch.registered_name = best.Company_Name;
    if (best.Responsible_Name) patch.owner_name = best.Responsible_Name;
    if (best.Capital_Stock_Amount) patch.capital = best.Capital_Stock_Amount;
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
    // 純查詢模式（不寫入）
    if (body.name || body.tax_id) {
      const candidates = body.tax_id
        ? await searchByTaxId(String(body.tax_id))
        : await searchByName(String(body.name).slice(0, 12));
      return NextResponse.json({ success: true, data: { candidates } });
    }

    // 單一品牌比對
    if (body.brand_id) {
      const { data: brand, error } = await supabase
        .from("brands")
        .select("id, name, brand_key, tax_id")
        .eq("id", body.brand_id)
        .single();
      if (error || !brand) {
        return NextResponse.json({ success: false, error: "品牌不存在" }, { status: 404 });
      }
      const result = await matchBrand(supabase, brand);
      return NextResponse.json({ success: true, data: result });
    }

    // 批次比對：缺統編的品牌（GCIS 有限流，每次 15 筆、間隔 400ms）
    if (body.all) {
      const { data: brands } = await supabase
        .from("brands")
        .select("id, name, brand_key, tax_id")
        .is("tax_id", null)
        .limit(15);

      const results = [];
      for (const b of brands || []) {
        results.push(await matchBrand(supabase, b));
        await new Promise((r) => setTimeout(r, 400));
      }
      const matched = results.filter((r) => r.matched).length;
      return NextResponse.json({
        success: true,
        data: { total: results.length, matched, low_confidence: results.length - matched, results },
      });
    }

    return NextResponse.json({ success: false, error: "請提供 brand_id、name、tax_id 或 all" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查詢失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
