import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/scrape/website
 * 爬取品牌官網，擷取 LINE / FB / IG / 電話 / Email / 預約平台連結
 * body: { brand_id? } | { all: true, limit?: number }
 *
 * 串流 NDJSON 進度，結果寫入 brand_channels 表。
 * 支援 Big5 / UTF-8 編碼自動偵測。
 */

export const maxDuration = 300;

type SB = ReturnType<typeof getSupabaseServerClient>;

// ── 擷取規則（pattern string，在函式內 new RegExp 避免 lastIndex 問題）──────
const P = {
  line_url:  String.raw`https?://(?:line\.me/(?:R/)?(?:ti/p/|ti/g2/)[@%\w\-.]+|lin\.ee/\w+|page\.line\.me/[\w.\-]+)`,
  line_at:   String.raw`(?:line|賴|加好友|官方帳號)[^\n@＠]{0,40}[@＠]([\w.\-]{3,20})`,
  fb:        String.raw`https?://(?:www\.|m\.|zh-tw\.)?facebook\.com/([\w.\-]{3,80})/?(?:[?#][^\s"'<>]*)?`,
  ig:        String.raw`https?://(?:www\.)?instagram\.com/([\w.\-]{1,30})/?(?:[?#][^\s"'<>]*)?`,
  tel_href:  String.raw`href=["']tel:([+0-9\-\s()]+)["']`,
  phone:     String.raw`0[2-8]-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3}`,
  email:     String.raw`\b([A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b`,
  stylemap:  String.raw`https?://(?:www\.)?stylemapapp\.com/[^\s"'<>]+`,
  booking:   String.raw`https?://(?:www\.)?(?:fasola\.app|bookme\.tw|beautystar\.com\.tw)\/[^\s"'<>]+`,
  linktree:  String.raw`https?://linktr\.ee/[\w.\-]+`,
};

const FB_JUNK    = /^(?:sharer|share\.php|dialog|plugins|help|policies|legal|login|l\.php|photo|video|events|groups|pages|permalink|profile\.php|messages)/i;
const IG_JUNK    = /^(?:p|explore|accounts|stories|reels|tv|a|static)/i;
const EMAIL_JUNK = /^(?:noreply|no-reply|support|webmaster|admin|postmaster)/i;

// 從 JSON-LD 結構化資料取電話
function phoneFromJsonLd(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const obj = JSON.parse(b[1]);
      const tel = (Array.isArray(obj) ? obj[0] : obj)?.telephone;
      if (typeof tel === "string" && tel.trim()) return tel.trim();
    } catch { /* 略過格式錯誤的 JSON-LD */ }
  }
  return null;
}

// 標準化台灣電話格式
function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().+]/g, "").replace(/^886/, "0");
}

function extractLinks(html: string): Record<string, string> {
  const r: Record<string, string> = {};

  // LINE URL
  const lineUrls = [...html.matchAll(new RegExp(P.line_url, "gi"))];
  if (lineUrls.length) r.line = lineUrls[0][0];

  // LINE@ 文字模式（無 URL 時才抓）
  if (!r.line) {
    const lineAt = [...html.matchAll(new RegExp(P.line_at, "gi"))];
    if (lineAt.length) r.line_id = "@" + lineAt[0][1];
  }

  // Facebook
  for (const m of html.matchAll(new RegExp(P.fb, "gi"))) {
    const path = (m[1] ?? "").split(/[?#]/)[0].replace(/\/$/, "");
    if (path && !FB_JUNK.test(path)) {
      r.fb = `https://facebook.com/${path}`;
      break;
    }
  }

  // Instagram
  for (const m of html.matchAll(new RegExp(P.ig, "gi"))) {
    const user = (m[1] ?? "").split(/[?#]/)[0].replace(/\/$/, "");
    if (user && !IG_JUNK.test(user)) {
      r.ig = `https://instagram.com/${user}`;
      break;
    }
  }

  // 電話：優先順序 tel: href → JSON-LD → 純文字 regex
  const telHref = [...html.matchAll(new RegExp(P.tel_href, "gi"))];
  if (telHref.length) {
    const normalized = normalizePhone(telHref[0][1]);
    if (/^0[2-9]/.test(normalized)) r.phone = normalized;
  }
  if (!r.phone) {
    const jsonLdPhone = phoneFromJsonLd(html);
    if (jsonLdPhone) r.phone = normalizePhone(jsonLdPhone);
  }
  if (!r.phone) {
    const phones = html.match(new RegExp(P.phone, "g"));
    if (phones) r.phone = phones[0];
  }

  // Email（排除圖片附檔名 & noreply 類）
  for (const m of html.matchAll(new RegExp(P.email, "gi"))) {
    const email = m[1];
    if (
      !EMAIL_JUNK.test(email.split("@")[0]) &&
      !email.match(/\.(png|jpg|gif|svg|webp|ico)$/i)
    ) {
      r.email = email;
      break;
    }
  }

  // StyleMap
  const sm = [...html.matchAll(new RegExp(P.stylemap, "gi"))];
  if (sm.length) r.stylemap = sm[0][0];

  // 其他預約平台
  const bk = [...html.matchAll(new RegExp(P.booking, "gi"))];
  if (bk.length) r.booking = bk[0][0];

  // Linktree
  const lt = [...html.matchAll(new RegExp(P.linktree, "gi"))];
  if (lt.length) r.linktree = lt[0][0];

  return r;
}

// 常見聯絡頁路徑（找不到電話時 fallback）
const CONTACT_PATHS = ["/contact", "/contact-us", "/聯絡我們", "/about", "/about-us", "/關於我們"];

async function findPhoneFromContactPage(baseUrl: string): Promise<string | null> {
  const origin = new URL(baseUrl).origin;
  for (const path of CONTACT_PATHS) {
    try {
      const html = await fetchHtml(origin + path);
      if (!html) continue;
      // 先試 tel: href
      const telMatch = html.match(new RegExp(P.tel_href, "i"));
      if (telMatch) {
        const n = normalizePhone(telMatch[1]);
        if (/^0[2-9]/.test(n)) return n;
      }
      // 再試 JSON-LD
      const jl = phoneFromJsonLd(html);
      if (jl) return normalizePhone(jl);
      // 再試 regex
      const phones = html.match(new RegExp(P.phone, "g"));
      if (phones) return phones[0];
    } catch { /* 略過 */ }
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;

    const buf = await res.arrayBuffer();

    // 從 Content-Type header 取 charset；沒有的話從 HTML meta 偵測
    let charset = (ct.match(/charset=([^\s;]+)/i) ?? [])[1] ?? "";
    if (!charset) {
      const preview = new TextDecoder("utf-8", { fatal: false }).decode(
        new Uint8Array(buf).slice(0, 4096)
      );
      charset = (preview.match(/charset=["']?([^"';\s>]+)/i) ?? [])[1] ?? "utf-8";
    }
    charset = charset.toLowerCase().replace(/^x-/, "");
    if (charset === "big5-hkscs") charset = "big5";

    try {
      return new TextDecoder(charset, { fatal: false }).decode(buf).slice(0, 600_000);
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf).slice(0, 600_000);
    }
  } catch {
    return null;
  }
}

async function upsertChannel(sb: SB, brandId: string, channel: string, value: string, sourceUrl: string) {
  const { data: exist } = await sb
    .from("brand_channels")
    .select("id")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .maybeSingle();
  if (exist) {
    await sb.from("brand_channels")
      .update({ value, source_url: sourceUrl, fetched_at: new Date().toISOString() })
      .eq("id", exist.id);
  } else {
    await sb.from("brand_channels").insert({
      brand_id: brandId,
      channel,
      value,
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
    });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* 略過 */ }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = (obj: Record<string, unknown>) =>
    writer.write(enc.encode(JSON.stringify(obj) + "\n"));

  (async () => {
    const sb = getSupabaseServerClient();
    try {
      let brands: { id: string; name: string }[] = [];

      // 指定品牌 IDs
      if (Array.isArray(body.brand_ids) && (body.brand_ids as string[]).length > 0) {
        const ids = (body.brand_ids as string[]).slice(0, 50);
        const { data } = await sb.from("brands").select("id,name").in("id", ids);
        brands = data ?? [];
      } else if (body.brand_id) {
        const { data } = await sb.from("brands").select("id,name").eq("id", String(body.brand_id)).single();
        if (data) brands = [data];
      } else if (body.all) {
        const limit = Math.min(Number(body.limit) || 30, 50);
        const industry = body.industry ? String(body.industry) : null;

        let candidateIds: string[] = [];

        if (industry) {
          // 指定類別：直接從 brands 篩選
          const { data: rows } = await sb
            .from("brands")
            .select("id")
            .ilike("industry", `%${industry}%`)
            .limit(limit * 3);
          candidateIds = (rows ?? []).map((r) => r.id).filter(Boolean);
        } else {
          // 找有官網的品牌
          const { data: rows } = await sb
            .from("stores")
            .select("brand_id")
            .not("website", "is", null)
            .neq("website", "")
            .limit(limit * 5);
          candidateIds = [...new Set((rows ?? []).map((r) => r.brand_id).filter(Boolean))];
        }

        // 排除已有 ≥ 2 筆管道資料的品牌
        const { data: enrichedRows } = await sb
          .from("brand_channels")
          .select("brand_id")
          .in("brand_id", candidateIds);
        const enrichedCounts: Record<string, number> = {};
        for (const r of enrichedRows ?? []) {
          enrichedCounts[r.brand_id] = (enrichedCounts[r.brand_id] ?? 0) + 1;
        }
        const unenrichedIds = candidateIds.filter((id) => (enrichedCounts[id] ?? 0) < 2).slice(0, limit);

        const skippedAlready = candidateIds.length - unenrichedIds.length;
        if (skippedAlready > 0) {
          await emit({ type: "step", text: `略過 ${skippedAlready} 個品牌（已有管道資料），剩餘 ${unenrichedIds.length} 個待爬取` });
        }

        if (unenrichedIds.length) {
          const { data } = await sb.from("brands").select("id,name").in("id", unenrichedIds);
          brands = data ?? [];
        }
      }

      if (brands.length === 0) {
        await emit({ type: "error", text: "找不到有官網的品牌" });
        return;
      }

      await emit({ type: "step", text: `開始爬取 ${brands.length} 個品牌官網…` });

      let enriched = 0, skipped = 0, totalCh = 0;

      for (let i = 0; i < brands.length; i++) {
        const brand = brands[i];
        const prefix = `[${i + 1}/${brands.length}]`;

        const { data: stores } = await sb
          .from("stores")
          .select("website")
          .eq("brand_id", brand.id)
          .not("website", "is", null);

        const websites = [
          ...new Set((stores ?? []).map((s) => (s.website as string)).filter(Boolean)),
        ];

        if (websites.length === 0) {
          await emit({ type: "store", ok: false, text: `${prefix} ${brand.name}：無官網 URL` });
          skipped++;
          continue;
        }

        const merged: Record<string, string> = {};

        for (const url of websites) {
          // 官網本身就是社群連結 → 直接記錄
          if (/facebook\.com/i.test(url))          { merged.fb       ??= url; continue; }
          if (/instagram\.com/i.test(url))          { merged.ig       ??= url; continue; }
          if (/line\.me|lin\.ee|page\.line\.me/i.test(url)) { merged.line ??= url; continue; }
          if (/linktr\.ee/i.test(url))              { merged.linktree ??= url; }

          await emit({ type: "step", text: `${prefix} 爬取 ${url}…` });
          const html = await fetchHtml(url);
          if (!html) {
            await emit({ type: "store", ok: false, text: `${prefix} ${brand.name}：${url} 無法存取` });
            continue;
          }
          for (const [k, v] of Object.entries(extractLinks(html))) {
            merged[k] ??= v;
          }
        }

        // 找不到電話 → 試聯絡頁 fallback（只對第一個 website 嘗試）
        if (!merged.phone && websites[0] && !/facebook|instagram|line|linktr/i.test(websites[0])) {
          const fallbackPhone = await findPhoneFromContactPage(websites[0]);
          if (fallbackPhone) {
            merged.phone = fallbackPhone;
            await emit({ type: "step", text: `${prefix} 聯絡頁找到電話` });
          }
        }

        if (Object.keys(merged).length === 0) {
          await emit({ type: "store", ok: false, text: `${prefix} ${brand.name}：找不到任何聯絡管道` });
          skipped++;
          continue;
        }

        for (const [ch, value] of Object.entries(merged)) {
          await upsertChannel(sb, brand.id, ch, value, websites[0]);
        }

        enriched++;
        totalCh += Object.keys(merged).length;
        await emit({
          type: "store",
          ok: true,
          text: `${prefix} ✓ ${brand.name}：找到 ${Object.keys(merged).join("、")}`,
        });
      }

      await emit({
        type: "done",
        data: { total: brands.length, enriched, skipped, total_channels: totalCh },
      });
    } catch (e) {
      await emit({ type: "error", text: e instanceof Error ? e.message : "爬取失敗" });
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
