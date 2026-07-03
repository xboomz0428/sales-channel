import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logApiUsage } from "@/lib/api-usage";
import { getCfg } from "@/lib/settings";

/**
 * POST /api/enrich/channels
 * 補齊品牌聯絡管道 — 串流 NDJSON 進度回報
 *
 *   { brand_id }                → 單一品牌
 *   { brand_ids: string[] }    → 指定多個品牌（最多 50）
 *   { all: true, industry? }   → 批次（整個類別）
 *
 * 來源：
 *  1. stores（Places 採集結果）→ phone / website / map
 *  2. 抓取品牌官網 HTML → 解析 FB / IG / LINE / Email 連結
 *
 * NDJSON 事件格式（與 enrich/places 一致）：
 *   { type: "step",  text: string }
 *   { type: "store", ok: boolean, text: string }
 *   { type: "done",  data: { total, enriched } }
 *   { type: "error", text: string }
 */

export const maxDuration = 300;

type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

const LINK_PATTERNS: [string, RegExp][] = [
  ["fb", /https?:\/\/(?:www\.|m\.|zh-tw\.)?facebook\.com\/[A-Za-z0-9_.\-/%]+/i],
  ["ig", /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.\-/%]+/i],
  ["line", /https?:\/\/(?:line\.me\/R\/ti\/p\/[@\w\-%]+|lin\.ee\/[A-Za-z0-9]+|page\.line\.me\/[A-Za-z0-9_.\-]+)/i],
  ["email", /mailto:([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/i],
];

// ── Email 深度擷取：Cloudflare 混淆解碼、HTML 實體、[at]/(dot) 反混淆、聯絡前綴優先 ──
const EMAIL_JUNK = /noreply|no-reply|donotreply|example\.|sentry|wixpress|\.wp\.com|godaddy|yourdomain|your-?email|yourmail|test@|abc@|sample|@2x|u00|core-js|schema\.org|w3\.org|sentry\.io|@sentry|placeholder/i;
const EMAIL_PREF = /^(info|service|contact|cs|sales|mail|hello|support|inquiry|enquiry|customer|marketing|business|office|admin)@/i;

function decodeCfEmail(hex: string): string {
  try {
    const r = parseInt(hex.substr(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ r);
    return out;
  } catch { return ""; }
}
function decodeEntities(s: string): string {
  return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
          .replace(/&amp;/g, "&");
}
function deobfuscateEmail(s: string): string {
  return s
    .replace(/\s*[[(（{]\s*(?:at|＠)\s*[\])）}]\s*/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*[[(（{]\s*(?:dot|點)\s*[\])）}]\s*/gi, ".")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/＠/g, "@");
}
// 從 HTML 擷取所有 email（含 Cloudflare 混淆、mailto、內文），去 junk，聯絡前綴優先
function extractEmails(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/data-cfemail="([0-9a-fA-F]{6,})"/gi)) { const e = decodeCfEmail(m[1]); if (e.includes("@")) set.add(e); }
  for (const m of html.matchAll(/mailto:([^"'?>\s&]+@[^"'?>\s&]+)/gi)) set.add(decodeEntities(m[1]));
  const text = deobfuscateEmail(decodeEntities(html));
  for (const m of text.matchAll(/[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g)) set.add(m[0]);
  const list = [...set]
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(e)
      && !EMAIL_JUNK.test(e)
      && !/\.(png|jpe?g|gif|svg|webp|ico|js|css|json|xml|woff2?)$/i.test(e));
  return [...new Set(list)].sort((a, b) => (EMAIL_PREF.test(a) ? 0 : 1) - (EMAIL_PREF.test(b) ? 0 : 1));
}

async function fetchSiteLinks(url: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HeroHerbBot/1.0)" },
      signal: AbortSignal.timeout(5000), // 加速：慢站直接放棄（原 8s）
      redirect: "follow",
    });
    if (!res.ok) return found;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return found;
    const html = (await res.text()).slice(0, 500_000);
    for (const [ch, re] of LINK_PATTERNS) {
      const m = html.match(re);
      if (m) found[ch] = ch === "email" ? m[1] : m[0];
    }
    // Email：深度擷取（Cloudflare 混淆、HTML 實體、mailto、[at]/(dot) 反混淆），聯絡前綴優先
    const emails = extractEmails(html);
    if (emails.length) found.email = emails[0];
    // 抓取電話（tel: 連結或台灣格式）
    if (!found.phone) {
      const telHref = html.match(/href=["']tel:([+0-9\-\s()]+)["']/i);
      if (telHref) {
        const n = telHref[1].replace(/[\s\-().+]/g, "").replace(/^886/, "0");
        if (/^0[2-9]/.test(n)) found.phone = n;
      }
      if (!found.phone) {
        const pm = html.match(/0[2-8]-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3}/);
        if (pm) found.phone = pm[0];
      }
    }
  } catch {
    // 網站逾時/拒絕 → 略過
  }
  return found;
}

// 聯絡頁面發現策略：
// 1) 先從首頁 HTML 找內部連結，用連結文字/URL 判斷哪些像聯絡頁
// 2) 退回固定英文路徑（/contact, /about 等）
// 這比只找英文路徑有效得多——台灣網站常用中文路徑或 CMS 生成的 URL
const CONTACT_LINK_RE = /聯絡|聯繫|關於|contact|about|預約|門市資訊|店舖資訊|公司簡介|服務據點|加盟|FAQ|常見問題/i;
const SKIP_LINK_RE = /facebook|instagram|line\.me|youtube|twitter|google|linkedin|apple|android|\.pdf$|\.jpg$|\.png$/i;

async function discoverContactUrls(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  let base: URL;
  try { base = new URL(baseUrl); } catch { return urls; }
  try {
    const res = await fetch(baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HeroHerbBot/1.0)" },
      signal: AbortSignal.timeout(4000), // 加速（原 6s）
      redirect: "follow",
    });
    if (!res.ok) return urls;
    const html = (await res.text()).slice(0, 500_000);
    // 找所有 <a href="..." ...>文字</a>
    const linkRe = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set<string>();
    for (const m of html.matchAll(linkRe)) {
      const href = m[1];
      const text = m[2].replace(/<[^>]*>/g, "").trim();
      if (!href || SKIP_LINK_RE.test(href)) continue;
      // 連結文字或 URL 含聯絡相關關鍵字
      if (CONTACT_LINK_RE.test(text) || CONTACT_LINK_RE.test(href)) {
        let fullUrl: string;
        try {
          fullUrl = new URL(href, base.origin).href;
        } catch { continue; }
        // 只追同網域
        if (!fullUrl.startsWith(base.origin)) continue;
        if (seen.has(fullUrl) || fullUrl === baseUrl) continue;
        seen.add(fullUrl);
        urls.push(fullUrl);
        if (urls.length >= 5) break; // 最多追 5 個聯絡頁
      }
    }
  } catch { /* 首頁讀取失敗 → 退回固定路徑 */ }
  // 退回固定路徑（沒從首頁找到就試這些）
  if (urls.length === 0) {
    for (const p of ["/contact", "/contact-us", "/contactus", "/contact.html", "/about", "/about-us", "/company", "/service", "/privacy", "/pages/contact"]) {
      urls.push(`${base.origin}${p}`);
    }
  }
  return urls;
}

async function fetchContactPages(baseUrl: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const urls = await discoverContactUrls(baseUrl);
  // 加速：聯絡頁「並行」抓取（原本逐頁等待，最慢 5 頁×5 秒）
  const settled = await Promise.allSettled(urls.slice(0, 5).map((u) => fetchSiteLinks(u)));
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const [ch, val] of Object.entries(r.value)) {
      if (!found[ch]) found[ch] = val;
    }
  }
  return found;
}

async function upsertChannel(
  supabase: SupabaseServerClient,
  brandId: string,
  channel: string,
  value: string,
  sourceUrl?: string
) {
  const { data: exist } = await supabase
    .from("brand_channels")
    .select("id")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .maybeSingle();
  if (exist) {
    await supabase
      .from("brand_channels")
      .update({ value, source_url: sourceUrl || null, fetched_at: new Date().toISOString(), verified: true })
      .eq("id", exist.id);
  } else {
    await supabase.from("brand_channels").insert({
      brand_id: brandId,
      channel,
      value,
      source_url: sourceUrl || null,
      fetched_at: new Date().toISOString(),
      verified: true,
    });
  }
}

// ── Facebook 粉專搜尋（Google CSE）──────────────────────────────────────────
const FB_JUNK_PATH = /^(sharer|share|dialog|plugins|help|policies|login|photo|video|events|groups|pages|permalink|profile|messages|watch|gaming|marketplace)/i;

async function findFacebookPage(
  brandName: string,
  apiKey: string,
  cseId: string
): Promise<{ fbUrl: string | null; snippetLinks: Record<string, string> }> {
  const links: Record<string, string> = {};
  let fbUrl: string | null = null;
  try {
    const q = encodeURIComponent(`"${brandName.slice(0, 15)}" site:facebook.com`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${q}&num=3&hl=zh-TW&gl=tw`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    logApiUsage("cse", 1);
    if (!res.ok) return { fbUrl, snippetLinks: links };
    const data = (await res.json()) as { error?: unknown; items?: { link?: string; title?: string; snippet?: string }[] };
    if (data.error) return { fbUrl, snippetLinks: links };

    for (const item of data.items || []) {
      const link = item.link || "";
      if (!fbUrl) {
        const pm = link.match(/facebook\.com\/([\w.]+)/);
        if (pm && !FB_JUNK_PATH.test(pm[1])) fbUrl = link.replace(/\/$/, "");
      }
      const text = `${item.title || ""} ${item.snippet || ""}`;
      if (!links.phone) {
        const pm = text.match(/0[2-8]-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3}/);
        if (pm) links.phone = pm[0];
      }
      if (!links.email) {
        const em = text.match(/([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/);
        if (em && !/facebook|fbcdn|noreply/i.test(em[1])) links.email = em[1];
      }
    }
  } catch { /* CSE 搜尋失敗 → 略過 */ }
  return { fbUrl, snippetLinks: links };
}

// ── Facebook 頁面抓取聯絡資訊 ──────────────────────────────────────────────
const FB_EMAIL_JUNK = /facebook|fbcdn|meta\.com|noreply|no-reply|oculus|sentry|whatsapp|facebookmail/i;

async function scrapeFacebookPage(fbUrl: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  try {
    const res = await fetch(fbUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return found;
    const html = (await res.text()).slice(0, 800_000);

    // phone: tel: href
    for (const m of html.matchAll(/href=["']tel:([+0-9\-\s()]+)["']/gi)) {
      const phone = m[1].replace(/[\s\-()]/g, "").replace(/^\+?886/, "0");
      if (/^0[2-9]/.test(phone)) { found.phone = phone; break; }
    }
    // email
    for (const m of html.matchAll(/([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/gi)) {
      if (!FB_EMAIL_JUNK.test(m[1]) && !/\.(png|jpg|gif|svg|webp|ico)$/i.test(m[1])) {
        found.email = m[1]; break;
      }
    }
    // Instagram
    for (const m of html.matchAll(/instagram\.com\/([\w.\-]{1,30})/gi)) {
      if (!/^(p|explore|accounts|stories|reels|tv|a|static)$/i.test(m[1])) {
        found.ig = `https://instagram.com/${m[1]}`; break;
      }
    }
    // LINE
    const lineMatch = html.match(/https?:\/\/(?:line\.me\/(?:R\/)?(?:ti\/p\/|ti\/g2\/)[@%\w\-.]+|lin\.ee\/[A-Za-z0-9]+|page\.line\.me\/[A-Za-z0-9_.\-]+)/i);
    if (lineMatch) found.line = lineMatch[0];
    // 地址：台灣地址格式（縣市+區+路街+號）
    const addrMatch = html.match(/[一-鿿]{2,3}[市縣][一-鿿]{1,4}[區鄉鎮市][一-鿿0-9０-９]{0,30}?(?:路|街|大道|巷)[0-9０-９之\-]{1,8}號(?:[0-9０-９樓之\-]{0,8})?/);
    if (addrMatch) found.address = addrMatch[0];
  } catch { /* FB 頁面讀取失敗 → 略過 */ }
  return found;
}

// 免 API 找官網：直接爬搜尋引擎結果頁（Bing 優先、DuckDuckGo HTML 備援）。
// Google 會擋伺服器端爬取（CAPTCHA/同意頁），故不用 Google。過濾掉社群/名錄/政府等非官網。
const SEARCH_JUNK = /facebook\.com|instagram\.com|youtube\.com|line\.me|google\.|bing\.com|duckduckgo|wikipedia|\.gov\.tw|gov\.tw|104\.com|1111\.com|518\.com|yes123|yellowpages|iyp\.|twincn|mygov|find\.taipei|maps\.|foursquare|yelp|tripadvisor|dcard|ptt\.cc|shopee|momo|pchome|books\.com|ubereats|foodpanda|web66\.com|pixnet|blogspot|wordpress\.com|wixsite|痞客邦|blogger|matteroftaste|conception-tech|i-formosa|nearbynirvana/i;

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();

// 免 API 找官網：爬 DuckDuckGo / Bing 結果頁，只接受「標題含公司名」的結果，避免撿到不相干網站。
async function searchWebsiteNoApi(name: string): Promise<string | null> {
  const clean = name.replace(/[（(【][^）)】]*[）)】]/g, "").replace(/\s+/g, "").trim();
  if (clean.length < 2) return null;
  const nameKey = clean.replace(/(股份|有限|公司|企業社|工作室|商行)/g, "").slice(0, 4) || clean.slice(0, 3);
  const q = encodeURIComponent(`${clean.slice(0, 20)} 官網 聯絡`);
  const ua = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36" };
  // 只接受：真實網址、非社群/名錄、且標題含公司名關鍵字
  const pick = (rows: { url: string; title: string }[]): string | null => {
    for (const r of rows) {
      const u = r.url.split("#")[0];
      if (/^https?:\/\//i.test(u) && !SEARCH_JUNK.test(u) && r.title.includes(nameKey)) return u;
    }
    return null;
  };
  // 1) DuckDuckGo HTML（穩定、對伺服器友善）
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, { headers: ua, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const html = await res.text();
      const rows = [...html.matchAll(/class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
        const ud = m[1].match(/uddg=([^&]+)/);
        return { url: ud ? decodeURIComponent(ud[1]) : m[1], title: stripTags(m[2]) };
      });
      const hit = pick(rows);
      if (hit) return hit;
    }
  } catch { /* 換 Bing */ }
  // 2) Bing 備援
  try {
    const res = await fetch(`https://www.bing.com/search?q=${q}&setlang=zh-tw&cc=tw`, { headers: ua, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const html = await res.text();
      const rows = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>((?:(?!<\/a>)[\s\S])*?)<\/a>/gi)]
        .map((m) => ({ url: m[1], title: stripTags(m[2]) }))
        .filter((r) => r.title.length > 1);
      const hit = pick(rows);
      if (hit) return hit;
    }
  } catch { /* 略過 */ }
  return null;
}

// 用 Google Places 依「名稱＋縣市」找店家 → 取官網/電話/地圖/place_id。
// 對政府匯入、無官網但有地址的名單（中醫診所、月子中心…）最有效：它們幾乎都在 Google 地圖上。
async function findPlaceForBrand(name: string, address: string, apiKey: string): Promise<{ placeId?: string; website?: string; phone?: string; gmaps?: string } | null> {
  try {
    const city = (address.match(/^(臺|台)?[一-鿿]{1,3}[市縣]/) || [])[0] || "";
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: `${name} ${city}`.trim(), languageCode: "zh-TW", regionCode: "TW", pageSize: 3 }),
      signal: AbortSignal.timeout(6000),
    });
    logApiUsage("places_search", 1);
    if (!res.ok) return null;
    const data = (await res.json()) as { places?: { id?: string; displayName?: { text?: string }; websiteUri?: string; nationalPhoneNumber?: string; googleMapsUri?: string }[] };
    const p = (data.places || [])[0];
    if (!p) return null;
    // 名稱需相關（避免亂配）：品牌名去掉「中醫診所/診所」等前 3 字要出現在 Google 名稱裡
    const dn = p.displayName?.text || "";
    const key = name.replace(/(中醫醫院|中醫診所|診所|醫院|中醫)/g, "").replace(/\s/g, "").slice(0, 3);
    if (key && !dn.includes(key) && !name.includes(dn.slice(0, 3))) return null;
    return { placeId: p.id, website: p.websiteUri, phone: p.nationalPhoneNumber, gmaps: p.googleMapsUri };
  } catch { return null; }
}

async function enrichBrand(
  supabase: SupabaseServerClient,
  brandId: string,
  brandName: string,
  emit: (obj: Record<string, unknown>) => Promise<void>,
  prefix: string,
  registeredName?: string | null,
  usePlaces: boolean = true
): Promise<string[]> {
  // 載入門市資料 + 現有管道（判斷缺失）
  const [{ data: stores }, { data: existingChannels }] = await Promise.all([
    supabase.from("stores").select("id, phone, website, gmaps_url, name, address").eq("brand_id", brandId).limit(5),
    supabase.from("brand_channels").select("channel, value").eq("brand_id", brandId),
  ]);

  const have = new Set((existingChannels || []).map((c) => c.channel));
  const added: string[] = [...have];
  const phone = stores?.find((s) => s.phone)?.phone;
  let website = stores?.find((s) => s.website)?.website;
  const gmaps = stores?.find((s) => s.gmaps_url)?.gmaps_url;
  const storeName = stores?.find((s) => s.name)?.name || brandName;
  const address = stores?.find((s) => s.address)?.address || "";
  const storeId = stores?.find((s) => s.id)?.id;
  // 搜尋用名稱：品牌名 + 公司登記名（去重）
  const searchNames = [storeName];
  if (registeredName && registeredName !== storeName && registeredName !== brandName) {
    searchNames.push(registeredName.replace(/(股份|有限|公司)/g, "").trim());
  }

  // 目標管道（不含 map，map 由 enrich/places 處理）
  const TARGET_CHANNELS = ["phone", "email", "line", "fb", "ig"];
  const isMissing = (ch: string) => !have.has(ch);
  const anyMissing = TARGET_CHANNELS.some(isMissing);

  // ── 1. 門市基礎資料 ─────────────────────────────────────────────────────
  if (phone && isMissing("phone")) {
    await upsertChannel(supabase, brandId, "phone", phone);
    added.push("phone"); have.add("phone");
  }
  if (gmaps && isMissing("map")) {
    await upsertChannel(supabase, brandId, "map", gmaps);
    added.push("map"); have.add("map");
  }

  // ── 1.5 Google Places 找店家（無官網但有地址 → 中醫/月子等幾乎都在 Google 地圖）──
  // usePlaces=false 時完全跳過（Places API 要收費），改靠下方免 API 搜尋引擎找官網。
  if (usePlaces && !website && address && anyMissing) {
    const placesKey = await getCfg("GOOGLE_PLACES_API_KEY");
    if (placesKey) {
      await emit({ type: "step", text: `${prefix}Google 地圖找店家「${storeName}」…` });
      const place = await findPlaceForBrand(storeName, address, placesKey);
      if (place) {
        if (storeId) {
          const patch: Record<string, unknown> = {};
          if (place.website) patch.website = place.website;
          if (place.placeId) patch.place_id = place.placeId;
          if (place.phone) patch.phone = place.phone;
          if (place.gmaps) patch.gmaps_url = place.gmaps;
          if (Object.keys(patch).length) await supabase.from("stores").update(patch).eq("id", storeId);
        }
        if (place.phone && isMissing("phone")) { await upsertChannel(supabase, brandId, "phone", place.phone, place.gmaps); added.push("phone"); have.add("phone"); }
        if (place.gmaps && isMissing("map")) { await upsertChannel(supabase, brandId, "map", place.gmaps); added.push("map"); have.add("map"); }
        if (place.website) {
          website = place.website;
          if (isMissing("website")) { await upsertChannel(supabase, brandId, "website", place.website, place.gmaps); added.push("website"); have.add("website"); }
          await emit({ type: "step", text: `${prefix}Google 地圖找到官網，接著爬取…` });
        } else {
          await emit({ type: "step", text: `${prefix}Google 地圖有店家但無官網（已補地圖/電話）` });
        }
      } else {
        await emit({ type: "step", text: `${prefix}Google 地圖找不到相符店家` });
      }
    }
  }

  // ── 2. 官網爬取（有缺失管道時一律重爬）──────────────────────────────────
  if (website && anyMissing) {
    const isSocialUrl = LINK_PATTERNS.some(([, re]) => re.test(website));
    if (isSocialUrl) {
      for (const [ch, re] of LINK_PATTERNS) {
        if (re.test(website) && isMissing(ch)) {
          await upsertChannel(supabase, brandId, ch, website, website);
          added.push(ch); have.add(ch);
        }
      }
    } else {
      if (isMissing("website")) {
        await upsertChannel(supabase, brandId, "website", website);
        added.push("website"); have.add("website");
      }
      const domain = (() => { try { return new URL(website).hostname; } catch { return website.slice(0, 30); } })();
      await emit({ type: "step", text: `${prefix}連線 ${domain}…` });
      const links = await fetchSiteLinks(website);
      const found = Object.keys(links);
      if (found.length) {
        await emit({ type: "step", text: `${prefix}找到 ${found.join("、")}，寫入資料庫…` });
      } else {
        await emit({ type: "step", text: `${prefix}未在官網找到社群連結` });
      }
      for (const [ch, value] of Object.entries(links)) {
        if (isMissing(ch)) {
          await upsertChannel(supabase, brandId, ch, value, website);
          added.push(ch); have.add(ch);
        }
      }
    }

    // 官網首頁沒找到 email → 嘗試聯絡頁（/contact, /about）
    if (!have.has("email") && website && !LINK_PATTERNS.some(([, re]) => re.test(website))) {
      await emit({ type: "step", text: `${prefix}搜尋聯絡頁面（/contact, /about）…` });
      const contactLinks = await fetchContactPages(website);
      for (const [ch, value] of Object.entries(contactLinks)) {
        if (!have.has(ch)) {
          await upsertChannel(supabase, brandId, ch, value, website);
          added.push(ch); have.add(ch);
          await emit({ type: "step", text: `${prefix}聯絡頁找到 ${ch}` });
        }
      }
    }
  } else if (!website && !phone && !gmaps) {
    await emit({ type: "step", text: `${prefix}此品牌無門市資料（請先執行 Google Maps 採集）` });
  }

  // ── 2.5 交叉搜尋：用「已登陸的管道」互找「還沒登陸的管道」（先做，能省下 Google API）──
  // 例：已有 FB → 爬 FB 找 IG/電話/Email/LINE/地址；已有 IG/官網 → 互相補齊。
  {
    const knownPages: { label: string; url: string }[] = [];
    const seenUrl = new Set<string>();
    const pushUrl = (label: string, url?: string | null) => {
      if (url && /^https?:\/\//i.test(url) && !seenUrl.has(url)) { seenUrl.add(url); knownPages.push({ label, url }); }
    };
    // 來源：本次門市官網 + 既有 brand_channels 的 website/fb/ig
    pushUrl("官網", website || undefined);
    for (const c of existingChannels || []) {
      if (c.channel === "website") pushUrl("官網", c.value);
      if (c.channel === "fb") pushUrl("FB", c.value);
      if (c.channel === "ig") pushUrl("IG", c.value);
    }
    for (const pg of knownPages) {
      const missingNow = TARGET_CHANNELS.filter((ch) => !have.has(ch));
      if (missingNow.length === 0) break;
      await emit({ type: "step", text: `${prefix}交叉搜尋 ${pg.label} 找缺漏管道…` });
      // fetchSiteLinks：fb/ig/line/email；scrapeFacebookPage：phone/email/ig/line/address（對任何 HTML 皆可）
      let found: Record<string, string> = {};
      try { found = { ...(await fetchSiteLinks(pg.url)), ...(await scrapeFacebookPage(pg.url)) }; } catch { /* 略過 */ }
      const newFound = Object.entries(found).filter(([ch]) => !have.has(ch));
      for (const [ch, value] of newFound) {
        await upsertChannel(supabase, brandId, ch, value, pg.url);
        added.push(ch); have.add(ch);
      }
      if (newFound.length) await emit({ type: "step", text: `${prefix}交叉搜尋從 ${pg.label} 補到 ${newFound.map(([c]) => c).join("、")}` });
    }
  }

  // ── 2.6 免 API 找官網（爬 Bing / DuckDuckGo）→ 再爬官網補管道 ─────────
  // 政府匯入、無官網的品牌靠這步：用公司名在搜尋引擎找官網，找到就寫入並爬取。
  if (!have.has("website") && TARGET_CHANNELS.some((ch) => !have.has(ch))) {
    let site: string | null = null;
    for (const sn of searchNames) {
      await emit({ type: "step", text: `${prefix}搜尋引擎找官網「${sn}」…` });
      site = await searchWebsiteNoApi(sn);
      if (site) break;
    }
    if (site) {
      const domain = (() => { try { return new URL(site).hostname; } catch { return site!.slice(0, 40); } })();
      await emit({ type: "step", text: `${prefix}找到官網 ${domain}，爬取聯絡資訊…` });
      await upsertChannel(supabase, brandId, "website", site, "search");
      added.push("website"); have.add("website");
      let links: Record<string, string> = {};
      try { links = { ...(await fetchSiteLinks(site)), ...(await fetchContactPages(site)) }; } catch { /* 爬取失敗略過 */ }
      const newFound = Object.entries(links).filter(([ch]) => !have.has(ch));
      for (const [ch, value] of newFound) { await upsertChannel(supabase, brandId, ch, value, site); added.push(ch); have.add(ch); }
      await emit({ type: "step", text: newFound.length ? `${prefix}官網補到 ${newFound.map(([c]) => c).join("、")}` : `${prefix}官網未找到社群/聯絡` });
    } else {
      await emit({ type: "step", text: `${prefix}搜尋引擎找不到官網` });
    }
  }

  // ── 3. Google CSE 搜尋品牌聯絡資訊（付費 API，usePlaces=false 時一併跳過）──
  const stillMissing1 = TARGET_CHANNELS.filter((ch) => !have.has(ch));
  if (usePlaces && stillMissing1.length > 0) {
    const apiKey = await getCfg("GOOGLE_PLACES_API_KEY");
    const cseId = await getCfg("GOOGLE_CSE_ID");
    if (apiKey && cseId) {
      // 搜尋品牌聯絡資訊（品牌名 + 公司名都搜，多種搜尋詞）
      const JUNK_CSE = /noreply|no-reply|sentry|example\.|wixpress|facebook|google/i;
      for (const sn of searchNames) {
        if (!TARGET_CHANNELS.some((ch) => !have.has(ch))) break;
        // 搜尋詞策略：先搜「聯絡 email LINE」，再搜「預約」（服務業常有 email）
        const queries = [
          `"${sn.slice(0, 15)}" 電話 email LINE`,
          ...(!have.has("email") ? [`"${sn.slice(0, 15)}" 聯絡 預約 email`] : []),
        ];
        for (const qStr of queries) {
          if (!TARGET_CHANNELS.some((ch) => !have.has(ch))) break;
          await emit({ type: "step", text: `${prefix}Google 搜尋「${sn}」聯絡資訊…` });
          try {
            const q = encodeURIComponent(qStr);
            const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${q}&num=5&hl=zh-TW&gl=tw`;
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            logApiUsage("cse", 1);
            if (res.ok) {
              const data = (await res.json()) as { items?: { snippet?: string; link?: string }[] };
              const text = (data.items || []).map((i) => i.snippet || "").join(" ");
              if (!have.has("phone")) {
                const pm = text.match(/0[2-8]-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3}/);
                if (pm) { await upsertChannel(supabase, brandId, "phone", pm[0], "google_cse"); added.push("phone"); have.add("phone"); }
              }
              if (!have.has("email")) {
                for (const m of text.matchAll(/([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g)) {
                  if (!JUNK_CSE.test(m[1])) { await upsertChannel(supabase, brandId, "email", m[1], "google_cse"); added.push("email"); have.add("email"); break; }
                }
              }
              // 從搜尋結果連結中找品牌的官網（補 website）
              if (!have.has("website")) {
                for (const item of data.items || []) {
                  const link = item.link || "";
                  if (link && !link.includes("facebook.com") && !link.includes("instagram.com") && !link.includes("google.com") && !link.includes("youtube.com")) {
                    await upsertChannel(supabase, brandId, "website", link, "google_cse");
                    added.push("website"); have.add("website");
                    // 找到官網就順便爬一下
                    const siteLinks = await fetchSiteLinks(link);
                    for (const [ch, val] of Object.entries(siteLinks)) {
                      if (!have.has(ch)) { await upsertChannel(supabase, brandId, ch, val, link); added.push(ch); have.add(ch); }
                    }
                    break;
                  }
                }
              }
              const cseFound = added.filter((ch) => !existingChannels?.some((e) => e.channel === ch));
              if (cseFound.length > 0) await emit({ type: "step", text: `${prefix}Google 搜尋找到 ${cseFound.join("、")}` });
            }
          } catch { /* CSE 搜尋失敗 → 略過 */ }
        }
      }
    }
  }

  // ── 4. Facebook 粉專搜尋 + 頁面抓取 ─────────────────────────────────────
  const stillMissing2 = TARGET_CHANNELS.filter((ch) => !have.has(ch));
  if (stillMissing2.length > 0) {
    let fbUrl: string | null = (existingChannels || []).find((c) => c.channel === "fb")?.value || null;

    if (!fbUrl) {
      const apiKey = await getCfg("GOOGLE_PLACES_API_KEY");
      const cseId = await getCfg("GOOGLE_CSE_ID");
      if (apiKey && cseId) {
        // 用品牌名+公司名依序搜尋 FB 粉專
        let cseResult: { fbUrl: string | null; snippetLinks: Record<string, string> } = { fbUrl: null, snippetLinks: {} };
        for (const sn of searchNames) {
          await emit({ type: "step", text: `${prefix}搜尋 Facebook 粉專「${sn}」…` });
          cseResult = await findFacebookPage(sn, apiKey, cseId);
          if (cseResult.fbUrl) break;
        }
        fbUrl = cseResult.fbUrl;
        for (const [ch, value] of Object.entries(cseResult.snippetLinks)) {
          if (!have.has(ch)) {
            await upsertChannel(supabase, brandId, ch, value, "google_cse_fb");
            added.push(ch); have.add(ch);
          }
        }
      }
    }

    if (fbUrl) {
      if (!have.has("fb")) {
        await upsertChannel(supabase, brandId, "fb", fbUrl);
        added.push("fb"); have.add("fb");
      }
      const stillMissing3 = TARGET_CHANNELS.filter((ch) => !have.has(ch));
      // 即使五大管道齊全，仍嘗試從 FB 補地址
      if (stillMissing3.length > 0 || !have.has("address")) {
        await emit({ type: "step", text: `${prefix}從 Facebook 頁面抓取聯絡資訊…` });
        const fbLinks = await scrapeFacebookPage(fbUrl);
        const fbFound = Object.entries(fbLinks).filter(([ch]) => !have.has(ch));
        if (fbFound.length > 0) {
          await emit({ type: "step", text: `${prefix}從 FB 找到 ${fbFound.map(([ch]) => ch).join("、")}` });
          for (const [ch, value] of fbFound) {
            await upsertChannel(supabase, brandId, ch, value, fbUrl);
            added.push(ch); have.add(ch);
          }
        } else {
          await emit({ type: "step", text: `${prefix}FB 頁面未找到額外管道` });
        }
      }
    }
  }

  // 回傳本次新增的管道（排除原本就有的）
  const existSet = new Set((existingChannels || []).map((c) => c.channel));
  return [...new Set(added)].filter((ch) => !existSet.has(ch));
}

function streamResponse() {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = async (obj: Record<string, unknown>) =>
    writer.write(enc.encode(JSON.stringify(obj) + "\n"));
  const close = () => writer.close().catch(() => {});
  return { readable, emit, close };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ type: "error", text: "參數格式錯誤" }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } }
    );
  }

  const { readable, emit, close } = streamResponse();

  (async () => {
    const supabase = getSupabaseServerClient();
    // 完整定義：五大管道齊全則視為已採集完成，批次時剃除不重複採集
    const COMPLETE_CHANNELS = ["phone", "email", "line", "fb", "ig"];
    const isComplete = (chs: { channel: string }[] | undefined) => {
      const have = new Set((chs || []).map((c) => c.channel));
      return COMPLETE_CHANNELS.every((c) => have.has(c) || (c === "line" && have.has("line_id")));
    };
    try {
      let brands: { id: string; name: string; registered_name?: string | null; brand_channels?: { channel: string }[] }[] = [];
      let isBatch = false;

      if (body.brand_id) {
        const { data: brand } = await supabase
          .from("brands").select("id, name, registered_name").eq("id", String(body.brand_id)).single();
        if (!brand) {
          await emit({ type: "error", text: "品牌不存在" });
          return;
        }
        brands = [brand];
      } else if (Array.isArray(body.brand_ids) && body.brand_ids.length > 0) {
        isBatch = true;
        const ids = (body.brand_ids as string[]).slice(0, 500);
        const { data } = await supabase.from("brands").select("id, name, registered_name, brand_channels(channel)").in("id", ids);
        brands = data || [];
      } else if (body.all) {
        isBatch = true;
        const industry = body.industry ? String(body.industry) : null;
        let q = supabase.from("brands").select("id, name, registered_name, brand_channels(channel)").limit(100000);
        if (industry) q = q.ilike("industry", `%${industry}%`);
        const { data } = await q;
        brands = data || [];
      } else {
        await emit({ type: "error", text: "請提供 brand_id、brand_ids 或 all" });
        return;
      }

      // 批次：剃除已採集完整的品牌
      let skipped = 0;
      if (isBatch) {
        const before = brands.length;
        brands = brands.filter((b) => !isComplete(b.brand_channels));
        skipped = before - brands.length;
      }

      if (brands.length === 0) {
        await emit({ type: "error", text: skipped > 0 ? `所選品牌皆已採集完整（剃除 ${skipped} 個）` : "找不到可採集的品牌" });
        return;
      }

      // 預設 30 線並行；可由 body.concurrency 指定，上限 30
      const CONCURRENCY = Math.min(30, Math.max(1, Math.floor(Number(body.concurrency) || 30)));
      // usePlaces：是否使用 Google 付費 API（Places 找店家 + CSE 搜尋）。預設開啟；前端可取消勾選以省費用。
      const usePlaces = body.usePlaces === undefined ? true : Boolean(body.usePlaces);
      await emit({ type: "init", total: brands.length, skipped });
      await emit({ type: "step", text: `開始採集 ${brands.length} 個品牌（${CONCURRENCY} 並行）${skipped > 0 ? `，已剃除 ${skipped} 個完整品牌` : ""}…` });

      let enriched = 0;
      let doneCount = 0;

      // 平行處理：分批並行，每批 CONCURRENCY 個同時跑
      const processBrand = async (idx: number) => {
        const { id, name } = brands[idx];
        const prefix = `[${idx + 1}/${brands.length}] `;
        try {
          const channels = await enrichBrand(supabase, id, name, emit, prefix, (brands[idx] as any).registered_name, usePlaces);
          doneCount++;
          if (channels.length > 0) {
            enriched++;
            await emit({ type: "store", ok: true, text: `${prefix}✓ ${name}：取得 ${channels.join("、")}` });
          } else {
            await emit({ type: "store", ok: false, text: `${prefix}— ${name}：無可新增的管道資料` });
          }
          await emit({ type: "progress", done: doneCount, total: brands.length });
        } catch (e) {
          doneCount++;
          await emit({ type: "store", ok: false, text: `${prefix}✕ ${name}：${e instanceof Error ? e.message : "失敗"}` });
          await emit({ type: "progress", done: doneCount, total: brands.length });
        }
      };

      // 用 semaphore 控制並行數量
      let running = 0;
      let nextIdx = 0;
      await new Promise<void>((resolve) => {
        const tryNext = () => {
          while (running < CONCURRENCY && nextIdx < brands.length) {
            const idx = nextIdx++;
            running++;
            processBrand(idx).finally(() => {
              running--;
              if (nextIdx >= brands.length && running === 0) resolve();
              else tryNext();
            });
          }
        };
        if (brands.length === 0) resolve();
        else tryNext();
      });

      await emit({ type: "done", data: { total: brands.length, enriched, skipped } });
    } catch (e) {
      await emit({ type: "error", text: e instanceof Error ? e.message : "採集失敗" });
    } finally {
      close();
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
