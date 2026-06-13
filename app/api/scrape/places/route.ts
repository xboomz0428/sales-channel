import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { cleanEnv } from "@/lib/env";

/**
 * POST /api/scrape/places
 * Google Places (New) Text Search 採集
 * body: { keyword: string, city: string, maxPages?: number }
 *
 * 流程：Text Search → 去重（place_id / 店名+地址指紋）→ 連鎖歸戶（品牌 key）
 * → 寫入 stores + brands → 記錄 scrape_jobs
 */

const TAIWAN_CITIES = [
  "台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "台東縣", "澎湖縣", "金門縣", "連江縣",
  "臺北市", "臺中市", "臺南市", "臺東縣",
];

function extractCity(address: string): string {
  for (const c of TAIWAN_CITIES) {
    if (address.includes(c)) return c.replace("臺", "台");
  }
  return "";
}

// 品牌歸戶 key：去空白、去括號註記、去結尾分店名（XX店/XX館/XX分店）
function brandKey(name: string): string {
  let n = name.split(/[（(【]/)[0].trim().replace(/\s+/g, "");
  n = n.replace(/[-－·].{1,8}$/, ""); // 「品牌-大安店」
  const m = n.match(/^(.{2,}?)(旗艦店|分店|[一-龥]{1,3}店)$/);
  if (m && m[1].length >= 2) n = m[1];
  return n;
}

interface PlaceReview {
  rating?: number;
  text?: { text: string; languageCode: string };
  authorAttribution?: { displayName: string; uri?: string };
  relativePublishTimeDescription?: string;
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  reviews?: PlaceReview[];
}

export async function POST(request: NextRequest) {
  const apiKey = cleanEnv("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "GOOGLE_PLACES_API_KEY 未設定" },
      { status: 500 }
    );
  }

  let keyword = "";
  let city = "";
  let maxPages = 1;
  try {
    const body = await request.json();
    keyword = String(body.keyword || "").trim();
    city = String(body.city || "").trim();
    maxPages = Math.min(Math.max(Number(body.maxPages) || 1, 1), 3);
  } catch {
    return NextResponse.json({ success: false, error: "參數格式錯誤" }, { status: 400 });
  }
  if (!keyword || !city) {
    return NextResponse.json({ success: false, error: "請提供 keyword 與 city" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // 建立採集任務紀錄
  const { data: job } = await supabase
    .from("scrape_jobs")
    .insert({ keywords: [keyword], cities: [city], job_type: "places", status: "running" })
    .select()
    .single();

  try {
    // ── 1. Places Text Search（分頁最多 maxPages × 20 筆）──
    const places: PlaceResult[] = [];
    let pageToken: string | undefined;
    let requests = 0;

    for (let page = 0; page < maxPages; page++) {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.googleMapsUri,places.reviews,nextPageToken",
        },
        body: JSON.stringify({
          textQuery: `${keyword} ${city}`,
          languageCode: "zh-TW",
          regionCode: "TW",
          pageSize: 20,
          ...(pageToken ? { pageToken } : {}),
        }),
      });
      requests++;

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Places API ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      places.push(...(data.places || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    // ── 2. 去重 + 寫入 ──
    // Google 跨頁有時重複回傳相同 place_id，先在 JS 層去重
    const uniquePlaces = [...new Map(places.map((p) => [p.id, p])).values()];
    const skippedDupGoogle = places.length - uniquePlaces.length;

    let newStores = 0;
    let newBrands = 0;
    let linkedExisting = 0;
    let skippedExists = 0;
    let brandErrors = 0;

    for (const p of uniquePlaces) {
      const name = p.displayName?.text || "";
      if (!name) continue;
      if (p.businessStatus === "CLOSED_PERMANENTLY") continue;

      const address = p.formattedAddress || "";
      const storeCity = extractCity(address) || city;
      const key = brandKey(name) || name.replace(/\s+/g, "");
      if (!key) continue;
      const addressKey = address.replace(/\s+/g, "");

      // place_id 已存在 → 跳過（去重第一層）
      const { data: existStore } = await supabase
        .from("stores")
        .select("id, brand_id")
        .eq("place_id", p.id)
        .maybeSingle();
      if (existStore) { skippedExists++; continue; }

      // 店名+地址指紋（去重第二層，place_id 變動時防重複）
      const { data: fpStore } = await supabase
        .from("stores")
        .select("id")
        .eq("address_key", addressKey)
        .eq("name", name)
        .maybeSingle();
      if (fpStore) { skippedExists++; continue; }

      // 連鎖歸戶：找同 brand_key 的品牌
      let brandId: string;
      const { data: existBrand } = await supabase
        .from("brands")
        .select("id, store_count")
        .eq("brand_key", key)
        .maybeSingle();

      if (existBrand) {
        brandId = existBrand.id;
        await supabase
          .from("brands")
          .update({ store_count: (existBrand.store_count || 1) + 1, is_chain: true, updated_at: new Date().toISOString() })
          .eq("id", brandId);
        linkedExisting++;
      } else {
        const { data: nb, error: nbErr } = await supabase
          .from("brands")
          .insert({
            name: key,
            brand_key: key,
            industry: keyword,
            store_count: 1,
            status: "new",
            // 初始評分：有評論數的店家給較高分（之後可由評分引擎覆寫）
            priority_score: Math.min(50 + Math.round(Math.log10((p.userRatingCount || 1) + 1) * 12), 95),
          })
          .select()
          .single();
        if (nbErr || !nb) { brandErrors++; continue; }
        brandId = nb.id;
        newBrands++;
      }

      const { data: newStore, error: storeErr } = await supabase.from("stores").insert({
        brand_id: brandId,
        place_id: p.id,
        name,
        address,
        address_key: addressKey,
        city: storeCity,
        phone: p.nationalPhoneNumber || null,
        website: p.websiteUri || null,
        rating: p.rating ?? null,
        review_count: p.userRatingCount ?? null,
        gmaps_url: p.googleMapsUri || null,
        raw: p,
      }).select("id").single();

      if (!storeErr && newStore) {
        newStores++;
        // 寫入最新評論（最多 5 筆）
        if (p.reviews?.length) {
          const reviewRows = p.reviews.slice(0, 5).map((r) => ({
            store_id: newStore.id,
            rating: r.rating ?? null,
            text: r.text?.text || null,
            author_name: r.authorAttribution?.displayName || null,
            relative_time: r.relativePublishTimeDescription || null,
          }));
          await supabase.from("store_reviews").insert(reviewRows);
        }
      }
    }

    // ── 3. 任務完成 ──
    const estCost = requests * 0.032; // Text Search Pro 約 $32/千次
    if (job) {
      await supabase
        .from("scrape_jobs")
        .update({ status: "done", progress: 100, result_count: places.length, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        keyword,
        city,
        found: uniquePlaces.length,
        new_brands: newBrands,
        new_stores: newStores,
        linked_existing: linkedExisting,
        skipped_exists: skippedExists,
        skipped_dup_google: skippedDupGoogle,
        brand_errors: brandErrors,
        requests,
        est_cost_usd: Number(estCost.toFixed(3)),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "採集失敗";
    if (job) {
      await supabase
        .from("scrape_jobs")
        .update({ status: "error", error: msg, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * GET /api/scrape/places — 最近的採集任務清單
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("*")
      .eq("job_type", "places")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}
