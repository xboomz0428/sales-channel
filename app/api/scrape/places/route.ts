import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCfg } from "@/lib/settings";
import { logApiUsage } from "@/lib/api-usage";

/**
 * POST /api/scrape/places
 * Google Places (New) Text Search 採集 — 串流 NDJSON 進度回報
 * body: { keyword: string, city: string, maxPages?: number }
 *
 * 流程：Text Search → 去重（place_id / 店名+地址指紋）→ 連鎖歸戶（品牌 key）
 * → 寫入 stores + brands → 記錄 scrape_jobs
 *
 * 每個動作都透過 NDJSON 串流回報：
 *   { type: "step", text: string }        一般進度步驟
 *   { type: "store", ok: boolean, text }  每間門市處理結果
 *   { type: "done", data: {...} }         完成摘要
 *   { type: "error", text: string }       失敗
 */

export const maxDuration = 300;

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

function brandKey(name: string): string {
  let n = name.split(/[（(【]/)[0].trim().replace(/\s+/g, "");
  n = n.replace(/[-－·].{1,8}$/, "");
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
  const apiKey = await getCfg("GOOGLE_PLACES_API_KEY");
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

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const emit = async (msg: object) => {
    try {
      await writer.write(encoder.encode(JSON.stringify(msg) + "\n"));
    } catch {}
  };

  (async () => {
    const supabase = getSupabaseServerClient();
    let jobId: string | null = null;

    try {
      await emit({ type: "step", text: "建立採集任務紀錄…" });
      const { data: job } = await supabase
        .from("scrape_jobs")
        .insert({ keywords: [keyword], cities: [city], job_type: "places", status: "running" })
        .select()
        .single();
      jobId = job?.id ?? null;

      await emit({ type: "step", text: `開始採集：「${keyword}」×「${city}」，最多 ${maxPages * 20} 筆` });

      const places: PlaceResult[] = [];
      let pageToken: string | undefined;
      let requests = 0;

      for (let page = 0; page < maxPages; page++) {
        await emit({ type: "step", text: `第 ${page + 1} 頁：呼叫 Google Places API…` });
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
        logApiUsage("places_search", 1);

        if (!res.ok) {
          const detail = await res.text();
          throw new Error(`Places API ${res.status}: ${detail.slice(0, 300)}`);
        }
        const data = await res.json();
        const pagePlaces: PlaceResult[] = data.places || [];
        places.push(...pagePlaces);
        await emit({ type: "step", text: `第 ${page + 1} 頁：取得 ${pagePlaces.length} 筆` });
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }

      const uniquePlaces = [...new Map(places.map((p) => [p.id, p])).values()];
      const skippedDupGoogle = places.length - uniquePlaces.length;
      await emit({
        type: "step",
        text: `共 ${uniquePlaces.length} 間獨立店家${skippedDupGoogle > 0 ? `（Google 重複 ${skippedDupGoogle} 筆已去除）` : ""}，開始寫入資料庫…`,
      });

      // 批次預撈已存在的 place_id 與 (name+address_key)，避免迴圈內每次打 DB
      const placeIds = uniquePlaces.map((p) => p.id).filter(Boolean);
      const { data: existingByPlaceId } = await supabase
        .from("stores").select("place_id").in("place_id", placeIds);
      const existingPlaceIdSet = new Set((existingByPlaceId ?? []).map((r) => r.place_id));

      const addressKeys = uniquePlaces.map((p) => (p.formattedAddress || "").replace(/\s+/g, "")).filter(Boolean);
      const { data: existingByAddr } = await supabase
        .from("stores").select("address_key,name").in("address_key", addressKeys);
      const existingAddrSet = new Set((existingByAddr ?? []).map((r) => `${r.address_key}|${r.name}`));

      // 載入採集黑名單
      const { data: blRows } = await supabase.from("collection_blacklist").select("keyword");
      const blacklistWords = (blRows || []).map((r) => r.keyword.toLowerCase());

      let newStores = 0;
      let newBrands = 0;
      let linkedExisting = 0;
      let skippedExists = 0;
      let skippedBlacklist = 0;
      let brandErrors = 0;

      for (let i = 0; i < uniquePlaces.length; i++) {
        const p = uniquePlaces[i];
        const name = p.displayName?.text || "";
        const prefix = `[${i + 1}/${uniquePlaces.length}]`;
        if (!name) continue;
        if (p.businessStatus === "CLOSED_PERMANENTLY") {
          await emit({ type: "store", ok: false, text: `${prefix} — 跳過「${name}」（永久停業）` });
          continue;
        }
        // 黑名單過濾：名稱含任何黑名單關鍵字就跳過
        const nameLower = name.toLowerCase();
        const hitBlacklist = blacklistWords.find((kw) => nameLower.includes(kw));
        if (hitBlacklist) {
          skippedBlacklist++;
          await emit({ type: "store", ok: false, text: `${prefix} — 跳過「${name}」（黑名單：${hitBlacklist}）` });
          continue;
        }

        const address = p.formattedAddress || "";
        const storeCity = extractCity(address) || city;
        const key = brandKey(name) || name.replace(/\s+/g, "");
        if (!key) continue;
        const addressKey = address.replace(/\s+/g, "");

        if (existingPlaceIdSet.has(p.id)) {
          skippedExists++;
          await emit({ type: "store", ok: false, text: `${prefix} — 跳過「${name}」（place_id 已存在）` });
          continue;
        }

        if (existingAddrSet.has(`${addressKey}|${name}`)) {
          skippedExists++;
          await emit({ type: "store", ok: false, text: `${prefix} — 跳過「${name}」（地址重複）` });
          continue;
        }

        let brandId: string;
        const { data: existBrand } = await supabase
          .from("brands").select("id, store_count").eq("brand_key", key).maybeSingle();

        if (existBrand) {
          brandId = existBrand.id;
          await supabase.from("brands").update({
            store_count: (existBrand.store_count || 1) + 1,
            is_chain: true,
            updated_at: new Date().toISOString(),
          }).eq("id", brandId);
          linkedExisting++;
          await emit({ type: "store", ok: true, text: `${prefix} → 歸戶「${name}」到品牌「${key}」` });
        } else {
          const { data: nb, error: nbErr } = await supabase.from("brands").insert({
            name: key,
            brand_key: key,
            industry: keyword,
            store_count: 1,
            status: "new",
            priority_score: Math.min(50 + Math.round(Math.log10((p.userRatingCount || 1) + 1) * 12), 95),
          }).select().single();
          if (nbErr || !nb) {
            brandErrors++;
            await emit({ type: "store", ok: false, text: `${prefix} ✕ 品牌建立失敗「${key}」：${nbErr?.message || "未知"}` });
            continue;
          }
          brandId = nb.id;
          newBrands++;
          await emit({ type: "store", ok: true, text: `${prefix} ✓ 新增品牌「${key}」` });
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

        if (storeErr) {
          await emit({ type: "store", ok: false, text: `${prefix} ✕ 門市寫入失敗「${name}」：${storeErr.message}` });
        } else if (newStore) {
          newStores++;
          const addrShort = address.length > 18 ? address.slice(0, 18) + "…" : address;
          await emit({ type: "store", ok: true, text: `${prefix} ✓ 新增門市「${name}」（${addrShort}）` });
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

      const estCost = requests * 0.032;
      if (jobId) {
        await supabase.from("scrape_jobs").update({
          status: "done",
          progress: 100,
          result_count: uniquePlaces.length,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      }

      await emit({
        type: "done",
        data: {
          keyword, city,
          found: uniquePlaces.length,
          new_brands: newBrands,
          new_stores: newStores,
          linked_existing: linkedExisting,
          skipped_exists: skippedExists,
          skipped_blacklist: skippedBlacklist,
          skipped_dup_google: skippedDupGoogle,
          brand_errors: brandErrors,
          requests,
          est_cost_usd: Number(estCost.toFixed(3)),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "採集失敗";
      if (jobId) {
        await supabase.from("scrape_jobs").update({
          status: "error",
          error: msg,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
      await emit({ type: "error", text: msg });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
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
