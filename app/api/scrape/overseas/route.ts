import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiUsage } from '@/lib/api-usage';

/**
 * POST /api/scrape/overseas
 * 海外品牌採集（Google Places Text Search）
 * body: { keyword: string, city: string, country: 'JP' | 'UK' | 'CA', maxPages?: number }
 *
 * 與 /api/scrape/places 不同：
 *  - 存 brands.country = 'JP' | 'UK' | 'CA'
 *  - 存 brands.website, brands.phone, brands.email
 *  - 不做台灣工商/連鎖歸戶
 *  - brand_key 加國家前綴避免衝突
 *
 * 串流 NDJSON 格式同 /api/scrape/places
 */
export const maxDuration = 300;

// region 為 Google Places 用的 ISO 3166-1 代碼（英國為 gb）
const COUNTRY_CONFIG: Record<string, { lang: string; region: string; flag: string }> = {
  JP: { lang: 'ja',    region: 'jp', flag: '🇯🇵' },
  UK: { lang: 'en-GB', region: 'gb', flag: '🇬🇧' },
  CA: { lang: 'en-CA', region: 'ca', flag: '🇨🇦' },
};

function overseasBrandKey(country: string, name: string): string {
  // 去除括號後面、標點、空白，取前 20 字
  const clean = name
    .replace(/[（(【\[].*/u, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 20)
    .toLowerCase();
  return `${country}_${clean}`;
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: unknown;
}

function send(ctrl: ReadableStreamDefaultController, obj: object) {
  ctrl.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('scrape_jobs')
    .select('id,keywords,cities,status,result_count,error,created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [] });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: '未設定 GOOGLE_PLACES_API_KEY' }, { status: 500 });

  const body = await req.json();
  const keyword: string = (body.keyword || '').trim();
  const city: string = (body.city || '').trim();
  const country: string = (body.country || 'JP').toUpperCase();
  const maxPages: number = Math.min(body.maxPages ?? 3, 10);

  if (!keyword || !city) return NextResponse.json({ error: '請提供 keyword 與 city' }, { status: 400 });
  if (!COUNTRY_CONFIG[country]) return NextResponse.json({ error: '不支援的國家' }, { status: 400 });

  const cfg = COUNTRY_CONFIG[country];
  const supabase = getSupabaseServerClient();

  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        const textQuery = `${keyword} ${city}`;
        send(ctrl, { type: 'step', text: `${cfg.flag} 搜尋「${textQuery}」…` });

        let allPlaces: PlaceResult[] = [];
        let pageToken: string | undefined;
        let estCost = 0;

        for (let page = 0; page < maxPages; page++) {
          const reqBody: Record<string, unknown> = {
            textQuery,
            languageCode: cfg.lang,
            regionCode: cfg.region,
            maxResultCount: 20,
          };
          if (pageToken) reqBody.pageToken = pageToken;

          const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken',
            },
            body: JSON.stringify(reqBody),
          });
          estCost += 0.032;

          if (!res.ok) { send(ctrl, { type: 'error', text: `Places API 錯誤 (${res.status})` }); break; }
          const data = await res.json();
          const places: PlaceResult[] = data.places || [];
          allPlaces = allPlaces.concat(places);
          pageToken = data.nextPageToken;
          send(ctrl, { type: 'step', text: `第 ${page + 1} 頁：找到 ${places.length} 筆（累計 ${allPlaces.length}）` });
          if (!pageToken) break;
          await new Promise((r) => setTimeout(r, 600));
        }

        logApiUsage('places_search', maxPages).catch(() => {});

        let newBrands = 0, newStores = 0, skippedExists = 0, brandErrors = 0;

        for (const place of allPlaces) {
          const rawName = place.displayName?.text || '';
          if (!rawName) { send(ctrl, { type: 'store', ok: false, text: `  跳過（無名稱）` }); continue; }

          const bKey = overseasBrandKey(country, rawName);

          // 去重：brand_key 已存在就跳過
          const { data: existing } = await supabase
            .from('brands')
            .select('id')
            .eq('brand_key', bKey)
            .maybeSingle();

          if (existing) {
            skippedExists++;
            send(ctrl, { type: 'store', ok: true, text: `  ${rawName} — 已存在，跳過` });
            continue;
          }

          // 建立品牌
          const { data: brand, error: be } = await supabase
            .from('brands')
            .insert({
              name: rawName,
              brand_key: bKey,
              country,
              industry: keyword,
              status: 'new',
              website: place.websiteUri || null,
              phone: place.nationalPhoneNumber || null,
              priority_score: place.rating ? Math.round(place.rating * 15) : 50,
            })
            .select('id')
            .single();

          if (be || !brand) {
            brandErrors++;
            send(ctrl, { type: 'store', ok: false, text: `  ${rawName} — 寫入失敗: ${be?.message}` });
            continue;
          }

          // 建立 store 記錄（存地址與 Google 資料）
          if (place.formattedAddress) {
            await supabase.from('stores').insert({
              brand_id: brand.id,
              place_id: place.id,
              name: rawName,
              address: place.formattedAddress,
              city,
              phone: place.nationalPhoneNumber || null,
              website: place.websiteUri || null,
              rating: place.rating || null,
              review_count: place.userRatingCount || null,
            }).then(() => {});
          }

          newBrands++;
          newStores++;
          send(ctrl, { type: 'store', ok: true, text: `  ✓ ${rawName}${place.formattedAddress ? ` — ${place.formattedAddress.slice(0, 40)}` : ''}` });
        }

        // 記錄 scrape_job
        await supabase.from('scrape_jobs').insert({
          keywords: [keyword],
          cities: [city],
          job_type: `overseas_${country.toLowerCase()}`,
          status: 'done',
          result_count: allPlaces.length,
        }).then(() => {});

        send(ctrl, {
          type: 'done',
          data: {
            found: allPlaces.length,
            new_brands: newBrands,
            new_stores: newStores,
            skipped_exists: skippedExists,
            brand_errors: brandErrors,
            est_cost_usd: estCost.toFixed(3),
            country,
          },
        });
      } catch (err) {
        send(ctrl, { type: 'error', text: String(err) });
      } finally {
        ctrl.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  });
}
