import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logApiUsage } from "@/lib/api-usage";

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

async function fetchSiteLinks(url: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HeroHerbBot/1.0)" },
      signal: AbortSignal.timeout(8000),
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
  } catch {
    // 網站逾時/拒絕 → 略過
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

async function enrichBrand(
  supabase: SupabaseServerClient,
  brandId: string,
  brandName: string,
  emit: (obj: Record<string, unknown>) => Promise<void>,
  prefix: string,
  registeredName?: string | null
): Promise<string[]> {
  // 載入門市資料 + 現有管道（判斷缺失）
  const [{ data: stores }, { data: existingChannels }] = await Promise.all([
    supabase.from("stores").select("phone, website, gmaps_url, name").eq("brand_id", brandId).limit(5),
    supabase.from("brand_channels").select("channel, value").eq("brand_id", brandId),
  ]);

  const have = new Set((existingChannels || []).map((c) => c.channel));
  const added: string[] = [...have];
  const phone = stores?.find((s) => s.phone)?.phone;
  const website = stores?.find((s) => s.website)?.website;
  const gmaps = stores?.find((s) => s.gmaps_url)?.gmaps_url;
  const storeName = stores?.find((s) => s.name)?.name || brandName;
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
  } else if (!website && !phone && !gmaps) {
    await emit({ type: "step", text: `${prefix}此品牌無門市資料（請先執行 Google Maps 採集）` });
  }

  // ── 3. Google CSE 搜尋品牌聯絡資訊 ────────────────────────────────────
  const stillMissing1 = TARGET_CHANNELS.filter((ch) => !have.has(ch));
  if (stillMissing1.length > 0) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    if (apiKey && cseId) {
      // 搜尋品牌聯絡資訊（品牌名 + 公司名都搜）
      for (const sn of searchNames) {
        if (!TARGET_CHANNELS.some((ch) => !have.has(ch))) break;
        await emit({ type: "step", text: `${prefix}Google 搜尋「${sn}」聯絡資訊…` });
        try {
          const q = encodeURIComponent(`"${sn.slice(0, 15)}" 電話 email LINE`);
          const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${q}&num=5&hl=zh-TW&gl=tw`;
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          logApiUsage("cse", 1);
          if (res.ok) {
            const data = (await res.json()) as { items?: { snippet?: string }[] };
            const text = (data.items || []).map((i) => i.snippet || "").join(" ");
            if (!have.has("phone")) {
              const pm = text.match(/0[2-8]-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3}/);
              if (pm) { await upsertChannel(supabase, brandId, "phone", pm[0], "google_cse"); added.push("phone"); have.add("phone"); }
            }
            if (!have.has("email")) {
              const em = text.match(/([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/);
              if (em && !/noreply|no-reply/i.test(em[1])) { await upsertChannel(supabase, brandId, "email", em[1], "google_cse"); added.push("email"); have.add("email"); }
            }
            const cseFound = added.filter((ch) => !existingChannels?.some((e) => e.channel === ch));
            if (cseFound.length > 0) await emit({ type: "step", text: `${prefix}Google 搜尋找到 ${cseFound.join("、")}` });
          }
        } catch { /* CSE 搜尋失敗 → 略過 */ }
      }
    }
  }

  // ── 4. Facebook 粉專搜尋 + 頁面抓取 ─────────────────────────────────────
  const stillMissing2 = TARGET_CHANNELS.filter((ch) => !have.has(ch));
  if (stillMissing2.length > 0) {
    let fbUrl: string | null = (existingChannels || []).find((c) => c.channel === "fb")?.value || null;

    if (!fbUrl) {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const cseId = process.env.GOOGLE_CSE_ID;
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
      if (stillMissing3.length > 0) {
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
        const ids = (body.brand_ids as string[]).slice(0, 50);
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

      await emit({ type: "step", text: `開始採集 ${brands.length} 個品牌的聯絡管道${skipped > 0 ? `（已剃除 ${skipped} 個完整品牌）` : ""}…` });

      let enriched = 0;
      for (let i = 0; i < brands.length; i++) {
        const { id, name } = brands[i];
        const prefix = brands.length > 1 ? `[${i + 1}/${brands.length}] ` : "";
        try {
          await emit({ type: "step", text: `${prefix}${name}：查詢門市資料…` });
          const channels = await enrichBrand(supabase, id, name, emit, prefix, (brands[i] as any).registered_name);
          if (channels.length > 0) {
            enriched++;
            await emit({ type: "store", ok: true, text: `${prefix}✓ ${name}：取得 ${channels.join("、")}` });
          } else {
            await emit({ type: "store", ok: false, text: `${prefix}— ${name}：無可新增的管道資料` });
          }
        } catch (e) {
          await emit({ type: "store", ok: false, text: `${prefix}✕ ${name}：${e instanceof Error ? e.message : "失敗"}` });
        }
      }

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
