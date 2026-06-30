// app/api/import/gov/route.ts
// POST /api/import/gov  — 政府開放資料匯入（Phase 1）
// body: { source, url?, csv?, dryRun?, max? }
//   source  GOV_SOURCES.id（gov:funeral / gov:lodging / gov:travel / gov:tcm）
//   url     實際下載連結（CSV 或 JSON）；或改用 csv 直接貼上內容
//   dryRun  true = 只解析統計、不寫入
//   max     本次最多匯入筆數（預設 5000）
// 串流 NDJSON 進度。匯進來的名單與 Google Places 共用 brands/stores。

import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSource, type GovSource } from "@/lib/import/govSources";

export const maxDuration = 300;

const MAX_DEFAULT = 5000;
const MAX_CAP = 20000;
const CHUNK = 500;

// ── CSV 解析（處理雙引號包覆） ──────────────────────────────
function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvToObjects(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const h0 = lines[0].charCodeAt(0) === 0xfeff ? lines[0].slice(1) : lines[0];
  const header = parseCsvLine(h0).map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const o: Record<string, string> = {};
    header.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
    return o;
  });
}

function jsonToObjects(text: string): Record<string, unknown>[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  for (const v of Object.values(data ?? {})) if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [];
}

// 大小寫不敏感取第一個非空候選欄位
function pick(row: Record<string, unknown>, keys?: string[]): string {
  if (!keys) return "";
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function cityOf(address: string): string {
  const m = address.match(/^(臺|台)?[一-鿿]{0,2}(市|縣)/);
  return m ? m[0].replace(/^臺/, "台") : "";
}

function normName(name: string): string {
  return name.split(/[｜|│]/)[0].replace(/\s+/g, "").slice(0, 40);
}

const intOf = (s: string): number | null => {
  const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

interface ParsedRow {
  brand_key: string;
  name: string; industry: string; industry_sub: string | null;
  address: string | null; phone: string | null; website: string | null; owner: string | null;
  hotel_stars: number | null; hotel_rooms: number | null; hotel_type: string | null;
}

function mapRow(src: GovSource, row: Record<string, unknown>): ParsedRow | null {
  const name = pick(row, src.fields.name);
  if (!name) return null;

  // 列過濾（例如健保院所只留中醫）
  if (src.rowFilter) {
    const hay = src.rowFilter.field.map((f) => pick(row, [f])).join(" ");
    if (!src.rowFilter.includes.some((kw) => hay.includes(kw))) return null;
  }

  const address = pick(row, src.fields.address) || null;
  const htype = pick(row, src.fields.htype) || null;
  // 旅宿：依 Class 自動分旅館/民宿
  let industry = src.industry;
  if (src.id === "gov:lodging" && htype) industry = htype.includes("民宿") ? "民宿" : "旅館";

  return {
    brand_key: `${src.id}|${normName(name)}|${cityOf(address || "")}`,
    name,
    industry,
    industry_sub: pick(row, src.fields.sub) || (src.id === "gov:lodging" ? htype : null),
    address,
    phone: pick(row, src.fields.phone) || null,
    website: pick(row, src.fields.website) || null,
    owner: pick(row, src.fields.owner) || null,
    hotel_stars: intOf(pick(row, src.fields.stars)),
    hotel_rooms: intOf(pick(row, src.fields.rooms)),
    hotel_type: htype,
  };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch {}

  const src = getSource(String(body.source || ""));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const csvText = typeof body.csv === "string" ? body.csv : "";
  const dryRun = !!body.dryRun;
  const max = Math.min(Math.max(Number(body.max) || MAX_DEFAULT, 1), MAX_CAP);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = (o: object) => writer.write(enc.encode(JSON.stringify(o) + "\n"));

  (async () => {
    try {
      if (!src) { await emit({ type: "error", text: "未知的資料來源" }); return; }
      if (!url && !csvText) { await emit({ type: "error", text: "請提供下載 url 或貼上 csv 內容" }); return; }
      if (url && !/^https:\/\//.test(url)) { await emit({ type: "error", text: "url 必須是 https" }); return; }

      const sb = getSupabaseServerClient();

      // 1) 取得原始資料
      await emit({ type: "step", text: `讀取 ${src.label} 資料…` });
      let raw = "";
      if (csvText) raw = csvText;
      else {
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) { await emit({ type: "error", text: `下載失敗 HTTP ${res.status}` }); return; }
        raw = await res.text();
      }

      // 2) 解析
      const isJson = csvText ? raw.trim().startsWith("[") || raw.trim().startsWith("{") : src.format === "json";
      let rows: Record<string, unknown>[];
      try { rows = isJson ? jsonToObjects(raw) : csvToObjects(raw); }
      catch (e) { await emit({ type: "error", text: `解析失敗：${e instanceof Error ? e.message : "格式錯誤"}` }); return; }
      await emit({ type: "step", text: `原始 ${rows.length} 筆，開始對應欄位…` });

      // 3) 對應 + 過濾 + 去重（檔內）
      const blacklist = ((await sb.from("collection_blacklist").select("keyword")).data || []).map((r) => r.keyword).filter(Boolean);
      const seen = new Set<string>();
      const parsed: ParsedRow[] = [];
      let skippedFilter = 0, skippedBlack = 0;
      for (const r of rows) {
        const m = mapRow(src, r);
        if (!m) { skippedFilter++; continue; }
        if (blacklist.some((kw) => m.name.includes(kw))) { skippedBlack++; continue; }
        if (seen.has(m.brand_key)) continue;
        seen.add(m.brand_key);
        parsed.push(m);
        if (parsed.length >= max) break;
      }
      await emit({ type: "step", text: `可匯入 ${parsed.length} 筆（過濾 ${skippedFilter}、黑名單 ${skippedBlack}）` });

      if (parsed.length === 0) { await emit({ type: "done", data: { imported: 0, duplicate: 0, parsed: 0, dryRun } }); return; }

      // 4) 寫入（分批；以 brand_key 去重，已存在者跳過 → 可重複匯入不會重複）
      let imported = 0, duplicate = 0;
      const sample = parsed.slice(0, 5).map((p) => ({ name: p.name, industry: p.industry, phone: p.phone, address: p.address }));

      if (dryRun) {
        await emit({ type: "done", data: { parsed: parsed.length, imported: 0, duplicate: 0, dryRun: true, sample } });
        return;
      }

      for (let i = 0; i < parsed.length; i += CHUNK) {
        const chunk = parsed.slice(i, i + CHUNK);
        const keys = chunk.map((c) => c.brand_key);
        const { data: existing } = await sb.from("brands").select("brand_key").in("brand_key", keys);
        const have = new Set((existing || []).map((e) => e.brand_key));
        const fresh = chunk.filter((c) => !have.has(c.brand_key));
        duplicate += chunk.length - fresh.length;

        if (fresh.length) {
          const { data: ins, error } = await sb.from("brands").insert(
            fresh.map((c) => ({
              name: c.name, brand_key: c.brand_key, industry: c.industry, industry_sub: c.industry_sub,
              owner_name: c.owner, data_source: src.id, status: "new",
              hotel_stars: c.hotel_stars, hotel_rooms: c.hotel_rooms, hotel_type: c.hotel_type,
            }))
          ).select("id, brand_key");
          if (error) { await emit({ type: "store", ok: false, text: `批次寫入失敗：${error.message}` }); continue; }

          const idByKey = new Map((ins || []).map((b) => [b.brand_key, b.id]));
          // store（電話/地址/官網）
          const stores = fresh.filter((c) => c.address || c.phone || c.website).map((c) => ({
            brand_id: idByKey.get(c.brand_key), name: c.name,
            address: c.address, phone: c.phone, website: c.website,
          })).filter((s) => s.brand_id);
          if (stores.length) await sb.from("stores").insert(stores);
          // 電話管道
          const chans = fresh.filter((c) => c.phone).map((c) => ({
            brand_id: idByKey.get(c.brand_key), channel: "phone", value: c.phone, fetched_at: new Date().toISOString(),
          })).filter((c) => c.brand_id);
          if (chans.length) await sb.from("brand_channels").insert(chans);

          imported += ins?.length || 0;
        }
        await emit({ type: "progress", text: `已處理 ${Math.min(i + CHUNK, parsed.length)}/${parsed.length}（新增 ${imported}、重複 ${duplicate}）`, imported, duplicate });
      }

      await emit({ type: "done", data: { parsed: parsed.length, imported, duplicate, dryRun: false, sample } });
    } catch (e) {
      await emit({ type: "error", text: e instanceof Error ? e.message : "匯入失敗" });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

// 來源清單（前端用）
export async function GET() {
  const { GOV_SOURCES } = await import("@/lib/import/govSources");
  return Response.json({ sources: GOV_SOURCES });
}
