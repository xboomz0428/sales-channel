import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/enrich/channels
 *   { brand_id }   → 補齊單一品牌的聯絡管道
 *   { all: true }  → 批次補齊（每次最多 10 個品牌）
 *
 * 來源：
 *  1. stores（Places 採集結果）→ phone / website / map
 *  2. 抓取品牌官網 HTML → 解析 FB / IG / LINE / Email 連結
 */

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

async function enrichBrand(supabase: SupabaseServerClient, brandId: string, brandName: string) {
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
    await upsertChannel(supabase, brandId, "website", website);
    added.push("website");

    // 官網可能直接是 FB/IG/LINE 連結
    for (const [ch, re] of LINK_PATTERNS) {
      if (re.test(website)) {
        await upsertChannel(supabase, brandId, ch, website, website);
        added.push(ch);
      }
    }

    // 抓官網 HTML 找社群連結
    const links = await fetchSiteLinks(website);
    for (const [ch, value] of Object.entries(links)) {
      await upsertChannel(supabase, brandId, ch, value, website);
      added.push(ch);
    }
  }

  return { brand: brandName, channels: [...new Set(added)] };
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
    // 指定多個品牌
    if (Array.isArray(body.brand_ids) && (body.brand_ids as string[]).length > 0) {
      const ids = (body.brand_ids as string[]).slice(0, 50);
      const { data: brands } = await supabase.from("brands").select("id, name").in("id", ids);
      const results = [];
      for (const b of brands || []) results.push(await enrichBrand(supabase, b.id, b.name));
      const withChannels = results.filter((r) => r.channels.length > 0).length;
      return NextResponse.json({ success: true, data: { total: results.length, enriched: withChannels, results } });
    }

    if (body.brand_id) {
      const { data: brand } = await supabase.from("brands").select("id, name").eq("id", body.brand_id).single();
      if (!brand) return NextResponse.json({ success: false, error: "品牌不存在" }, { status: 404 });
      const result = await enrichBrand(supabase, brand.id, brand.name);
      return NextResponse.json({ success: true, data: result });
    }

    if (body.all) {
      const industry = body.industry ? String(body.industry) : null;
      let query = supabase.from("brands").select("id, name");
      if (industry) query = query.ilike("industry", `%${industry}%`);
      const { data: brands } = await query.limit(20);
      const results = [];
      for (const b of brands || []) results.push(await enrichBrand(supabase, b.id, b.name));
      const withChannels = results.filter((r) => r.channels.length > 0).length;
      return NextResponse.json({
        success: true,
        data: { total: results.length, enriched: withChannels, results },
      });
    }

    return NextResponse.json({ success: false, error: "請提供 brand_id、brand_ids 或 all" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "補齊失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
