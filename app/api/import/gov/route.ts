// app/api/import/gov/route.ts
// POST /api/import/gov  — 政府開放資料匯入（Phase 1）
// body: { source, url?, csv?, dryRun?, max? }
//   source  GOV_SOURCES.id（gov:funeral / gov:lodging / gov:travel / gov:tcm）
//   url     實際下載連結（CSV 或 JSON）；或改用 csv 直接貼上內容
//   dryRun  true = 只解析統計、不寫入
//   max     本次最多匯入筆數（預設 5000）
// 串流 NDJSON 進度。匯進來的名單與 Google Places 共用 brands/stores。

import { NextRequest } from "next/server";
import https from "node:https";
import http from "node:http";
import JSZip from "jszip";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSource, type GovSource } from "@/lib/import/govSources";

export const maxDuration = 300;

const MAX_DEFAULT = 5000;
const MAX_CAP = 30000;
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
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const data = JSON.parse(t);
  if (Array.isArray(data)) return data;
  // 取「最大的物件陣列」（觀光署 JSON 包在 { Hotels: [...] } 之類的鍵下，最多往下找一層）
  let best: unknown[] = [];
  const consider = (v: unknown) => {
    if (Array.isArray(v) && v.length > best.length && (v.length === 0 || typeof v[0] === "object")) best = v;
  };
  if (data && typeof data === "object") {
    for (const v of Object.values(data)) {
      consider(v);
      if (v && typeof v === "object" && !Array.isArray(v)) for (const v2 of Object.values(v)) consider(v2);
    }
  }
  return best as Record<string, unknown>[];
}

// 扁平 XML（如觀光署旅行業 <dataroot><gryTRAVEL><TAG>值</TAG>…）→ 物件陣列
function parseFlatXml(text: string): Record<string, string>[] {
  const t = text.replace(/<\?xml[^>]*\?>/, "");
  const rootM = t.match(/<([A-Za-z_][\w.:-]*)\b[^>]*>/);
  if (!rootM) return [];
  const afterRoot = t.slice((rootM.index ?? 0) + rootM[0].length);
  const childM = afterRoot.match(/<([A-Za-z_][\w.:-]*)\b[^>]*>/);
  if (!childM) return [];
  const rec = childM[1];
  const blocks = afterRoot.match(new RegExp(`<${rec}\\b[^>]*>[\\s\\S]*?</${rec}>`, "g")) || [];
  const decode = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).trim();
  const openRe = new RegExp(`^<${rec}\\b[^>]*>`);
  const closeRe = new RegExp(`</${rec}>$`);
  return blocks.map((b) => {
    const inner = b.replace(openRe, "").replace(closeRe, ""); // 去掉外層 record 標籤，只留欄位
    const o: Record<string, string> = {};
    // 標籤名允許中文（宗教資訊系統用 <寺廟名稱> 等中文標籤）
    for (const m of inner.matchAll(/<([^\s/>!?]+)>([\s\S]*?)<\/\1>/g)) o[m[1]] = decode(m[2]);
    return o;
  });
}

// 下載成 bytes：先用標準 fetch；遇到「政府網站憑證鏈不完整」(很常見) 才退回寬鬆 TLS 重抓。
// 僅限使用者明確選取的公開政府開放資料，且只在憑證鏈錯誤時觸發。
async function fetchBytes(url: string): Promise<Uint8Array> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(90_000), cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    // HTTP 狀態碼異常也再用 node:https 試一次（有些政府站對 undici 回應不正常，對傳統 https 正常）
  } catch {
    // 連線層失敗（憑證鏈不完整 / 連線逾時 UND_ERR_CONNECT_TIMEOUT / 連線被 reset）→ 退回 node:https
  }
  // node:https：無 undici 的 10 秒連線逾時限制、較長逾時、寬鬆 TLS、自動跟隨轉址
  return httpsGetInsecure(url);
}

function httpsGetInsecure(url: string, redirects = 0): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("重導次數過多"));
    const lib = url.startsWith("http://") ? http : https;
    const req = lib.get(url, { rejectUnauthorized: false, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 120_000 }, (res) => {
      const sc = res.statusCode || 0;
      if (sc >= 300 && sc < 400 && res.headers.location) {
        res.resume();
        return resolve(httpsGetInsecure(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (sc >= 400) { res.resume(); return reject(new Error(`HTTP ${sc}`)); }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("逾時")));
  });
}

const decodeUtf8 = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

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

// 依診所名稱判斷科別（順序有意義：中醫/牙醫/專科先於一般內外科）
const CLINIC_SPECIALTY: [RegExp, string][] = [
  [/中醫/, "中醫診所"],
  [/牙醫|齒科|口腔/, "牙醫診所"],
  [/獸醫|動物醫院/, "獸醫診所"],
  [/小兒|兒科/, "小兒科診所"],
  [/婦產|婦科|產科|生殖|不孕/, "婦產科診所"],
  [/皮膚|醫美|美容醫學|整形/, "皮膚科診所"],
  [/眼科/, "眼科診所"],
  [/耳鼻喉/, "耳鼻喉科診所"],
  [/骨科/, "骨科診所"],
  [/復健/, "復健科診所"],
  [/身心|精神|心理/, "身心科診所"],
  [/泌尿/, "泌尿科診所"],
  [/神經/, "神經科診所"],
  [/心臟|心血管/, "心臟科診所"],
  [/家醫|家庭醫學/, "家醫科診所"],
  [/外科/, "外科診所"],
  [/內科|新陳代謝|腸胃|肝膽|胸腔|腎臟/, "內科診所"],
];
function classifyClinic(name: string): string {
  for (const [re, cat] of CLINIC_SPECIALTY) if (re.test(name)) return cat;
  return "一般診所";
}

interface ParsedRow {
  brand_key: string;
  name: string; industry: string; industry_sub: string | null;
  address: string | null; phone: string | null; website: string | null; owner: string | null;
  hotel_stars: number | null; hotel_rooms: number | null; hotel_type: string | null;
}

interface RawFields {
  name: string; tax_id?: string; address?: string; phone?: string; website?: string;
  owner?: string; sub?: string; stars?: number | null; rooms?: number | null; htype?: string;
}

// 巢狀格式（觀光署旅宿 V2.0）專屬對應；其他來源走通用 pick
const asArr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const asStr = (v: unknown): string => (v == null ? "" : String(v).trim());

const RECORD_MAPPERS: Record<string, (r: Record<string, unknown>) => RawFields | null> = {
  "gov:lodging": (r) => {
    const name = asStr(r.HotelName) || asStr(r.Name);
    if (!name) return null;
    const pa = (r.PostalAddress && typeof r.PostalAddress === "object" ? r.PostalAddress : {}) as Record<string, unknown>;
    const address = [asStr(pa.City), asStr(pa.Town), asStr(pa.StreetAddress)].filter(Boolean).join("");
    const tel = asStr(asArr(r.Telephones).find((t) => asStr(t.Tel))?.Tel);
    const orgs = asArr(r.Organizations);
    const op = orgs.find((o) => asStr(o.Class) === "Operator") ?? orgs[0];
    const clsArr = Array.isArray(r.HotelClasses) ? (r.HotelClasses as number[]) : [];
    const isBnb = clsArr.includes(4) || /民宿/.test(asStr(r.HotelLicenseNumber));
    const stars = typeof r.HotelStars === "number" && r.HotelStars > 0 ? r.HotelStars : null;
    const rooms = typeof r.TotalRooms === "number" && r.TotalRooms > 0 ? r.TotalRooms : null;
    return {
      name, address: address || undefined, phone: tel || undefined,
      website: asStr(r.WebsiteURL) || undefined, owner: op ? asStr(op.Name) || undefined : undefined,
      htype: isBnb ? "民宿" : "旅館", stars, rooms,
    };
  },
};

function mapRow(src: GovSource, row: Record<string, unknown>): ParsedRow | null {
  let f: RawFields | null;
  const mapper = RECORD_MAPPERS[src.id];
  if (mapper) {
    f = mapper(row);
  } else {
    const name = pick(row, src.fields.name);
    if (!name) return null;
    // 跳過「標題回音」列（部分名冊第二列是中文欄位名，如：協會名稱 / 機構名稱）
    if (/^(協會名稱|團體名稱|機構名稱|公司名稱|寺廟名稱|名稱|公司名)$/.test(name)) return null;
    // 列過濾（例如健保院所只留中醫、護理機構只留產後護理）
    if (src.rowFilter) {
      const hay = src.rowFilter.field.map((x) => pick(row, [x])).join(" ");
      if (!src.rowFilter.includes.some((kw) => hay.includes(kw))) return null;
    }
    f = {
      name,
      tax_id: pick(row, src.fields.tax_id) || undefined,
      address: pick(row, src.fields.address) || undefined,
      phone: pick(row, src.fields.phone) || undefined,
      website: pick(row, src.fields.website) || undefined,
      owner: pick(row, src.fields.owner) || undefined,
      sub: pick(row, src.fields.sub) || undefined,
      stars: intOf(pick(row, src.fields.stars)),
      rooms: intOf(pick(row, src.fields.rooms)),
      htype: pick(row, src.fields.htype) || undefined,
    };
  }
  if (!f || !f.name) return null;

  const address = f.address || null;
  let industry = src.industry;
  if (src.id === "gov:lodging" && f.htype) industry = f.htype.includes("民宿") ? "民宿" : "旅館";
  // 全部診所：依名稱自動分科（內科/小兒科/婦產科/牙醫…）；中醫已有專屬來源 gov:tcm，這裡跳過避免重複
  if (src.id === "gov:clinic") {
    if (/中醫/.test(f.name) || (f.sub || "").includes("中醫")) return null;
    industry = classifyClinic(f.name);
  }

  return {
    brand_key: `${src.id}|${normName(f.name)}|${cityOf(address || "")}`,
    name: f.name,
    industry,
    industry_sub: f.sub || (src.id === "gov:lodging" ? f.htype || null : src.id === "gov:clinic" ? f.sub || null : null),
    address,
    phone: f.phone || null,
    website: f.website || null,
    owner: f.owner || null,
    hotel_stars: f.stars ?? null,
    hotel_rooms: f.rooms ?? null,
    hotel_type: f.htype || null,
  };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch {}

  const sourceId = String(body.source || "");
  const mapping = (body.mapping && typeof body.mapping === "object" ? body.mapping : {}) as Record<string, string>;
  let src = getSource(sourceId);
  // 自訂 CSV：依使用者選的欄位對應臨時組一個來源
  if (sourceId === "custom") {
    src = {
      id: "manual", label: "自訂 CSV", industry: String(body.industry || "").trim() || "未分類",
      format: "csv", hasPhone: !!mapping.phone, datasetUrl: "", phase: 1,
      fields: {
        name:    mapping.name ? [mapping.name] : [],
        tax_id:  mapping.tax_id ? [mapping.tax_id] : undefined,
        address: mapping.address ? [mapping.address] : undefined,
        phone:   mapping.phone ? [mapping.phone] : undefined,
        owner:   mapping.owner ? [mapping.owner] : undefined,
        sub:     mapping.sub ? [mapping.sub] : undefined,
      },
    };
  }
  const url = (typeof body.url === "string" && body.url.trim()) ? body.url.trim() : (src?.defaultUrl || "");
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
      if (src.needsApplication) { await emit({ type: "error", text: "此來源需先向 GCIS 申請 IP 白名單後才能匯入" }); return; }
      if (sourceId === "custom" && !mapping.name) { await emit({ type: "error", text: "請指定「名稱」對應的欄位" }); return; }
      if (!url && !csvText) { await emit({ type: "error", text: "請提供下載 url 或貼上 csv 內容" }); return; }
      if (url && !/^https:\/\//.test(url)) { await emit({ type: "error", text: "url 必須是 https" }); return; }

      const sb = getSupabaseServerClient();

      // 1+2) 取得 + 解析（依格式：csv / json / xml / zip 內 json）
      await emit({ type: "step", text: `讀取 ${src.label} 資料…` });
      let rows: Record<string, unknown>[] = [];
      try {
        if (csvText) {
          const t = csvText.trim();
          rows = t.startsWith("[") || t.startsWith("{") ? jsonToObjects(csvText)
               : t.startsWith("<") ? parseFlatXml(csvText)
               : csvToObjects(csvText);
        } else {
          const bytes = await fetchBytes(url);
          if (src.format === "zipjson") {
            await emit({ type: "step", text: "解壓縮 ZIP…" });
            const zip = await JSZip.loadAsync(bytes);
            const entry = Object.keys(zip.files).find((n) => /\.json$/i.test(n)) || Object.keys(zip.files).find((n) => !zip.files[n].dir);
            if (!entry) { await emit({ type: "error", text: "ZIP 內找不到 JSON 檔" }); return; }
            rows = jsonToObjects(await zip.files[entry].async("string"));
          } else if (src.format === "xml") {
            rows = parseFlatXml(decodeUtf8(bytes));
          } else if (src.format === "json") {
            rows = jsonToObjects(decodeUtf8(bytes));
          } else {
            rows = csvToObjects(decodeUtf8(bytes));
          }
        }
      } catch (e) {
        const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
        const detail = cause?.code || cause?.message ? `（${cause?.code || ""} ${cause?.message || ""}）` : "";
        const msg = (e instanceof Error ? e.message : "") + (cause?.code || "");
        const isConn = /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|timeout|fetch failed/i.test(msg);
        const hint = isConn ? "：政府網站此刻連不上（常態性不穩）。請稍後重試，或展開下方「改貼上檔案內容」把在瀏覽器下載到的檔案貼上匯入。" : "";
        await emit({ type: "error", text: `下載/解析失敗：${e instanceof Error ? e.message : "格式錯誤"}${detail}${hint}` }); return;
      }
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
        // DB 層級去重：onConflict=brand_key + ignoreDuplicates → 已存在者由 DB 自動略過，
        // 只回傳「真正新增」的列。不再用脆弱的 .in(500 個長 key) 預先查詢（會因網址過長失效→撞唯一鍵）。
        const { data: ins, error } = await sb.from("brands").upsert(
          chunk.map((c) => ({
            name: c.name, brand_key: c.brand_key, industry: c.industry, industry_sub: c.industry_sub,
            owner_name: c.owner, data_source: src.id, status: "new",
            hotel_stars: c.hotel_stars, hotel_rooms: c.hotel_rooms, hotel_type: c.hotel_type,
          })),
          { onConflict: "brand_key", ignoreDuplicates: true }
        ).select("id, brand_key");
        if (error) { await emit({ type: "store", ok: false, text: `批次寫入失敗：${error.message}` }); continue; }

        const idByKey = new Map((ins || []).map((b) => [b.brand_key, b.id]));
        duplicate += chunk.length - (ins?.length || 0);
        // 只對「真正新增」的品牌建立門市 / 電話管道
        const stores = chunk.filter((c) => idByKey.has(c.brand_key) && (c.address || c.phone || c.website)).map((c) => ({
          brand_id: idByKey.get(c.brand_key), name: c.name, address: c.address, phone: c.phone, website: c.website,
        }));
        if (stores.length) await sb.from("stores").insert(stores);
        const chans = chunk.filter((c) => idByKey.has(c.brand_key) && c.phone).map((c) => ({
          brand_id: idByKey.get(c.brand_key), channel: "phone", value: c.phone, fetched_at: new Date().toISOString(),
        }));
        if (chans.length) await sb.from("brand_channels").insert(chans);

        imported += ins?.length || 0;
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
