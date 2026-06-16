import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

async function enrichBrand(
  supabase: SupabaseServerClient,
  brandId: string,
  brandName: string,
  emit: (obj: Record<string, unknown>) => Promise<void>,
  prefix: string
): Promise<string[]> {
  const { data: stores } = await supabase
    .from("stores")
    .select("phone, website, gmaps_url")
    .eq("brand_id", brandId)
    .limit(5);

  const added: string[] = [];
  const phone = stores?.find((s) => s.phone)?.phone;
  const website = stores?.find((s) => s.website)?.website;
  const gmaps = stores?.find((s) => s.gmaps_url)?.gmaps_url;

  if (phone) {
    await upsertChannel(supabase, brandId, "phone", phone);
    added.push("phone");
  }
  if (gmaps) {
    await upsertChannel(supabase, brandId, "map", gmaps);
    added.push("map");
  }
  if (website) {
    const isSocialUrl = LINK_PATTERNS.some(([, re]) => re.test(website));
    if (isSocialUrl) {
      for (const [ch, re] of LINK_PATTERNS) {
        if (re.test(website)) {
          await upsertChannel(supabase, brandId, ch, website, website);
          added.push(ch);
        }
      }
    } else {
      await upsertChannel(supabase, brandId, "website", website);
      added.push("website");

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
        await upsertChannel(supabase, brandId, ch, value, website);
        added.push(ch);
      }
    }
  } else if (!phone && !gmaps) {
    await emit({ type: "step", text: `${prefix}此品牌無門市資料（請先執行 Google Maps 採集）` });
  }

  return [...new Set(added)];
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
    try {
      let brands: { id: string; name: string }[] = [];

      if (body.brand_id) {
        const { data: brand } = await supabase
          .from("brands").select("id, name").eq("id", String(body.brand_id)).single();
        if (!brand) {
          await emit({ type: "error", text: "品牌不存在" });
          return;
        }
        brands = [brand];
      } else if (Array.isArray(body.brand_ids) && body.brand_ids.length > 0) {
        const ids = (body.brand_ids as string[]).slice(0, 50);
        const { data } = await supabase.from("brands").select("id, name").in("id", ids);
        brands = data || [];
      } else if (body.all) {
        const industry = body.industry ? String(body.industry) : null;
        let q = supabase.from("brands").select("id, name");
        if (industry) q = q.ilike("industry", `%${industry}%`);
        const { data } = await q;
        brands = data || [];
      } else {
        await emit({ type: "error", text: "請提供 brand_id、brand_ids 或 all" });
        return;
      }

      if (brands.length === 0) {
        await emit({ type: "error", text: "找不到可採集的品牌" });
        return;
      }

      await emit({ type: "step", text: `開始採集 ${brands.length} 個品牌的聯絡管道…` });

      let enriched = 0;
      for (let i = 0; i < brands.length; i++) {
        const { id, name } = brands[i];
        const prefix = brands.length > 1 ? `[${i + 1}/${brands.length}] ` : "";
        try {
          await emit({ type: "step", text: `${prefix}${name}：查詢門市資料…` });
          const channels = await enrichBrand(supabase, id, name, emit, prefix);
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

      await emit({ type: "done", data: { total: brands.length, enriched } });
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
