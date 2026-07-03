"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { C, downloadCSV, INDUSTRIES, CHANNELS, CHANNEL_ORDER } from "@/lib/design";

// ── 來源定義 ─────────────────────────────────────────
const SOURCES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  gov: { label: "工商登記", icon: "🏛", color: "#7B6E99", bg: "#EAE5F0" },
  line: { label: "LINE", icon: "💬", color: "#06A74A", bg: "#E3F5EB" },
  fb: { label: "FB", icon: "📘", color: "#1877F2", bg: "#E3EDFB" },
  ig: { label: "IG", icon: "📸", color: "#C13584", bg: "#F5E3F0" },
  map: { label: "地圖", icon: "📍", color: "#D97706", bg: "#FEF3C7" },
  website: { label: "官網", icon: "🌐", color: "#2D7D46", bg: "#E3F5EB" },
};

// ── 國家設定 ─────────────────────────────────────────
const COUNTRIES = [
  { code: "TW", label: "台灣", flag: "🇹🇼" },
  { code: "JP", label: "日本", flag: "🇯🇵" },
  { code: "UK", label: "英國", flag: "🇬🇧" },
  { code: "CA", label: "加拿大", flag: "🇨🇦" },
] as const;
type CountryCode = "TW" | "JP" | "UK" | "CA";

const JP_CITIES = ["東京都", "大阪府", "神奈川県", "愛知県", "福岡県", "北海道", "兵庫県", "埼玉県", "千葉県", "静岡県"];
const UK_CITIES = ["London", "Manchester", "Birmingham", "Glasgow", "Leeds", "Edinburgh", "Bristol", "Liverpool", "Sheffield", "Cardiff"];
const CA_CITIES = ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Edmonton", "Winnipeg", "Mississauga", "Richmond", "Markham"];
const JP_KEYWORDS = ["フットバス", "足湯用品", "足浴器", "台湾茶 輸入", "中国茶 輸入", "ハーブティー 卸", "健康器具 輸入"];
const EN_KEYWORDS = ["foot bath", "foot spa importer", "wellness products", "tea importer", "herbal tea wholesale", "Chinese tea", "Asian wellness"];

type TaskStatusKey = "done" | "running" | "queued" | "error" | "stale";

const TASK_STATUS: Record<TaskStatusKey, { label: string; color: string; bg: string }> = {
  done: { label: "完成", color: C.success, bg: C.successBg },
  running: { label: "採集中", color: C.primary, bg: C.p50 },
  queued: { label: "待執行", color: C.muted, bg: C.surf2 },
  error: { label: "失敗", color: C.danger, bg: C.dangerBg },
  stale: { label: "已過期", color: C.warning, bg: C.warningBg },
};

interface ReviewEntry {
  author: string;
  rating: number;
  text: string;
  time: string;
}

interface ScrapeTask {
  status: TaskStatusKey;
  last: string | null;
  result: Record<string, string | number> | null;
  error?: string;
  progress?: string;
  extra?: { reviews?: ReviewEntry[] };
}

interface Conflict {
  field: string;
  current: string;
  collected: string;
  source: string;
  accepted: boolean | null;
  recordId?: string; // 真實模式：gov_records.id，確認時回寫 DB
}

interface StoreData {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  gmapsUrl?: string;
}

interface ScrapeBrand {
  id: number | string;
  name: string;
  industry: string;
  score: number;
  stage: string;
  isChain: boolean;
  chainType: string | null;
  storeCount: number;
  tasks: Record<string, ScrapeTask>;
  conflicts: Conflict[];
  stores: StoreData[];
  channels: string[];
  cities: string[];
  districts: string[];
  tax_id: string | null;
}

// 民國日期 "1051018" → "民國105年10月18日"
function fmtRocDate(s: string): string {
  const m = s.replace(/\D/g, "").match(/^(\d{3})(\d{2})(\d{2})$/);
  return m ? `民國${m[1]}年${parseInt(m[2])}月${parseInt(m[3])}日` : s;
}

// 將 DB 品牌映射為採集中心視圖（依現有資料推導各來源狀態）
function dbBrandToScrapeBrand(b: Record<string, unknown>): ScrapeBrand {
  const chRows = (Array.isArray(b.brand_channels) ? b.brand_channels : []) as { channel: string; value: string }[];
  const links: Record<string, string> = {};
  for (const c of chRows) if (c.channel && c.value) links[c.channel] = c.value;
  const storeCount = (b.store_count as number) || 0;

  // 從 stores 取完整門市資料
  type StoreRow = { id?: string; name?: string; address?: string; city: string; phone?: string | null; rating?: number | null; review_count?: number | null; gmaps_url: string | null; store_reviews?: { rating: number | null; text: string | null; author_name: string | null; relative_time: string | null }[] };
  const storeRows = (Array.isArray(b.stores) ? b.stores : []) as StoreRow[];
  const gmapsUrl = links.map || storeRows.find((s) => s.gmaps_url)?.gmaps_url || null;

  const stores: StoreData[] = storeRows.map((s) => ({
    id: s.id,
    name: s.name || "",
    address: s.address || "",
    city: s.city || "",
    phone: s.phone || "",
    rating: s.rating ?? undefined,
    reviewCount: s.review_count ?? undefined,
    gmapsUrl: s.gmaps_url || "",
  }));

  // 最新 5 筆評論（跨所有門市合併）
  const reviews: ReviewEntry[] = storeRows
    .flatMap((s) => (s.store_reviews || []).map((r) => ({
      author: r.author_name || "匿名",
      rating: r.rating || 0,
      text: r.text || "",
      time: r.relative_time || "",
    })))
    .slice(0, 5);

  // 低信心工商登記比對 → 待人工確認差異
  const govRecs = (Array.isArray(b.gov_records) ? b.gov_records : []) as {
    id: string;
    tax_id: string | null;
    name: string;
    owner_name: string | null;
    match_confidence: string;
  }[];
  const conflicts: Conflict[] = govRecs
    .filter((r) => r.match_confidence === "low")
    .map((r) => ({
      field: "工商登記歸屬",
      current: b.tax_id
        ? `${(b.registered_name as string) || (b.name as string)}・統編 ${b.tax_id}`
        : `${b.name as string}（尚無統編資料）`,
      collected: `${r.name}・統編 ${r.tax_id || "—"}${r.owner_name ? `・負責人 ${r.owner_name}` : ""}`,
      source: "gov",
      accepted: null,
      recordId: r.id,
    }));

  // gov task：已有統編=done；只有登記名（低信心）=stale；無=queued
  const govDone = !!b.tax_id;
  const govPartial = !b.tax_id && !!b.registered_name;
  const govResult = govDone || govPartial ? {
    ...(b.tax_id ? { 統編: b.tax_id as string } : {}),
    ...(b.registered_name ? { 登記名: b.registered_name as string } : {}),
    ...(b.owner_name ? { 負責人: b.owner_name as string } : {}),
    ...(b.capital ? { 資本額: `NT$${(b.capital as number).toLocaleString()}` } : {}),
    ...(b.setup_date ? { 成立: fmtRocDate(b.setup_date as string) } : {}),
    ...(b.company_address ? { 地址: b.company_address as string } : {}),
  } : null;

  const avgRating = storeRows.length > 0
    ? storeRows.reduce((s, r) => s + (r.rating || 0), 0) / storeRows.filter((r) => r.rating).length || 0
    : 0;

  const tasks: Record<string, ScrapeTask> = {
    gov: govDone
      ? { status: "done", last: "已比對", result: govResult }
      : govPartial
      ? { status: "stale", last: "低信心比對", result: govResult }
      : { status: "queued", last: null, result: null },
    line: links.line ? { status: "done", last: "已取得", result: { 連結: links.line } } : { status: "queued", last: null, result: null },
    fb: links.fb ? { status: "done", last: "已取得", result: { 連結: links.fb } } : { status: "queued", last: null, result: null },
    ig: links.ig ? { status: "done", last: "已取得", result: { 連結: links.ig } } : { status: "queued", last: null, result: null },
    // 只有真實有 place_id 的門市（storeRows 有資料）才算 done
    map: storeRows.length > 0
      ? { status: "done", last: "Places", result: { 門市數: storeRows.length, ...(avgRating > 0 ? { 平均評分: `${avgRating.toFixed(1)} ★` } : {}), ...(gmapsUrl ? { 地圖: gmapsUrl } : {}) }, extra: reviews.length ? { reviews } : undefined }
      : { status: "queued", last: null, result: null },
  };

  return {
    id: b.id as string,
    name: (b.name as string) || "未命名",
    industry: (b.industry as string) || "",
    score: (b.priority_score as number) ?? 50,
    stage: (b.status as string) || "new",
    isChain: !!(b.is_chain),
    chainType: (b.chain_type as string | null) || null,
    storeCount,
    tasks,
    conflicts,
    stores,
    channels: Object.keys(links),
    cities: [...new Set(storeRows.map((s) => s.city).filter(Boolean))] as string[],
    districts: [...new Set(storeRows.map((s) => {
      const m = (s.address || "").match(/[^\d]{2,3}[市縣](.{1,3}[區鄉鎮市])/);
      return m ? m[1] : "";
    }).filter(Boolean))] as string[],
    tax_id: (b.tax_id as string | null) || null,
  };
}


// ── 輔助 ─────────────────────────────────────────────
const completeness = (tasks: Record<string, ScrapeTask>) => {
  const total = Object.keys(tasks).length;
  const done = Object.values(tasks).filter((t) => t.status === "done").length;
  return Math.round((done / total) * 100);
};

function Pct({ value, size = 36 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const color = value >= 80 ? C.success : value >= 50 ? C.primary : C.warning;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surf2} strokeWidth={3.5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3.5} strokeDasharray={`${(value / 100) * circ} ${circ}`} strokeLinecap="round" />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fontWeight="700"
        fill={color}
        fontFamily="inherit"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {value}%
      </text>
    </svg>
  );
}

// ── 品牌清單（左欄）──────────────────────────────────
function BrandList({
  brands,
  selectedId,
  onSelect,
  onRunAll,
  isMobile,
  search,
  onSearch,
  total,
  limited,
}: {
  brands: ScrapeBrand[];
  selectedId: number | string | null;
  onSelect: (id: number | string) => void;
  onRunAll: () => void;
  isMobile?: boolean;
  search: string;
  onSearch: (s: string) => void;
  total?: number | null;
  limited?: boolean;
}) {
  return (
    <div style={{ width: isMobile ? "100%" : 280, flexShrink: 0, borderRight: isMobile ? "none" : `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            品牌名單
            <span style={{ fontSize: 11, fontWeight: 400, color: C.muted, marginLeft: 6 }}>
              {total != null && limited ? `${brands.length.toLocaleString()} / ${total.toLocaleString()}` : brands.length.toLocaleString()}
            </span>
          </span>
          <button
            onClick={onRunAll}
            className="pressable"
            style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: C.primary, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
          >
            ⚡ 全部採集
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜尋品牌名稱…"
          style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surf2, color: C.text, outline: "none" }}
        />
        {limited && (
          <div style={{ fontSize: 11, color: C.warning }}>
            資料量大，僅載入前 {brands.length.toLocaleString()} 筆（共 {total?.toLocaleString()}）。用搜尋或上方產業/篩選縮小範圍。
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {brands.map((b) => {
          const pct = completeness(b.tasks);
          const conflicts = b.conflicts.filter((c) => c.accepted === null).length;
          const isOn = b.id === selectedId;
          return (
            <div
              key={b.id}
              className="row-hover"
              onClick={() => onSelect(b.id)}
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: isOn ? C.p50 : "transparent",
                borderLeft: `3px solid ${isOn ? C.primary : "transparent"}`,
                transition: "all 120ms",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Pct value={pct} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {Object.entries(b.tasks).map(([src, task]) => {
                      const s = SOURCES[src];
                      const t = TASK_STATUS[task.status];
                      return (
                        <span key={src} style={{ padding: "1px 6px", borderRadius: 4, background: t.bg, color: t.color, fontSize: 10, fontWeight: 600 }}>
                          {s.icon}
                        </span>
                      );
                    })}
                    {b.channels.length === 0 && (
                      <span style={{ padding: "1px 7px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700 }}>未採集</span>
                    )}
                    {conflicts > 0 && (
                      <span style={{ padding: "1px 7px", borderRadius: 999, background: C.dangerBg, color: C.danger, fontSize: 10, fontWeight: 700 }}>⚠ {conflicts}筆差異</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 連結值自動轉 <a>，其餘值照常顯示
function ResultValue({ v }: { v: string | number }) {
  if (typeof v === "number") return <span>{v.toLocaleString()}</span>;
  if (/^https?:\/\//.test(v)) {
    const display = v.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: "#5B7C99", fontWeight: 600, textDecoration: "none", wordBreak: "break-all" }}>
        ↗ {display.length > 36 ? display.slice(0, 36) + "…" : display}
      </a>
    );
  }
  return <span>{v}</span>;
}

// ── 採集來源列 ───────────────────────────────────────
function TaskRow({ srcKey, task, onRun }: { srcKey: string; task: ScrapeTask; onRun: (src: string) => void }) {
  const src = SOURCES[srcKey];
  const st = TASK_STATUS[task.status];
  const running = task.status === "running";

  return (
    <div style={{ background: C.surface, borderRadius: 13, border: `1px solid ${C.border}`, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: task.result || task.error ? 10 : 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: src.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
          {src.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{src.label}</div>
          {task.last ? <div style={{ fontSize: 11, color: C.muted }}>上次採集：{task.last}</div> : <div style={{ fontSize: 11, color: C.muted }}>尚未採集</div>}
        </div>
        <span style={{ padding: "3px 10px", borderRadius: 999, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {running && (
            <span className="spin" style={{ marginRight: 4 }}>
              ↻
            </span>
          )}
          {st.label}
        </span>
        {!running && (
          <button
            onClick={() => onRun(srcKey)}
            className="pressable"
            style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surf2, cursor: "pointer", fontSize: 12, color: C.muted, flexShrink: 0 }}
          >
            {task.status === "error" ? "重試" : "採集"}
          </button>
        )}
      </div>

      {running && task.progress && (
        <div style={{ padding: "7px 10px", borderRadius: 8, background: C.p50, fontSize: 12, color: C.primary, display: "flex", alignItems: "center", gap: 6 }}>
          <span className="spin" style={{ fontSize: 10 }}>↻</span> {task.progress}
        </div>
      )}

      {task.error && <div style={{ padding: "7px 10px", borderRadius: 8, background: C.dangerBg, fontSize: 12, color: C.danger }}>✕ {task.error}</div>}

      {task.result && !task.error && (
        <div style={{ padding: "10px 12px", background: C.surf2, borderRadius: 9, display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
          {Object.entries(task.result).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ fontSize: 11, color: C.muted }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                <ResultValue v={v} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 評論列表（地圖來源才有）*/}
      {task.extra?.reviews?.length ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>最新評論</div>
          {task.extra.reviews.map((r, i) => (
            <div key={i} style={{ padding: "8px 10px", borderRadius: 8, background: C.surf2, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.author}</span>
                <span style={{ fontSize: 11, color: "#D9A44A" }}>{"★".repeat(Math.max(0, Math.min(r.rating, 5)))}</span>
                <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>{r.time}</span>
              </div>
              {r.text && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{r.text.length > 100 ? r.text.slice(0, 100) + "…" : r.text}</div>}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── 工商登記手動搜尋（Step B）────────────────────────
interface GovCandidate {
  Business_Accounting_NO: string;
  Company_Name: string;
  Responsible_Name?: string;
  Company_Location?: string;
  Company_Setup_Date?: string;
}

function GovManualSearch({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [candidates, setCandidates] = useState<GovCandidate[]>([]);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    setCandidates([]);
    try {
      const isId = /^\d{8}$/.test(q);
      const res = await fetch("/api/gov/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isId ? { tax_id: q } : { name: q }),
      });
      const json = await res.json();
      if (json.success) {
        const cands: GovCandidate[] = json.data.candidates || [];
        setCandidates(cands);
        if (cands.length === 0) setSearchErr("找不到符合的工商登記資料");
      } else {
        setSearchErr(json.error || "查詢失敗");
      }
    } catch {
      setSearchErr("網路錯誤");
    }
    setSearching(false);
  };

  const confirm = async (c: GovCandidate) => {
    setConfirming(true);
    try {
      await fetch("/api/gov/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, manual_tax_id: c.Business_Accounting_NO }),
      });
    } catch {}
    setConfirming(false);
    onDone();
  };

  return (
    <div style={{ marginTop: 10, padding: "14px 16px", borderRadius: 13, background: "#F0EBF8", border: "1px solid #DDD5EB" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#7B6E99", marginBottom: 6 }}>🔍 手動查詢工商登記</div>
      <div style={{ fontSize: 11, color: "#9D8EC1", marginBottom: 10 }}>
        輸入 8 位統一編號可直接查詢並寫入，或輸入公司名稱關鍵字搜尋候選清單
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !searching && search()}
          placeholder="統一編號（8碼）或公司名稱…"
          style={{ flex: 1, padding: "8px 11px", borderRadius: 9, border: `2px solid ${/^\d{8}$/.test(query.trim()) ? "#7B6E99" : "#DDD5EB"}`, background: "white", fontSize: 13, color: C.text, outline: "none", transition: "border-color 150ms" }}
        />
        <button
          onClick={search}
          disabled={searching || !query.trim()}
          style={{
            padding: "8px 14px",
            borderRadius: 9,
            border: "none",
            background: !query.trim() ? C.surf2 : "#7B6E99",
            color: !query.trim() ? C.muted : "white",
            fontSize: 13,
            fontWeight: 700,
            cursor: !query.trim() ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          {searching ? <span className="spin">↻</span> : "搜尋"}
        </button>
      </div>
      {searchErr && <div style={{ fontSize: 12, color: C.danger, marginBottom: 6 }}>{searchErr}</div>}
      {candidates.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {candidates.map((c) => (
            <div
              key={c.Business_Accounting_NO}
              onClick={() => !confirming && confirm(c)}
              className="row-hover"
              style={{
                padding: "10px 12px",
                borderRadius: 9,
                background: "white",
                border: "1px solid #DDD5EB",
                cursor: confirming ? "default" : "pointer",
                opacity: confirming ? 0.6 : 1,
                transition: "all 120ms",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.Company_Name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>統編 {c.Business_Accounting_NO}</span>
                {c.Responsible_Name && <span>負責人 {c.Responsible_Name}</span>}
                {c.Company_Location && <span>{c.Company_Location.slice(0, 14)}</span>}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 2 }}>點擊任一筆確認並寫回品牌</div>
        </div>
      )}
    </div>
  );
}

// ── 差異確認列 ───────────────────────────────────────
function ConflictRow({ conflict, onAccept, onReject }: { conflict: Conflict; onAccept: () => void; onReject: () => void }) {
  const src = SOURCES[conflict.source];
  const resolved = conflict.accepted !== null;
  return (
    <div style={{ background: C.surface, borderRadius: 13, border: `1px solid ${resolved ? C.border : C.danger + "50"}`, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: src.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
          {src.icon}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{conflict.field}</span>
        {resolved && (
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 9px",
              borderRadius: 999,
              background: conflict.accepted ? C.successBg : C.surf2,
              color: conflict.accepted ? C.success : C.muted,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {conflict.accepted ? "✓ 已更新" : "✕ 已忽略"}
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: resolved ? 0 : 12 }}>
        <div style={{ padding: "8px 12px", borderRadius: 9, background: C.surf2, fontSize: 13 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>現有資料</div>
          <div style={{ fontWeight: 600, color: C.muted, textDecoration: "line-through", opacity: 0.7 }}>{conflict.current}</div>
        </div>
        <div style={{ fontSize: 16, color: C.muted }}>→</div>
        <div style={{ padding: "8px 12px", borderRadius: 9, background: C.successBg, border: `1px solid ${C.success}40`, fontSize: 13 }}>
          <div style={{ fontSize: 10, color: C.success, marginBottom: 2 }}>採集結果</div>
          <div style={{ fontWeight: 700, color: C.success }}>{conflict.collected}</div>
        </div>
      </div>
      {!resolved && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onAccept}
            className="pressable"
            style={{ flex: 1, padding: 8, borderRadius: 9, border: "none", background: C.success, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            ✓ 更新資料
          </button>
          <button
            onClick={onReject}
            className="pressable"
            style={{ flex: 1, padding: 8, borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}
          >
            忽略
          </button>
        </div>
      )}
    </div>
  );
}

// ── 詳情面板（右欄）──────────────────────────────────
function DetailPanel({
  brand,
  tab,
  onTabChange,
  onRunTask,
  onAcceptConflict,
  onGovUpdated,
  onDelete,
}: {
  brand: ScrapeBrand;
  tab: string;
  onTabChange: (t: string) => void;
  onRunTask: (brandId: number | string, src: string) => void;
  onAcceptConflict: (brandId: number | string, idx: number, accepted: boolean) => void;
  onGovUpdated?: () => void;
  onDelete?: (brandId: string) => void;
}) {
  const pct = completeness(brand.tasks);
  const pending = brand.conflicts.filter((c) => c.accepted === null).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      {/* Panel header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0, background: C.surface }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.sidebar, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: "white" }}>{brand.name[0]}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
            {brand.name}
            {brand.chainType && (
              <span style={{ padding: "2px 8px", borderRadius: 999, background: "#E0F2FE", color: "#0369A1", fontSize: 11, fontWeight: 700 }}>{brand.chainType}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
            資料完整度 {pct}%
            {pending > 0 && (
              <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: C.dangerBg, color: C.danger, fontSize: 11, fontWeight: 700 }}>
                ⚠ {pending} 筆待確認
              </span>
            )}
          </div>
        </div>
        <a
          href="/brands"
          onClick={() => {
            try { localStorage.setItem("heroherb_selected_brand", JSON.stringify({ id: brand.id, name: brand.name, channels: [] })); } catch {}
          }}
          style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.primary, fontSize: 13, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
        >
          開啟詳情 →
        </a>
        <button
          onClick={() => { if (confirm(`確定刪除「${brand.name}」？此操作不可復原。`)) onDelete?.(String(brand.id)); }}
          title="刪除此品牌"
          style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
        >
          刪除
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {[
          { id: "tasks", label: "採集任務" },
          { id: "diff", label: `比對結果${pending > 0 ? " (" + pending + ")" : ""}` },
          ...(brand.stores.length > 0 ? [{ id: "stores", label: `分店（${brand.stores.length}）` }] : []),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              flex: 1,
              padding: 12,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? C.primary : C.muted,
              borderBottom: `2px solid ${tab === t.id ? C.primary : "transparent"}`,
              transition: "all 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", paddingBottom: 40 }}>
        {tab === "tasks" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.muted }}>點擊「採集」對單一來源執行資料抓取</span>
              <button
                onClick={() => Object.keys(brand.tasks).filter((k) => k !== "map").forEach((k) => onRunTask(brand.id, k))}
                className="pressable"
                style={{ padding: "6px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              >
                ⚡ 全部重採
              </button>
            </div>
            {Object.entries(brand.tasks).map(([k, task]) => (
              <TaskRow key={k} srcKey={k} task={task} onRun={(src) => onRunTask(brand.id, src)} />
            ))}
            {typeof brand.id === "string" && (
              <GovManualSearch brandId={brand.id} onDone={onGovUpdated || (() => {})} />
            )}
          </div>
        )}

        {tab === "stores" && (
          <div>
            {brand.stores.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 13 }}>尚無門市資料</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {brand.stores.map((s, i) => (
                  <div key={s.id || i} style={{ background: C.surface, borderRadius: 13, border: `1px solid ${C.border}`, padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{s.name || `門市 ${i + 1}`}</div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {s.city && <span style={{ padding: "2px 8px", borderRadius: 999, background: C.surf2, color: C.muted, fontSize: 11 }}>{s.city}</span>}
                        {s.rating != null && <span style={{ padding: "2px 8px", borderRadius: 999, background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 700 }}>{s.rating.toFixed(1)} ★</span>}
                      </div>
                    </div>
                    {s.address && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>📍 {s.address}</div>}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {s.phone && (
                        <a href={`tel:${s.phone}`} style={{ fontSize: 12, color: C.primary, textDecoration: "none", fontWeight: 600 }}>📞 {s.phone}</a>
                      )}
                      {s.reviewCount != null && <span style={{ fontSize: 11, color: C.muted }}>{s.reviewCount.toLocaleString()} 則評論</span>}
                      {s.gmapsUrl && (
                        <a href={s.gmapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#D97706", fontWeight: 600, textDecoration: "none" }}>↗ Google 地圖</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "diff" && (
          <div>
            {brand.conflicts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>資料無差異</div>
                <div style={{ fontSize: 13, color: C.muted }}>所有採集結果與現有資料一致</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>採集到的數值與現有記錄有差異，請確認是否更新</div>
                {brand.conflicts.map((c, i) => (
                  <ConflictRow key={i} conflict={c} onAccept={() => onAcceptConflict(brand.id, i, true)} onReject={() => onAcceptConflict(brand.id, i, false)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 摘要列 ───────────────────────────────────────────
type StatusFilter = "done" | "running" | "error" | "pending" | null;

function SummaryBar({
  brands,
  totalCount,
  lastRunAll,
  activeFilter,
  onFilter,
}: {
  brands: ScrapeBrand[];
  totalCount?: number | null;
  lastRunAll: string | null;
  activeFilter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
}) {
  // 「品牌」顯示完整總數(跨全部名單)；採集完整/中/失敗等仍是已載入清單的即時狀態
  const all = totalCount ?? brands.length;
  const done = brands.filter((b) => completeness(b.tasks) === 100).length;
  const allTasks = brands.flatMap((b) => Object.values(b.tasks));
  const running = allTasks.filter((t) => t.status === "running").length;
  const errors = brands.filter((b) => Object.values(b.tasks).some((t) => t.status === "error")).length;
  const pending = brands.reduce((s, b) => s + b.conflicts.filter((c) => c.accepted === null).length, 0);

  const stats: { label: string; value: number; color: string; cls?: string; filter: StatusFilter }[] = [
    { label: "品牌", value: all, color: C.text, filter: null },
    { label: "採集完整", value: done, color: C.success, filter: "done" },
    { label: "採集中", value: running, color: C.primary, cls: "pulse", filter: "running" },
    { label: "失敗", value: errors, color: C.danger, filter: "error" },
    { label: "待確認差異", value: pending, color: "#D97706", filter: "pending" },
  ];

  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
      {stats.map((s, i) => {
        const isActive = activeFilter === s.filter;
        return (
          <button
            key={i}
            onClick={() => onFilter(isActive ? null : s.filter)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 8,
              border: `1px solid ${isActive ? s.color : "transparent"}`,
              background: isActive ? `${s.color}15` : "transparent",
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            <span className={s.cls || ""} style={{ fontSize: 18, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </span>
            <span style={{ fontSize: 12, color: isActive ? s.color : C.muted, fontWeight: isActive ? 700 : 400 }}>{s.label}</span>
          </button>
        );
      })}
      {activeFilter && (
        <button
          onClick={() => onFilter(null)}
          style={{ fontSize: 12, color: C.muted, border: "none", background: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, textDecoration: "underline" }}
        >
          清除篩選
        </button>
      )}
      <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#A3C9A3", display: "inline-block" }} />
        上次全採：{lastRunAll || "尚未執行"}
      </div>
    </div>
  );
}

// ── 採集任務（Google Places 真實串接）─────────────────
interface ScrapeJob {
  id: string;
  keywords: string[];
  cities: string[];
  status: string;
  result_count: number | null;
  error: string | null;
  created_at: string;
}

const JOB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  done: { label: "完成", color: C.success, bg: C.successBg },
  running: { label: "採集中", color: C.primary, bg: C.p50 },
  pending: { label: "待執行", color: C.muted, bg: C.surf2 },
  error: { label: "失敗", color: C.danger, bg: C.dangerBg },
};

const CITY_DISTRICTS: Record<string, string[]> = {
  "台北市": ["中正區", "大同區", "中山區", "松山區", "大安區", "萬華區", "信義區", "士林區", "北投區", "內湖區", "南港區", "文山區"],
  "新北市": ["板橋區", "三重區", "中和區", "永和區", "新莊區", "新店區", "土城區", "蘆洲區", "汐止區", "樹林區", "林口區", "淡水區", "三峽區", "鶯歌區", "五股區", "泰山區", "瑞芳區"],
  "桃園市": ["桃園區", "中壢區", "平鎮區", "八德區", "楊梅區", "蘆竹區", "龜山區", "龍潭區", "大溪區", "大園區"],
  "台中市": ["中區", "東區", "南區", "西區", "北區", "北屯區", "西屯區", "南屯區", "太平區", "大里區", "霧峰區", "烏日區", "豐原區", "后里區", "潭子區", "大雅區", "神岡區", "沙鹿區", "龍井區", "梧棲區", "清水區"],
  "台南市": ["中西區", "東區", "南區", "北區", "安平區", "安南區", "永康區", "歸仁區", "新化區", "左鎮區", "仁德區", "關廟區", "新營區", "鹽水區"],
  "高雄市": ["新興區", "前金區", "苓雅區", "鹽埕區", "鼓山區", "旗津區", "前鎮區", "三民區", "楠梓區", "小港區", "左營區", "仁武區", "鳳山區", "大寮區", "林園區", "岡山區", "路竹區", "橋頭區"],
  "基隆市": [],
  "新竹市": ["東區", "北區", "香山區"],
  "新竹縣": ["竹北市", "竹東鎮", "新豐鄉", "湖口鄉"],
  "苗栗縣": ["苗栗市", "頭份市", "竹南鎮"],
  "彰化縣": ["彰化市", "員林市", "鹿港鎮", "和美鎮"],
  "南投縣": ["南投市", "埔里鎮", "草屯鎮"],
  "雲林縣": ["斗六市", "虎尾鎮", "斗南鎮"],
  "嘉義市": [],
  "嘉義縣": ["太保市", "朴子市", "民雄鄉"],
  "屏東縣": ["屏東市", "潮州鎮", "東港鎮"],
  "宜蘭縣": ["宜蘭市", "羅東鎮", "頭城鎮"],
  "花蓮縣": ["花蓮市", "吉安鄉"],
  "台東縣": [],
};
const CITY_OPTIONS = Object.keys(CITY_DISTRICTS);
const KEYWORD_SUGGEST = ["養生館", "越式洗髮", "宮廟", "長照中心", "禮儀公司", "SPA"];

// ── 採集黑名單管理 ────────────────────────────────────
function BlacklistPanel() {
  const [items, setItems] = useState<{ id: string; keyword: string; reason: string | null }[]>([]);
  const [newKw, setNewKw] = useState("");
  const [open, setOpen] = useState(false);

  const load = () => {
    fetch("/api/collection-blacklist").then((r) => r.json()).then((d) => setItems(d.data || [])).catch(() => {});
  };
  useEffect(load, []);

  const add = async () => {
    const kw = newKw.trim();
    if (!kw) return;
    const res = await fetch("/api/collection-blacklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyword: kw }) }).then((r) => r.json());
    if (res.success) { setNewKw(""); load(); }
  };
  const remove = async (id: string) => {
    await fetch("/api/collection-blacklist", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  };

  return (
    <div style={{ margin: "16px 0 10px" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 0.6 }}>
        🚫 採集黑名單（{items.length}）{open ? "▼" : "▶"}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 12, background: C.surf2, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>名稱含以下關鍵字的店家，採集時會自動跳過。</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="輸入關鍵字…"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface, color: C.text }} />
            <button onClick={add} disabled={!newKw.trim()}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: newKw.trim() ? C.primary : C.surf2, color: newKw.trim() ? "white" : C.muted, fontSize: 12, fontWeight: 700, cursor: newKw.trim() ? "pointer" : "default" }}>
              新增
            </button>
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: 8 }}>尚無黑名單關鍵字</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {items.map((it) => (
                <span key={it.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, background: "#F3E4DC", color: "#A66A4F", fontSize: 12, fontWeight: 600 }}>
                  {it.keyword}
                  <button onClick={() => remove(it.id)} style={{ border: "none", background: "none", color: "#A66A4F", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const KW_STORE = "collect_keywords";
function PlacesJobPanel({ onClose, onDone, country = "TW", onCountryChange }: { onClose: () => void; onDone?: () => void; country?: CountryCode; onCountryChange?: (c: CountryCode) => void }) {
  const [selCountry, setSelCountry] = useState<CountryCode>(country);
  const isTW = selCountry === "TW";
  const cityOptions =
    selCountry === "JP" ? JP_CITIES :
    selCountry === "UK" ? UK_CITIES :
    selCountry === "CA" ? CA_CITIES :
    CITY_OPTIONS;
  // 英語系國家（UK / CA）共用同一組英文關鍵字
  const defaultKws = selCountry === "JP" ? JP_KEYWORDS : isTW ? KEYWORD_SUGGEST : EN_KEYWORDS;
  const defaultCity = cityOptions[0] || "台中市";

  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [maxPages, setMaxPages] = useState(3);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [steps, setSteps] = useState<{ type: string; text: string; ok?: boolean }[]>([]);
  const [kwList, setKwList] = useState<string[]>(defaultKws);
  const logRef = useRef<HTMLDivElement>(null);
  // 全批採集
  const stopRef = useRef(false);
  const [batch, setBatch] = useState<{ active: boolean; cityIdx: number; cities: number; found: number; newBrands: number; current: string } | null>(null);

  // 切換國家時：重設城市為該國預設、重載關鍵字清單（localStorage key 已含國家）
  useEffect(() => {
    setCity(defaultCity);
    try {
      const storeKey = `${KW_STORE}_${selCountry}`;
      const saved = JSON.parse(localStorage.getItem(storeKey) || "[]") as string[];
      setKwList([...new Set([...saved, ...defaultKws])]);
    } catch { /* ignore */ }
    setKeyword("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCountry]);
  // 記住輸入過的關鍵字（自訂的存進 localStorage，最多 40 個）
  const rememberKeyword = (k: string) => {
    const t = k.trim();
    if (!t) return;
    const storeKey = `${KW_STORE}_${selCountry}`;
    setKwList((prev) => {
      const merged = [t, ...prev.filter((x) => x !== t)];
      try {
        const custom = merged.filter((x) => !defaultKws.includes(x)).slice(0, 40);
        localStorage.setItem(storeKey, JSON.stringify(custom));
      } catch { /* ignore */ }
      return [...new Set(merged)];
    });
  };
  const removeKeyword = (k: string) => {
    const storeKey = `${KW_STORE}_${selCountry}`;
    setKwList((prev) => {
      const next = prev.filter((x) => x !== k);
      try {
        localStorage.setItem(storeKey, JSON.stringify(next.filter((x) => !defaultKws.includes(x)).slice(0, 40)));
      } catch { /* ignore */ }
      return next;
    });
  };

  const apiBase = isTW ? "/api/scrape/places" : "/api/scrape/overseas";

  const loadJobs = () => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setJobs(res.data);
      })
      .catch(() => {});
  };
  useEffect(loadJobs, [apiBase]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps]);

  const run = async () => {
    if (!keyword.trim() || running) return;
    rememberKeyword(keyword);
    setRunning(true);
    setResult(null);
    setResultOk(false);
    setSteps([]);
    try {
      const body = isTW
        ? { keyword: keyword.trim(), city, maxPages }
        : { keyword: keyword.trim(), city, country: selCountry, maxPages };
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) {
        const text = await response.text();
        let msg = "採集失敗";
        try { msg = JSON.parse(text).error || msg; } catch {}
        setResultOk(false);
        setResult(msg);
        setRunning(false);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const evt = JSON.parse(trimmed);
            if (evt.type === "done") {
              const d = evt.data;
              setResultOk(true);
              setResult(
                `找到 ${d.found} 間店家 → 新增 ${d.new_brands} 個品牌、${d.new_stores} 間門市` +
                (d.linked_existing > 0 ? `、歸戶 ${d.linked_existing} 間到既有品牌` : "") +
                (d.skipped_exists > 0 ? `、跳過 ${d.skipped_exists} 筆（已存在）` : "") +
                (d.brand_errors > 0 ? `、失敗 ${d.brand_errors} 筆` : "") +
                ` · 費用約 $${d.est_cost_usd} USD`
              );
              onDone?.();
            } else if (evt.type === "error") {
              setResultOk(false);
              setResult(`採集失敗：${evt.text}`);
            } else if (evt.type === "step" || evt.type === "store") {
              setSteps((prev) => [...prev, { type: evt.type, text: evt.text, ok: evt.ok }]);
            }
          } catch {}
        }
      }
    } catch {
      setResultOk(false);
      setResult("採集失敗：網路錯誤");
    }
    setRunning(false);
    loadJobs();
  };

  // 採集單一城市並回傳摘要（供全批分批用）
  const scrapeCity = async (kw: string, c: string, pages: number): Promise<{ found: number; newBrands: number } | null> => {
    try {
      const body = isTW
        ? { keyword: kw, city: c, maxPages: pages }
        : { keyword: kw, city: c, country: selCountry, maxPages: pages };
      const response = await fetch(apiBase, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) return null;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let summary: { found: number; newBrands: number } | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const evt = JSON.parse(t);
            if (evt.type === "done") summary = { found: evt.data.found || 0, newBrands: evt.data.new_brands || 0 };
            else if (evt.type === "step" || evt.type === "store") setSteps((prev) => [...prev.slice(-180), { type: evt.type, text: evt.text, ok: evt.ok }]);
          } catch {}
        }
      }
      return summary;
    } catch { return null; }
  };

  // 全批採集：逐城市跑，即時累計，可隨時停止
  const runAllTaiwan = async () => {
    if (!keyword.trim() || running) return;
    rememberKeyword(keyword);
    stopRef.current = false;
    setRunning(true); setResult(null); setResultOk(false); setSteps([]);
    const cities = cityOptions;
    let totalFound = 0, totalNew = 0;
    setBatch({ active: true, cityIdx: 0, cities: cities.length, found: 0, newBrands: 0, current: cities[0] });
    for (let i = 0; i < cities.length; i++) {
      if (stopRef.current) break;
      const c = cities[i];
      setBatch((b) => (b ? { ...b, cityIdx: i + 1, current: c } : b));
      setSteps((prev) => [...prev.slice(-180), { type: "step", text: `──「${keyword.trim()}」× ${c}（${i + 1}/${cities.length}）──` }]);
      const s = await scrapeCity(keyword.trim(), c, maxPages);
      if (s) {
        totalFound += s.found; totalNew += s.newBrands;
        setBatch((b) => (b ? { ...b, found: totalFound, newBrands: totalNew } : b));
      }
      onDone?.();
    }
    const stopped = stopRef.current;
    setRunning(false);
    setResultOk(true);
    const ctryLabel = COUNTRIES.find((c) => c.code === selCountry)?.label || selCountry;
    setResult(`${stopped ? "已停止" : `全${ctryLabel}完成`}：累計新增 ${totalNew} 個品牌（找到 ${totalFound} 間）`);
    setBatch((b) => (b ? { ...b, active: false } : b));
    loadJobs();
  };

  // 海外全掃描：所有預設關鍵字 × 所有城市（覆蓋最大化），可隨時停止
  const runFullScan = async () => {
    if (running) return;
    stopRef.current = false;
    setRunning(true); setResult(null); setResultOk(false); setSteps([]);
    const cities = cityOptions;
    const kws = defaultKws;
    const totalCombos = kws.length * cities.length;
    let done = 0, totalFound = 0, totalNew = 0;
    setBatch({ active: true, cityIdx: 0, cities: totalCombos, found: 0, newBrands: 0, current: `${kws[0]} × ${cities[0]}` });
    outer: for (let ki = 0; ki < kws.length; ki++) {
      for (let ci = 0; ci < cities.length; ci++) {
        if (stopRef.current) break outer;
        const kw = kws[ki], c = cities[ci];
        done++;
        setBatch((b) => (b ? { ...b, cityIdx: done, current: `${kw} × ${c}` } : b));
        setSteps((prev) => [...prev.slice(-180), { type: "step", text: `──「${kw}」× ${c}（關鍵字 ${ki + 1}/${kws.length} · 城市 ${ci + 1}/${cities.length}）──` }]);
        const s = await scrapeCity(kw, c, maxPages);
        if (s) {
          totalFound += s.found; totalNew += s.newBrands;
          setBatch((b) => (b ? { ...b, found: totalFound, newBrands: totalNew } : b));
        }
        onDone?.();
      }
    }
    const stopped = stopRef.current;
    setRunning(false);
    setResultOk(true);
    const ctryLabel = COUNTRIES.find((c) => c.code === selCountry)?.label || selCountry;
    setResult(`${stopped ? "已停止" : `全${ctryLabel}掃描完成`}：累計新增 ${totalNew} 個品牌（找到 ${totalFound} 間，跑 ${done}/${totalCombos} 組）`);
    setBatch((b) => (b ? { ...b, active: false } : b));
    loadJobs();
  };
  const stopBatch = () => { stopRef.current = true; };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)", animation: "fadeIn 180ms" }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 510,
          width: "94vw",
          maxWidth: 540,
          maxHeight: "86vh",
          background: C.surface,
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(21,20,26,.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              {COUNTRIES.find((c) => c.code === selCountry)?.flag} 新增採集任務
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Google Places 關鍵字 × 城市，採集（{COUNTRIES.find((c) => c.code === selCountry)?.label}）並寫入名單</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {/* 國家選擇 */}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>採集國家</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {COUNTRIES.map((c) => {
              const active = selCountry === c.code;
              return (
                <button
                  key={c.code}
                  onClick={() => { if (c.code !== selCountry) { setSelCountry(c.code); onCountryChange?.(c.code); } }}
                  disabled={running}
                  style={{ padding: "7px 16px", borderRadius: 999, fontSize: 14, fontWeight: active ? 700 : 400, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.p50 : "transparent", color: active ? C.primary : C.text, cursor: running ? "default" : "pointer", opacity: running && !active ? 0.5 : 1 }}
                >
                  {c.flag} {c.label}
                </button>
              );
            })}
          </div>

          {/* 關鍵字 */}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>產業關鍵字</div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={selCountry === "JP" ? "例：フットバス、足湯用品、台湾茶 輸入…" : isTW ? "例：養生館、宮廟、長照中心…" : "e.g. foot bath, tea importer, wellness…"}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 15, color: C.text, outline: "none", marginBottom: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {kwList.map((k) => {
              const isDefault = KEYWORD_SUGGEST.includes(k);
              const active = keyword === k;
              return (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.p50 : "transparent", overflow: "hidden" }}>
                  <button
                    onClick={() => setKeyword(k)}
                    style={{ padding: "4px 6px 4px 12px", fontSize: 12, border: "none", background: "transparent", color: active ? C.primary : C.muted, cursor: "pointer" }}
                  >
                    {k}
                  </button>
                  {!isDefault && (
                    <button
                      onClick={() => removeKeyword(k)}
                      title="移除"
                      style={{ padding: "4px 8px 4px 2px", fontSize: 12, border: "none", background: "transparent", color: C.muted, cursor: "pointer", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {/* 城市 */}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{isTW ? "縣市" : "城市"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {cityOptions.map((c) => {
              const isSelected = isTW ? (city === c || city.startsWith(c.replace(/[市縣]$/, ""))) : city === c;
              return (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: isSelected ? 700 : 400, border: `1px solid ${isSelected ? C.primary : C.border}`, background: isSelected ? C.p50 : "transparent", color: isSelected ? C.primary : C.text, cursor: "pointer" }}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {/* 地區（行政區） */}
          {(() => {
            const selectedCity = CITY_OPTIONS.find((c) => city === c || city.startsWith(c.replace(/[市縣]$/, "")));
            const districts = selectedCity ? CITY_DISTRICTS[selectedCity] : [];
            if (!districts || districts.length === 0) return null;
            const currentDistrict = city !== selectedCity ? city : "";
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}>
                <button
                  onClick={() => setCity(selectedCity!)}
                  style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: !currentDistrict ? 700 : 400, border: `1px solid ${!currentDistrict ? C.primary : C.border}`, background: !currentDistrict ? C.p50 : "transparent", color: !currentDistrict ? C.primary : C.muted, cursor: "pointer" }}
                >
                  全{selectedCity}
                </button>
                {districts.map((d) => {
                  const val = `${selectedCity!.replace(/[市縣]$/, "")}${d}`;
                  const active = city === val;
                  return (
                    <button
                      key={d}
                      onClick={() => setCity(val)}
                      style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: active ? 700 : 400, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.p50 : "transparent", color: active ? C.primary : C.muted, cursor: "pointer" }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          {!CITY_DISTRICTS[city]?.length && !CITY_OPTIONS.some((c) => city.startsWith(c.replace(/[市縣]$/, "")) && c !== city) && <div style={{ marginBottom: 16 }} />}

          {/* 頁數 / 費用預估 */}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>採集量（每頁 20 筆，Text Search 約 $0.032/次）</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[1, 3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setMaxPages(n)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 13, fontWeight: maxPages === n ? 700 : 400, border: `1px solid ${maxPages === n ? C.primary : C.border}`, background: maxPages === n ? C.p50 : "transparent", color: maxPages === n ? C.primary : C.muted, cursor: "pointer", minWidth: 70 }}
              >
                {n * 20} 筆<br /><span style={{ fontSize: 10, opacity: 0.7 }}>≈${(n * 0.032).toFixed(2)}</span>
              </button>
            ))}
          </div>

          <button
            onClick={run}
            disabled={running || !keyword.trim()}
            className="pressable"
            style={{
              width: "100%",
              padding: 13,
              borderRadius: 12,
              border: "none",
              background: running || !keyword.trim() ? C.surf2 : C.primary,
              color: running || !keyword.trim() ? C.muted : "white",
              fontWeight: 700,
              fontSize: 15,
              cursor: running || !keyword.trim() ? "default" : "pointer",
            }}
          >
            {running && !batch ? (
              <span>
                <span className="spin" style={{ marginRight: 6 }}>↻</span>採集中，約需 5~15 秒…
              </span>
            ) : (
              `⚡ 開始採集「${keyword || "…"} × ${city}」`
            )}
          </button>

          {/* 全批採集（各國通用） */}
          <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surf2 }}>
            {(() => { const ctry = COUNTRIES.find((c) => c.code === selCountry); return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: batch?.active ? 10 : 0, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {ctry?.flag} 全{ctry?.label}分批採集
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>「{keyword || "…"}」逐城市（{cityOptions.length} 個）依序採集，可隨時停止</div>
              </div>
              {batch?.active ? (
                <button onClick={stopBatch} disabled={stopRef.current} className="pressable"
                  style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: stopRef.current ? C.surf2 : C.danger, color: stopRef.current ? C.muted : "white", fontWeight: 700, fontSize: 14, cursor: stopRef.current ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  {stopRef.current ? "停止中…" : "■ 停止"}
                </button>
              ) : (
                <button onClick={runAllTaiwan} disabled={running || !keyword.trim()} className="pressable"
                  style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: running || !keyword.trim() ? C.surf2 : C.accentDk, color: running || !keyword.trim() ? C.muted : "white", fontWeight: 700, fontSize: 14, cursor: running || !keyword.trim() ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  ▶ 全{ctry?.label}跑
                </button>
              )}
            </div>
            ); })()}
            {/* 海外最大覆蓋：全關鍵字 × 全城市 */}
            {!isTW && !batch?.active && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}`, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🌐 全關鍵字 × 全城市掃描</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{defaultKws.length} 組關鍵字 × {cityOptions.length} 城市＝{defaultKws.length * cityOptions.length} 組，最大覆蓋（可隨時停止）</div>
                </div>
                <button onClick={runFullScan} disabled={running} className="pressable"
                  style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: running ? C.surf2 : C.primary, color: running ? C.muted : "white", fontWeight: 700, fontSize: 14, cursor: running ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  ▶ 全掃描
                </button>
              </div>
            )}
            {batch?.active && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text, marginBottom: 5 }}>
                  <span>採集中：{batch.current}（{batch.cityIdx}/{batch.cities}）</span>
                  <span style={{ fontWeight: 700, color: C.primary }}>已新增 {batch.newBrands}・找到 {batch.found}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(batch.cityIdx / batch.cities) * 100}%`, background: C.primary, borderRadius: 4, transition: "width 400ms" }} />
                </div>
              </div>
            )}
          </div>

          {steps.length > 0 && (
            <div
              ref={logRef}
              style={{
                marginTop: 12,
                maxHeight: 220,
                overflowY: "auto",
                background: "#0e1a11",
                borderRadius: 10,
                padding: "10px 14px",
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.75,
              }}
            >
              {steps.map((s, i) => (
                <div
                  key={i}
                  style={{
                    color:
                      s.type === "store"
                        ? s.ok ? "#5be585" : "#666"
                        : "#9dbeaa",
                  }}
                >
                  {s.text}
                </div>
              ))}
              {running && <div style={{ color: "#5be585", opacity: 0.7 }}>▌</div>}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: resultOk ? C.successBg : C.dangerBg, fontSize: 13, color: resultOk ? C.success : C.danger, lineHeight: 1.6 }}>
              {resultOk ? "✓ " : "✕ "}
              {result}
              {resultOk && (
                <div style={{ marginTop: 4 }}>
                  <Link href="/leads" style={{ color: C.success, fontWeight: 700 }}>到名單總覽查看 →</Link>
                </div>
              )}
            </div>
          )}

          {/* 歷史任務 */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted, margin: "20px 0 10px" }}>最近採集任務</div>
          {jobs.length === 0 && <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "14px 0" }}>尚無任務紀錄</div>}
          {/* 採集黑名單 */}
          <BlacklistPanel />

          {jobs.map((j) => {
            const st = JOB_STATUS[j.status] || JOB_STATUS.pending;
            const d = new Date(j.created_at);
            return (
              <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 7 }}>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{st.label}</span>
                <span style={{ fontSize: 13, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(j.keywords || []).join("、")} × {(j.cities || []).join("、")}
                </span>
                {j.result_count != null && <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{j.result_count} 筆</span>}
                <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{d.getMonth() + 1}/{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Places 資料更新面板 ──────────────────────────────
function PlacesRefreshPanel({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ type: string; text: string; ok?: boolean }[]>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    setSteps([]);
    try {
      const res = await fetch("/api/enrich/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok || !res.body) { setResult({ ok: false, text: "更新失敗" }); setRunning(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim(); if (!t) continue;
          try {
            const evt = JSON.parse(t);
            if (evt.type === "done") {
              const d = evt.data;
              setResult({ ok: true, text: `完成：${d.updated}/${d.total} 間門市更新（電話/地圖/評論），${d.failed} 筆失敗` });
              onDone?.();
            } else if (evt.type === "error") {
              setResult({ ok: false, text: evt.text });
            } else {
              setSteps((prev) => [...prev, { type: evt.type, text: evt.text, ok: evt.ok }]);
            }
          } catch {}
        }
      }
    } catch { setResult({ ok: false, text: "網路錯誤" }); }
    setRunning(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 510, width: "94vw", maxWidth: 500, maxHeight: "82vh", background: C.surface, borderRadius: 20, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>📍 更新 Places 資料</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>以現有 place_id 重新抓取電話 / 地圖連結 / 最新評論</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          <button onClick={run} disabled={running} className="pressable"
            style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: running ? C.surf2 : "#B45309", color: running ? C.muted : "white", fontWeight: 700, fontSize: 15, cursor: running ? "default" : "pointer" }}>
            {running ? <span><span className="spin" style={{ marginRight: 6 }}>↻</span>更新中，請稍候…</span> : "📍 開始更新所有門市 Places 資料"}
          </button>
          {steps.length > 0 && (
            <div ref={logRef} style={{ marginTop: 12, maxHeight: 300, overflowY: "auto", background: "#0e1a11", borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.75 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ color: s.type === "store" ? (s.ok ? "#5be585" : "#666") : "#9dbeaa" }}>{s.text}</div>
              ))}
              {running && <div style={{ color: "#5be585", opacity: 0.7 }}>▌</div>}
            </div>
          )}
          {result && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: result.ok ? C.successBg : C.dangerBg, fontSize: 13, color: result.ok ? C.success : C.danger, lineHeight: 1.6 }}>
              {result.ok ? "✓ " : "✕ "}{result.text}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── 官網爬蟲面板 ─────────────────────────────────────
type ScrapeMode = "limit" | "industry" | "brand" | "filtered";

function WebsiteScraperPanel({ onClose, onDone, industries, filterCity, filterIndustry, filterGroupName, visibleBrandIds }: { onClose: () => void; onDone?: () => void; industries: string[]; filterCity?: string | null; filterIndustry?: string | null; filterGroupName?: string | null; visibleBrandIds?: string[] }) {
  const [mode, setMode] = useState<ScrapeMode>("limit");
  const [limit, setLimit] = useState(0); // 0 = 全部
  const [industry, setIndustry] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [allBrands, setAllBrands] = useState<{ id: string; name: string; industry: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ type: string; text: string; ok?: boolean }[]>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps]);

  // 指定品牌模式：載入品牌清單
  useEffect(() => {
    if (mode !== "brand") return;
    fetch("/api/brands?view=lite")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAllBrands((j.data ?? []).map((b: Record<string, unknown>) => ({ id: b.id, name: b.name, industry: b.industry ?? "" })));
      })
      .catch(() => {});
  }, [mode]);

  const toggleBrand = (id: string) =>
    setSelectedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const filteredBrands = brandSearch
    ? allBrands.filter((b) => b.name.includes(brandSearch) || b.industry.includes(brandSearch))
    : allBrands;

  const buildBody = () => {
    if (mode === "brand") return { brand_ids: [...selectedIds] };
    if (mode === "filtered") return { brand_ids: visibleBrandIds ?? [] };
    if (mode === "industry") return { all: true, industry }; // 不加 limit，全類別採集
    return limit > 0 ? { all: true, limit } : { all: true }; // limit=0 → 不限制
  };

  const canRun = !running && (
    mode === "limit" ||
    (mode === "industry" && industry) ||
    (mode === "brand" && selectedIds.size > 0) ||
    (mode === "filtered" && (visibleBrandIds?.length ?? 0) > 0)
  );

  const runLabel = () => {
    if (running) return "爬取中…";
    if (mode === "brand") return `🌐 爬取已選 ${selectedIds.size} 個品牌`;
    if (mode === "filtered") return `🌐 爬取篩選中 ${visibleBrandIds?.length ?? 0} 個品牌`;
    if (mode === "industry") return industry ? `🌐 爬取「${industry}」全部品牌` : "請先選擇類別";
    return limit > 0 ? `🌐 開始爬取（${limit} 個品牌）` : "🌐 爬取全部品牌";
  };

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    setResult(null);
    setSteps([]);
    try {
      const res = await fetch("/api/scrape/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok || !res.body) { setResult({ ok: false, text: "爬取失敗" }); setRunning(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim(); if (!t) continue;
          try {
            const evt = JSON.parse(t);
            if (evt.type === "done") {
              const d = evt.data;
              setResult({ ok: true, text: `完成：${d.enriched} 個品牌找到資料（共 ${d.total_channels} 個管道），${d.skipped} 個略過` });
              onDone?.();
            } else if (evt.type === "error") {
              setResult({ ok: false, text: evt.text });
            } else {
              setSteps((prev) => [...prev, { type: evt.type, text: evt.text, ok: evt.ok }]);
            }
          } catch {}
        }
      }
    } catch { setResult({ ok: false, text: "網路錯誤" }); }
    setRunning(false);
  };

  const INDUSTRIES_LIST = industries.length > 0 ? industries : INDUSTRIES;

  const ModeBtn = ({ m, label }: { m: ScrapeMode; label: string }) => (
    <button
      onClick={() => { setMode(m); setResult(null); setSteps([]); }}
      style={{ flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 13, fontWeight: mode === m ? 700 : 400, border: `1px solid ${mode === m ? C.primary : C.border}`, background: mode === m ? C.p50 : "transparent", color: mode === m ? C.primary : C.muted, cursor: "pointer" }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 510, width: "96vw", maxWidth: mode === "brand" ? 800 : 520, maxHeight: "88vh", background: C.surface, borderRadius: 20, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden", transition: "max-width 200ms" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>🌐 官網爬蟲</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>爬取品牌官網，擷取 LINE / FB / IG / 電話 / Email</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {/* 模式切換 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
            <ModeBtn m="limit" label="依數量" />
            <ModeBtn m="industry" label="依類別" />
            <ModeBtn m="brand" label="指定品牌" />
            {(filterCity || filterIndustry || filterGroupName) && (
              <ModeBtn m="filtered" label={`依篩選${filterGroupName ? `·◳${filterGroupName}` : ""}${filterIndustry ? `·${filterIndustry}` : ""}${filterCity ? `·${filterCity}` : ""}（${visibleBrandIds?.length ?? 0}）`} />
            )}
          </div>

          {/* 依數量 */}
          {mode === "limit" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              {[50, 100, 200, 300].map((n) => (
                <button key={n} onClick={() => setLimit(n)}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: limit === n ? 700 : 400, border: `1px solid ${limit === n ? C.primary : C.border}`, background: limit === n ? C.p50 : "transparent", color: limit === n ? C.primary : C.muted, cursor: "pointer", minWidth: 60 }}>
                  {n} 個
                </button>
              ))}
              <button onClick={() => setLimit(0)}
                style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: limit === 0 ? 700 : 400, border: `1px solid ${limit === 0 ? C.primary : C.border}`, background: limit === 0 ? C.p50 : "transparent", color: limit === 0 ? C.primary : C.muted, cursor: "pointer", minWidth: 60 }}>
                全部
              </button>
            </div>
          )}

          {/* 依類別 */}
          {mode === "industry" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {INDUSTRIES_LIST.map((ind) => (
                <button key={ind} onClick={() => setIndustry(industry === ind ? "" : ind)}
                  style={{ padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: industry === ind ? 700 : 400, border: `1px solid ${industry === ind ? C.primary : C.border}`, background: industry === ind ? C.p50 : "transparent", color: industry === ind ? C.primary : C.text, cursor: "pointer" }}>
                  {ind}
                </button>
              ))}
            </div>
          )}

          {/* 依篩選 */}
          {mode === "filtered" && (
            <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 10, background: "#EDF4F0", border: `1px solid #c2d9ce`, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>目前篩選條件</div>
              {filterGroupName && <div>產業群組：◳ {filterGroupName}</div>}
              {filterIndustry && <div>類別：{filterIndustry}</div>}
              {filterCity && <div>縣市：{filterCity}</div>}
              <div style={{ marginTop: 4, color: C.muted }}>共 {visibleBrandIds?.length ?? 0} 個品牌符合篩選</div>
            </div>
          )}

          {/* 指定品牌 */}
          {mode === "brand" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <input
                  placeholder="搜尋品牌名稱或類別…"
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  style={{ flex: 1, padding: "9px 13px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box" }}
                />
                {selectedIds.size > 0 && (
                  <span style={{ fontSize: 12, color: C.primary, fontWeight: 600, whiteSpace: "nowrap" }}>
                    已選 {selectedIds.size}
                    <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 4, fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>清除</button>
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, padding: 8 }}>
                {filteredBrands.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                    {allBrands.length === 0 ? "載入中…" : "找不到符合的品牌"}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {filteredBrands.map((b) => (
                      <div key={b.id} onClick={() => toggleBrand(b.id)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", cursor: "pointer", background: selectedIds.has(b.id) ? C.p50 : C.surf2, borderRadius: 8, border: `1px solid ${selectedIds.has(b.id) ? C.primary : "transparent"}`, transition: "all 120ms", minWidth: 0 }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${selectedIds.has(b.id) ? C.primary : C.border}`, background: selectedIds.has(b.id) ? C.primary : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {selectedIds.has(b.id) && <span style={{ color: "white", fontSize: 8, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: selectedIds.has(b.id) ? 600 : 400, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                          {b.industry && <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.industry}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <button onClick={run} disabled={!canRun} className="pressable"
            style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: !canRun ? C.surf2 : C.primary, color: !canRun ? C.muted : "white", fontWeight: 700, fontSize: 15, cursor: !canRun ? "default" : "pointer" }}>
            {running ? <span><span className="spin" style={{ marginRight: 6 }}>↻</span>爬取中…</span> : runLabel()}
          </button>

          {steps.length > 0 && (
            <div ref={logRef} style={{ marginTop: 12, maxHeight: 240, overflowY: "auto", background: "#0e1a11", borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.75 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ color: s.type === "store" ? (s.ok ? "#5be585" : "#666") : "#9dbeaa" }}>{s.text}</div>
              ))}
              {running && <div style={{ color: "#5be585", opacity: 0.7 }}>▌</div>}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: result.ok ? C.successBg : C.dangerBg, fontSize: 13, color: result.ok ? C.success : C.danger, lineHeight: 1.6 }}>
              {result.ok ? "✓ " : "✕ "}{result.text}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── 工商登記批次比對面板 ──────────────────────────────
interface RunRecord { id: string; kind: string; label: string | null; scope: string | null; total: number; succeeded: number; pending: number; failed: number; status: string; created_at: string }

function GovBatchPanel({ industry, brandIds, onClose, onDone, concurrency, title, thenChannels, channelsMode }: { industry?: string | null; brandIds?: string[]; onClose: () => void; onDone?: () => void; concurrency?: number; title?: string; thenChannels?: boolean; channelsMode?: boolean }) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ type: string; text: string; ok?: boolean }[]>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // 模式勾選（統一面板：預設依開啟來源，可自行調整）
  const [doGov, setDoGov] = useState(!channelsMode);
  const [doChannels, setDoChannels] = useState(!!thenChannels || !!channelsMode);
  // 是否使用 Google 付費 API（Places 找店家 + CSE 搜尋）。預設關閉以省費用，需要時再勾。
  const [usePlaces, setUsePlaces] = useState(false);
  // 跳過 7 天內已採集過(但仍不完整)的品牌，避免對查無結果的名單反覆空轉。預設開啟。
  const [skipRecent, setSkipRecent] = useState(true);
  // 進度：phase 名稱 + 全域完成數/總數（跨批次累計）
  const [prog, setProg] = useState<{ phase: string; done: number; total: number } | null>(null);
  const startRef = useRef<number>(0);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const loadHistory = () => {
    fetch("/api/collection-runs").then((r) => r.json()).then((d) => { if (d.success) setHistory(d.data || []); }).catch(() => {});
  };
  useEffect(loadHistory, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps]);

  // 串流 NDJSON，回傳 done 的 data；log 只保留最近 200 行避免爆量
  const streamNdjson = async (url: string, body: Record<string, unknown>, onProgress?: (done: number) => void): Promise<Record<string, number> | null> => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", done: Record<string, number> | null = null;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      buf += decoder.decode(r.value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim(); if (!t) continue;
        try {
          const evt = JSON.parse(t);
          if (evt.type === "done") done = evt.data;
          else if (evt.type === "progress") onProgress?.(Number(evt.done) || 0);
          else if (evt.type === "error") setSteps((prev) => [...prev, { type: "error", text: `✕ ${evt.text}` }].slice(-200));
          else if (evt.text) setSteps((prev) => [...prev, { type: evt.type, text: evt.text, ok: evt.ok }].slice(-200));
        } catch {}
      }
    }
    return done;
  };

  const run = async () => {
    if (running || (!doGov && !doChannels)) return;
    setRunning(true);
    setResult(null);
    setSteps([]);
    setProg(null);
    startRef.current = Date.now();
    const conc = concurrency || 30;
    let runId: string | null = null;
    try {
      // 1) 取得「完整選擇」的 id 清單：有產業篩選 → 抓該產業全部；否則用目前清單
      let ids: string[] = [];
      if (industry) {
        setSteps((prev) => [...prev, { type: "phase", text: `讀取「${industry}」完整名單…` }]);
        const q = new URLSearchParams({ view: "ids", country: "TW", industry });
        const r = await fetch(`/api/brands?${q.toString()}`).then((x) => x.json()).catch(() => null);
        ids = r?.ids || [];
      } else if (brandIds && brandIds.length) {
        ids = brandIds.slice();
      } else {
        const r = await fetch(`/api/brands?view=ids&country=TW`).then((x) => x.json()).catch(() => null);
        ids = r?.ids || [];
      }
      if (!ids.length) { setResult({ ok: false, text: "找不到可比對的品牌" }); setRunning(false); return; }

      const BATCH = 500;
      const batches = Math.ceil(ids.length / BATCH);
      const kind = doGov && doChannels ? "super" : doGov ? "gov" : "channels";
      const kindLabel = kind === "super" ? "超級比對" : kind === "gov" ? "工商登記比對" : "管道補齊";
      setSteps((prev) => [...prev, { type: "phase", text: `共 ${ids.length.toLocaleString()} 筆，分 ${batches} 批（每批 ${BATCH}、${conc} 線並行）以避免逾時` }]);

      // 建立採集紀錄（永久保存「做了什麼、成果多少」）
      try {
        const cr = await fetch("/api/collection-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, label: `${kindLabel}${industry ? `·${industry}` : ""}`, scope: industry ? `「${industry}」全部 ${ids.length} 筆` : `${ids.length} 筆`, total: ids.length }) }).then((r) => r.json());
        runId = cr?.id || null;
      } catch { /* 紀錄失敗不影響採集 */ }

      let govMatched = 0, govLow = 0, chEnriched = 0;
      // 第一階段：名稱 → 統一編號 → 工商登記
      if (doGov) {
        for (let i = 0; i < batches; i++) {
          const batch = ids.slice(i * BATCH, (i + 1) * BATCH);
          const base = i * BATCH;
          setSteps((prev) => [...prev, { type: "phase", text: `🏛 工商登記 批次 ${i + 1}/${batches}（${batch.length} 筆）…` }].slice(-200));
          const d = await streamNdjson("/api/gov/lookup", { brand_ids: batch, concurrency: conc },
            (done) => setProg({ phase: `① 工商登記比對${doChannels ? "（1/2）" : ""}`, done: base + done, total: ids.length }));
          govMatched += d?.matched || 0; govLow += d?.low_confidence || 0;
        }
      }
      // 第二階段：官網 → LINE / Email / IG
      if (doChannels) {
        for (let i = 0; i < batches; i++) {
          const batch = ids.slice(i * BATCH, (i + 1) * BATCH);
          const base = i * BATCH;
          setSteps((prev) => [...prev, { type: "phase", text: `🔗 管道補齊 批次 ${i + 1}/${batches}（${batch.length} 筆）…` }].slice(-200));
          const d = await streamNdjson("/api/enrich/channels", { brand_ids: batch, concurrency: conc, usePlaces, skipRecent },
            (done) => setProg({ phase: `${doGov ? "② " : ""}管道補齊${doGov ? "（2/2）" : ""}`, done: base + done, total: ids.length }));
          chEnriched += d?.enriched || 0;
        }
      }
      const parts: string[] = [];
      if (doGov) parts.push(`統編寫入 ${govMatched} 筆（${govLow} 待確認、${Math.max(ids.length - govMatched - govLow, 0)} 查無）`);
      if (doChannels) parts.push(`補到管道 ${chEnriched} 個品牌`);
      setResult({ ok: true, text: `完成 ${ids.length.toLocaleString()} 筆　·　${parts.join("　·　")}` });
      // 更新採集紀錄
      if (runId) {
        await fetch("/api/collection-runs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: runId, status: "done", succeeded: doChannels && !doGov ? chEnriched : govMatched, pending: govLow, failed: doGov ? Math.max(ids.length - govMatched - govLow, 0) : Math.max(ids.length - chEnriched, 0), detail: { govMatched, govLow, chEnriched } }) }).catch(() => {});
        loadHistory();
      }
      onDone?.();
    } catch {
      setResult({ ok: false, text: "網路錯誤" });
      if (runId) fetch("/api/collection-runs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: runId, status: "error" }) }).catch(() => {});
    }
    setProg(null);
    setRunning(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 510, width: "94vw", maxWidth: 520, maxHeight: "82vh", background: C.surface, borderRadius: 20, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title || "🚀 批次採集"}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              30 線並行 · 每批 500 分批完整處理（避免逾時）
              {industry ? `　範圍：「${industry}」全部` : brandIds && brandIds.length ? `　範圍：目前載入 ${brandIds.length} 筆` : "　範圍：全部名單"}
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {!industry && !running && (
            <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: C.warningBg, border: `1px solid ${C.warning}`, fontSize: 12, color: C.accentDk, lineHeight: 1.6 }}>
              ⚠️ 未選產業：將處理目前載入的最新名單（可能多為<strong>人民團體</strong>，工商登記查無、也無官網可爬 → 結果會是 0）。
              建議先在上方「🎯 缺管道優先」或篩選<strong>選一個產業</strong>（如禮儀公司／養生館／旅行社／中醫診所）再比對。
            </div>
          )}
          {/* 要做什麼：模式勾選（一個面板取代原本三顆按鈕）*/}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([
              { on: doGov, set: setDoGov, icon: "🏛", label: "工商統編比對", desc: "名稱→統編→登記資料（法人走 twincn）" },
              { on: doChannels, set: setDoChannels, icon: "🔗", label: "管道補齊", desc: "Google地圖→官網→LINE/Email/IG/FB" },
            ] as const).map((m) => (
              <button key={m.label} disabled={running} onClick={() => m.set(!m.on)}
                style={{ flex: 1, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: running ? "default" : "pointer", border: `1.5px solid ${m.on ? "#7B6E99" : C.border}`, background: m.on ? "#F0EBF8" : C.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.on ? "#7B6E99" : C.muted }}>{m.on ? "☑" : "☐"} {m.icon} {m.label}</div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{m.desc}</div>
              </button>
            ))}
          </div>
          {/* 管道補齊選項：付費 API 備援開關 + 冷卻跳過 */}
          {doChannels && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button disabled={running} onClick={() => setUsePlaces(!usePlaces)}
                style={{ flex: 1.4, textAlign: "left", padding: "9px 12px", borderRadius: 10, cursor: running ? "default" : "pointer", border: `1.5px solid ${usePlaces ? "#C08A2D" : C.border}`, background: usePlaces ? "#FBF3E3" : C.surface }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: usePlaces ? "#B37A1E" : C.muted }}>
                  {usePlaces ? "☑" : "☐"} 💰 Google 付費 API 當備援
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
                  {usePlaces
                    ? "一律先跑完免費方法（搜尋引擎/官網爬蟲/FB），還缺的才呼叫 Places/CSE（計費）"
                    : "純免費：搜尋引擎(DDG+Bing 並行)找官網與 FB/IG/LINE ＋ 官網/粉專爬蟲"}
                </div>
              </button>
              <button disabled={running} onClick={() => setSkipRecent(!skipRecent)}
                style={{ flex: 1, textAlign: "left", padding: "9px 12px", borderRadius: 10, cursor: running ? "default" : "pointer", border: `1.5px solid ${skipRecent ? "#5B7C99" : C.border}`, background: skipRecent ? "#EDF2F6" : C.surface }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: skipRecent ? "#41637F" : C.muted }}>
                  {skipRecent ? "☑" : "☐"} ⏳ 跳過 7 天內已試過
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
                  {skipRecent ? "近期查無結果的不重複空轉，批次更快" : "全部重採（含近期已試過的）"}
                </div>
              </button>
            </div>
          )}
          <button onClick={run} disabled={running || (!doGov && !doChannels)} className="pressable"
            style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: running || (!doGov && !doChannels) ? C.surf2 : "#7B6E99", color: running || (!doGov && !doChannels) ? C.muted : "white", fontWeight: 700, fontSize: 15, cursor: running ? "default" : "pointer" }}>
            {running ? <span><span className="spin" style={{ marginRight: 6 }}>↻</span>分批處理中，請保持頁面開啟…</span>
              : doGov && doChannels ? "🚀 開始超級比對（統編＋管道）" : doChannels ? "🔗 開始批次管道補齊" : doGov ? "🏛 開始批次工商登記比對" : "請先勾選至少一項"}
          </button>
          {/* 即時進度條：跨批次累計 + 速率/預估剩餘（等待不再是黑盒子） */}
          {prog && (() => {
            const elapsedSec = Math.max(1, (Date.now() - startRef.current) / 1000);
            const rate = prog.done / elapsedSec; // 筆/秒
            const remainSec = rate > 0 ? Math.round((prog.total - prog.done) / rate) : 0;
            const fmtDur = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)} 時 ${Math.floor((s % 3600) / 60)} 分` : s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`;
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#7B6E99", fontWeight: 700, marginBottom: 4 }}>
                  <span>{prog.phase}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{prog.done.toLocaleString()} / {prog.total.toLocaleString()}（{prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%）</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "#E4DEF0", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%`, background: "linear-gradient(90deg,#7B6E99,#5B7C99)", borderRadius: 4, transition: "width 250ms" }} />
                </div>
                {prog.done > 0 && prog.done < prog.total && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                    <span>每分鐘約 {Math.round(rate * 60).toLocaleString()} 筆</span>
                    <span>預估還需 {fmtDur(remainSec)}</span>
                  </div>
                )}
              </div>
            );
          })()}
          {steps.length > 0 && (
            <div ref={logRef} style={{ marginTop: 12, maxHeight: 340, overflowY: "auto", background: "#0e1a11", borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.75 }}>
              {steps.map((s, i) => (
                <div key={i} style={{
                  color: s.type === "brand" ? "#c5b8e6"
                    : s.type === "store" ? (s.ok ? "#5be585" : "#888")
                    : s.text?.startsWith("[") ? "#ffd27f"
                    : "#9dbeaa",
                }}>
                  {s.text}
                </div>
              ))}
              {running && <div style={{ color: "#5be585", opacity: 0.7 }}>▌</div>}
            </div>
          )}
          {result && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: result.ok ? C.successBg : C.dangerBg, fontSize: 13, color: result.ok ? C.success : C.danger, lineHeight: 1.6 }}>
              {result.ok ? "✓ " : "✕ "}{result.text}
            </div>
          )}

          {/* 採集紀錄：每次做了什麼、成果多少，永久可查 */}
          {history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>📜 採集紀錄（最近 {history.length} 次）</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 190, overflowY: "auto" }}>
                {history.map((h) => {
                  const d = new Date(h.created_at);
                  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                  return (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: C.surf2, fontSize: 12 }}>
                      <span style={{ color: C.muted, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{when}</span>
                      <span style={{ fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label || h.kind}</span>
                      <span style={{ marginLeft: "auto", flexShrink: 0, color: h.status === "running" ? C.primary : h.status === "error" ? C.danger : C.muted }}>
                        {h.status === "running" ? "進行中…" : h.status === "error" ? "中斷" : `${h.total} 筆 → ✓${h.succeeded}${h.pending ? ` ⚠${h.pending}` : ""}${h.failed ? ` ✗${h.failed}` : ""}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── 主頁面 ───────────────────────────────────────────
export default function MatchingPage() {
  const [country, setCountry] = useState<CountryCode>("TW");
  const [brands, setBrands] = useState<ScrapeBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [usingApi, setUsingApi] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [limited, setLimited] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const detailLoaded = useRef<Set<string>>(new Set());
  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string; industries: string[]; brandCount?: number }[]>([]);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(null);
  const [filterGov, setFilterGov] = useState<boolean | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [filterCity, setFilterCity] = useState<string | null>(null);
  const [filterDistrict, setFilterDistrict] = useState<string | null>(null);

  // 載入產業群組（採集篩選用，與電子報共用同一份群組）
  useEffect(() => {
    fetch("/api/industry-groups").then((r) => r.json()).then((d) => { if (d.success) setGroups(d.data); }).catch(() => {});
  }, []);

  // 搜尋輸入防抖（避免每個字都打 API）
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // 名單量已達數萬筆：清單改用「輕量 view=match」+ 伺服器端篩選/搜尋 + 上限，
  // 門市明細/評論/比對等重資料在選取單一品牌時再補抓（見 ensureDetail）。
  const loadBrands = useCallback(() => {
    setLoadError(null);
    const p = new URLSearchParams({ view: "match", country, limit: "3000" });
    if (filterIndustry) p.set("industry", filterIndustry);
    if (debouncedSearch) p.set("search", debouncedSearch);
    fetch(`/api/brands?${p.toString()}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data)) {
          const mapped = result.data.map(dbBrandToScrapeBrand);
          detailLoaded.current = new Set(); // 清單重載 → 詳情快取失效
          setBrands(mapped);
          setUsingApi(true);
          setTotalCount(result.count ?? mapped.length);
          setLimited(!!result.limited);
          setSelectedId((prev) => (mapped.some((m: ScrapeBrand) => m.id === prev) ? prev : (mapped[0]?.id ?? null)));
        } else {
          setBrands([]);
          setLoadError(result.error || "讀取失敗，請重試");
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "網路錯誤，請重試"))
      .finally(() => setLoadingBrands(false));
  }, [country, filterIndustry, debouncedSearch]);

  // 首次載入顯示整頁 spinner（loadingBrands 初值 true）；之後切換國家/產業/搜尋為靜默背景更新
  useEffect(() => { loadBrands(); }, [loadBrands]);

  // 選取品牌時補抓完整詳情（門市/評論/低信心比對），只抓一次並快取
  const ensureDetail = useCallback((id: number | string) => {
    const sid = String(id);
    if (detailLoaded.current.has(sid)) return;
    detailLoaded.current.add(sid);
    fetch(`/api/brands?view=match&country=${country}&id=${encodeURIComponent(sid)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.[0]) {
          const full = dbBrandToScrapeBrand(res.data[0]);
          setBrands((prev) => prev.map((b) => (String(b.id) === sid ? full : b)));
        }
      })
      .catch(() => { detailLoaded.current.delete(sid); });
  }, [country]);

  useEffect(() => { if (selectedId != null) ensureDetail(selectedId); }, [selectedId, ensureDetail]);

  // 缺管道優先度（跨全部名單彙整；決定先採哪個垂直市場）
  const reloadGaps = useCallback(() => {
    fetch(`/api/brands?view=gaps&country=${country}`)
      .then((r) => r.json()).then((d) => { if (d.success) setGaps(d.data || []); }).catch(() => {});
    // 統計層：完整名單統計（不受清單上限影響）
    fetch(`/api/brands?view=overview&country=${country}`)
      .then((r) => r.json()).then((d) => { if (d.success) setOverview(d.summary); }).catch(() => {});
  }, [country]);
  useEffect(() => { reloadGaps(); }, [reloadGaps]);
  const [tab, setTab] = useState("tasks");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false); // 手機：是否開啟品牌詳情
  const [jobPanelOpen, setJobPanelOpen] = useState(false);
  const [websitePanelOpen, setWebsitePanelOpen] = useState(false);
  const [placesRefreshOpen, setPlacesRefreshOpen] = useState(false);
  const [govBatchOpen, setGovBatchOpen] = useState(false);
  const [superMatchOpen, setSuperMatchOpen] = useState(false);
  const [channelBatchOpen, setChannelBatchOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [gaps, setGaps] = useState<{ industry: string; total: number; miss_phone: number; miss_email: number; miss_line: number; miss_web: number; miss_fb: number; miss_ig: number; gap_score: number }[]>([]);
  const [gapsOpen, setGapsOpen] = useState(true);
  const [overview, setOverview] = useState<{ total: number; has_phone: number; has_email: number; has_line: number; has_web: number; has_gov: number; pipeline: number; won: number } | null>(null);
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ total: number; done: number; current: string; skipped: number } | null>(null);
  const [lastRunAll, setLastRunAll] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 批次管道補齊 / 連鎖偵測（gov 已改用 GovBatchPanel）
  const runBulk = async (kind: "channels" | "chains") => {
    if (bulkRunning) return;
    setBulkRunning(kind);
    setBulkMsg(null);
    setBulkProgress(null);

    const filterSuffix = [filterIndustry ? `「${filterIndustry}」類` : "", filterCity || "", filterDistrict || ""].filter(Boolean).join("·");

    if (kind === "chains") {
      // 連鎖偵測（非串流，json 回傳）
      try {
        const res = await fetch("/api/brands/detect-chains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
        const json = await res.json();
        if (json.success) {
          const d = json.data;
          setBulkMsg({ ok: true, text: `連鎖偵測完成：掃描 ${d.total_brands} 個品牌，識別 ${d.chains_found} 個連鎖品牌` });
          loadBrands();
        } else { setBulkMsg({ ok: false, text: json.error || "執行失敗" }); }
      } catch { setBulkMsg({ ok: false, text: "網路錯誤" }); }
      setBulkRunning(null);
      return;
    }

    // 管道補齊（串流 NDJSON，即時顯示進度）
    try {
      const res = await fetch("/api/enrich/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 批次「全部執行」預設不呼叫 Google 付費 API（省費用）；要用 Places 請走「🚀 批次採集」面板勾選
        body: JSON.stringify({ brand_ids: visibleBrands.map((b) => String(b.id)), usePlaces: false }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let errMsg = "執行失敗"; try { errMsg = JSON.parse(text).error || errMsg; } catch {}
        setBulkMsg({ ok: false, text: errMsg });
        setBulkRunning(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let total = 0;
      let done = 0;
      let enriched = 0;
      let skipped = 0;
      while (true) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim(); if (!t) continue;
          try {
            const evt = JSON.parse(t);
            if (evt.type === "init") {
              total = evt.total || 0;
              skipped = evt.skipped || 0;
              setBulkProgress({ total, done, current: `準備開始（${total} 個品牌）…`, skipped });
            } else if (evt.type === "step") {
              setBulkProgress({ total, done, current: evt.text || "", skipped });
            } else if (evt.type === "brand") {
              setBulkProgress({ total, done, current: evt.text || "", skipped });
            } else if (evt.type === "store") {
              done++;
              if (evt.ok) enriched++;
              setBulkProgress({ total, done, current: evt.text || "", skipped });
            } else if (evt.type === "done") {
              const d = evt.data;
              setBulkMsg({
                ok: true,
                text: `管道補齊完成${filterSuffix ? `（${filterSuffix}）` : ""}：${d.total} 個品牌中 ${d.enriched} 個取得新管道${d.skipped ? `，${d.skipped} 個已完整跳過` : ""}`,
              });
              loadBrands();
            } else if (evt.type === "error") {
              setBulkMsg({ ok: false, text: evt.text || "執行失敗" });
            }
          } catch { /* 解析失敗略過 */ }
        }
      }
    } catch {
      setBulkMsg({ ok: false, text: "網路錯誤" });
    }
    setBulkRunning(null);
    setBulkProgress(null);
  };

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 900);
    fn();
    window.addEventListener("resize", fn);
    // 側欄「採集任務」(?tab=collect) 直接打開任務面板
    if (window.location.search.includes("tab=collect")) setJobPanelOpen(true);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const exportCSV = () => {
    const hdrs = ["品牌名稱", "資料完整度(%)", "工商登記", "LINE", "FB", "IG", "地圖"];
    const rows = brands.map((b) => [
      b.name,
      completeness(b.tasks),
      b.tasks.gov?.status || "-",
      b.tasks.line?.status || "-",
      b.tasks.fb?.status || "-",
      b.tasks.ig?.status || "-",
      b.tasks.map?.status || "-",
    ]);
    downloadCSV("HeroHerb_採集狀態.csv", hdrs, rows);
  };

  // 真實採集：gov / channels / map 全部走 NDJSON 串流
  const inflight = useRef<Set<string>>(new Set());
  const runRealTask = async (brandId: string, srcKey: string) => {
    setBrands((prev) =>
      prev.map((b) => (b.id !== brandId ? b : { ...b, tasks: { ...b.tasks, [srcKey]: { ...b.tasks[srcKey], status: "running" as TaskStatusKey } } }))
    );
    const reqKey = `${srcKey}:${brandId}`;
    if (inflight.current.has(reqKey)) return;
    inflight.current.add(reqKey);
    let taskError: string | undefined;
    try {
      const url =
        srcKey === "gov" ? "/api/gov/lookup"
        : srcKey === "map" ? "/api/enrich/places"
        : "/api/enrich/channels";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId }),
      });
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const updateProgress = (text: string) => {
          setBrands((prev) =>
            prev.map((b) => (b.id !== brandId ? b : {
              ...b,
              tasks: { ...b.tasks, [srcKey]: { ...b.tasks[srcKey], progress: text } },
            }))
          );
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const evt = JSON.parse(t);
              if (evt.type === "error") taskError = evt.text;
              else if (evt.type === "step" && evt.text) updateProgress(evt.text);
              else if (evt.type === "store" && evt.text) updateProgress(evt.text);
            } catch {}
          }
        }
      }
    } catch (e) {
      taskError = e instanceof Error ? e.message : "採集失敗";
    }
    inflight.current.delete(reqKey);
    if (taskError) {
      setBrands((prev) =>
        prev.map((b) => (b.id !== brandId ? b : {
          ...b,
          tasks: { ...b.tasks, [srcKey]: { ...b.tasks[srcKey], status: "error" as TaskStatusKey, error: taskError, progress: undefined } },
        }))
      );
    } else {
      setBrands((prev) =>
        prev.map((b) => (b.id !== brandId ? b : {
          ...b,
          tasks: { ...b.tasks, [srcKey]: { ...b.tasks[srcKey], progress: undefined } },
        }))
      );
    }
    loadBrands();
  };

  // 模擬採集流程（種子資料用，1.8~3 秒完成，15% 失敗率）
  const runTask = (brandId: number | string, srcKey: string) => {
    if (usingApi && typeof brandId === "string") {
      runRealTask(brandId, srcKey);
      return;
    }
    setBrands((prev) =>
      prev.map((b) => (b.id !== brandId ? b : { ...b, tasks: { ...b.tasks, [srcKey]: { ...b.tasks[srcKey], status: "running" as TaskStatusKey } } }))
    );
    const key = `${brandId}-${srcKey}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      setBrands((prev) =>
        prev.map((b) => {
          if (b.id !== brandId) return b;
          const oldTask = b.tasks[srcKey];
          const succeed = Math.random() > 0.15;
          return {
            ...b,
            tasks: {
              ...b.tasks,
              [srcKey]: {
                ...oldTask,
                status: (succeed ? "done" : "error") as TaskStatusKey,
                last: succeed ? "剛剛" : oldTask.last,
                error: succeed ? undefined : "採集逾時，請稍後重試",
              },
            },
          };
        })
      );
    }, 1800 + Math.random() * 1200);
  };

  const handleDeleteBrand = async (brandId: string) => {
    try {
      const res = await fetch(`/api/brands/${brandId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setBrands((prev) => prev.filter((b) => String(b.id) !== brandId));
        setSelectedId(null);
        if (isMobile) setMobileDetail(false);
      } else {
        alert(json.error || "刪除失敗");
      }
    } catch { alert("刪除失敗"); }
  };

  const resolveConflict = (brandId: number | string, idx: number, accepted: boolean) => {
    const conflict = brands.find((b) => b.id === brandId)?.conflicts[idx];
    // 先更新畫面，真實模式再回寫 DB
    setBrands((prev) =>
      prev.map((b) => (b.id !== brandId ? b : { ...b, conflicts: b.conflicts.map((c, i) => (i === idx ? { ...c, accepted } : c)) }))
    );
    if (conflict?.recordId) {
      fetch("/api/gov/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: conflict.recordId, accept: accepted }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (!json.success) setBulkMsg({ ok: false, text: json.error || "差異確認失敗" });
          loadBrands();
        })
        .catch(() => setBulkMsg({ ok: false, text: "網路錯誤，差異確認未儲存" }));
    }
  };

  // 產業清單用「完整統計(gaps，跨全部名單)」+ 已載入合併，避免只剩最新匯入那批的產業
  const availableIndustries = [...new Set([...gaps.map((g) => g.industry), ...brands.map((b) => b.industry)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-TW"));

  // 目前選取群組的產業集合（空 = 未選群組）
  const groupIndustries = filterGroup ? (groups.find((g) => g.id === filterGroup)?.industries ?? []) : [];

  const visibleBrands = brands.filter((b) => {
    if (filterGroup && !groupIndustries.includes(b.industry)) return false;
    if (filterIndustry && b.industry !== filterIndustry) return false;
    if (filterStatus === "done" && completeness(b.tasks) !== 100) return false;
    if (filterStatus === "running" && !Object.values(b.tasks).some((t) => t.status === "running")) return false;
    if (filterStatus === "error" && !Object.values(b.tasks).some((t) => t.status === "error")) return false;
    if (filterStatus === "pending" && !b.conflicts.some((c) => c.accepted === null)) return false;
    if (filterGov === true && !b.tax_id) return false;
    if (filterGov === false && !!b.tax_id) return false;
    if (filterChannel && !(b.channels.includes(filterChannel) || (filterChannel === "line" && b.channels.includes("line_id")))) return false;
    if (filterCity && !b.cities.includes(filterCity)) return false;
    if (filterDistrict && !b.districts.includes(filterDistrict)) return false;
    return true;
  }).sort((a, b) => {
    // 未採集（0 管道）優先，然後依完整度低→高排序
    const aChannels = a.channels.length;
    const bChannels = b.channels.length;
    if (aChannels === 0 && bChannels > 0) return -1;
    if (bChannels === 0 && aChannels > 0) return 1;
    return completeness(a.tasks) - completeness(b.tasks);
  });
  const selected = selectedId != null ? visibleBrands.find((b) => b.id === selectedId) ?? visibleBrands[0] : visibleBrands[0];

  // 手機改用單欄＋詳情覆蓋（不再整頁封鎖）
  // 注意：載入/空狀態改為在內容區內呈現（見下方），避免整頁 early-return 把
  // 上方國家頁籤與採集面板一起卸載 —— 切到尚無資料的國家仍能切換與採集。

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>採集 & 比對中心</h1>
        {/* 國家頁籤 */}
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              onClick={() => { setCountry(c.code); setFilterIndustry(null); setFilterGroup(null); setFilterCity(null); setFilterDistrict(null); }}
              style={{
                padding: "5px 12px", borderRadius: 8, border: `1px solid ${country === c.code ? C.primary : C.border}`,
                background: country === c.code ? C.p50 : "transparent",
                color: country === c.code ? C.primary : C.muted,
                fontSize: 13, fontWeight: country === c.code ? 700 : 400, cursor: "pointer",
              }}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>
        <span className="d-only" style={{ fontSize: 13, color: C.muted }}>— 自動抓取各管道公開資料</span>
        {/* 主要動作只留兩顆：①找新名單 ②補齊既有名單；其餘收進「更多」 */}
        <button
          onClick={() => setJobPanelOpen(true)}
          className="pressable"
          title="用關鍵字＋縣市從 Google 地圖採集新店家進名單"
          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}
        >
          ⚡ 採集新名單
        </button>
        <button
          onClick={() => setSuperMatchOpen(true)}
          className="pressable"
          title="對既有名單批次補資料：工商統編＋官網/LINE/Email/IG（面板內可勾選、30 線分批、含進度與紀錄）"
          style={{ padding: "7px 15px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7B6E99,#5B7C99)", color: "white", fontSize: 13, fontWeight: 800, cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 8px rgba(123,110,153,.35)" }}
        >
          🚀 批次採集{filterIndustry ? `·${filterIndustry}` : ""}
        </button>
        <button
          onClick={() => setMoreToolsOpen(!moreToolsOpen)}
          className="pressable"
          style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${moreToolsOpen ? C.primary : C.border}`, background: moreToolsOpen ? C.p50 : C.surface, color: moreToolsOpen ? C.primary : C.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
        >
          ⋯ 更多工具{moreToolsOpen ? " ▲" : ""}
        </button>
      </div>
      {/* 更多工具列（收納低頻操作，減少破碎感）*/}
      {moreToolsOpen && (
        <div style={{ display: "flex", gap: 8, padding: "8px 20px", background: C.surf2, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", flexShrink: 0 }}>
          <button onClick={() => setPlacesRefreshOpen(true)} className="pressable"
            title="用既有 place_id 重新抓電話/評分/評論"
            style={{ padding: "6px 13px", borderRadius: 9, border: `1px solid #D9770660`, background: "#FEF3C7", color: "#B45309", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            📍 更新 Places 詳情
          </button>
          <button onClick={() => runBulk("chains")} disabled={!!bulkRunning} className="pressable"
            title="偵測名稱相似的品牌，歸戶為連鎖"
            style={{ padding: "6px 13px", borderRadius: 9, border: `1px solid #0891B260`, background: "#E0F2FE", color: "#0369A1", fontSize: 12, fontWeight: 700, cursor: bulkRunning ? "default" : "pointer" }}>
            {bulkRunning === "chains" ? <span className="spin">↻</span> : "🔗"} 連鎖偵測
          </button>
          <button onClick={() => setWebsitePanelOpen(true)} className="pressable"
            title="進階官網爬蟲（自訂範圍/模式）"
            style={{ padding: "6px 13px", borderRadius: 9, border: `1px solid #2D7D4660`, background: "#E3F5EB", color: "#2D7D46", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🌐 官網爬蟲（進階）
          </button>
          <button onClick={() => setGovBatchOpen(true)} className="pressable"
            title="只跑工商統編比對（批次採集面板也能做到）"
            style={{ padding: "6px 13px", borderRadius: 9, border: `1px solid #7B6E9960`, background: "#EAE5F0", color: "#7B6E99", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🏛 只比對工商統編
          </button>
          <button onClick={exportCSV} className="pressable"
            style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            ↓ 匯出採集狀態 CSV
          </button>
        </div>
      )}
      {/* 管道補齊即時進度條 */}
      {bulkProgress && (
        <div style={{ padding: "8px 20px", background: "#E0F2FE", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#0369A1", marginBottom: 4 }}>
            <span className="spin" style={{ display: "inline-block" }}>↻</span>
            <span>管道補齊中… {bulkProgress.done}/{bulkProgress.total}{bulkProgress.skipped > 0 ? `（已跳過 ${bulkProgress.skipped} 個完整品牌）` : ""}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#BAE6FD", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${bulkProgress.total ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}%`, background: "#0284C7", borderRadius: 3, transition: "width 300ms" }} />
          </div>
          {bulkProgress.current && <div style={{ fontSize: 11, color: "#0369A1", marginTop: 3, opacity: 0.8 }}>{bulkProgress.current}</div>}
        </div>
      )}
      {bulkMsg && (
        <div style={{ padding: "8px 20px", background: bulkMsg.ok ? C.successBg : C.dangerBg, borderBottom: `1px solid ${C.border}`, fontSize: 13, color: bulkMsg.ok ? C.success : C.danger, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {bulkMsg.ok ? "✓" : "✕"} {bulkMsg.text}
          <button onClick={() => setBulkMsg(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "inherit", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      {/* 統計層：完整名單統計（跨全部名單，不受清單上限影響）*/}
      {overview && (
        <div style={{ padding: "8px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>📊 完整統計</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{overview.total.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: C.muted }}>名單總數</span>
          </span>
          {([
            { label: "電話", have: overview.has_phone },
            { label: "Email", have: overview.has_email },
            { label: "LINE", have: overview.has_line },
            { label: "官網", have: overview.has_web },
            { label: "工商", have: overview.has_gov },
          ] as const).map((s) => {
            const pct = overview.total ? Math.round((s.have / overview.total) * 100) : 0;
            const color = pct >= 60 ? C.success : pct >= 30 ? C.warning : C.danger;
            return (
              <span key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 4 }} title={`${s.have.toLocaleString()} / ${overview.total.toLocaleString()}`}>
                <span style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                <span style={{ fontSize: 12, color: C.muted }}>{s.label}</span>
              </span>
            );
          })}
          <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>進行中 {overview.pipeline.toLocaleString()} · 成交 {overview.won.toLocaleString()}</span>
        </div>
      )}

      <SummaryBar brands={brands} totalCount={overview?.total ?? totalCount} lastRunAll={lastRunAll} activeFilter={filterStatus} onFilter={setFilterStatus} />

      {/* 缺管道優先度：紅=最缺、最該先採集；點選即篩選該產業 */}
      {gaps.length > 0 && (
        <div style={{ padding: "8px 20px", background: C.surf2, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: gapsOpen ? 8 : 0 }}>
            <button onClick={() => setGapsOpen(!gapsOpen)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: C.text, padding: 0 }}>
              🎯 缺管道優先（先採這些）{gapsOpen ? " ▼" : " ▶"}
            </button>
            <span style={{ fontSize: 11, color: C.muted }}>依缺少的聯絡管道加權排序，紅色代表最缺、最該優先蒐集</span>
          </div>
          {gapsOpen && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              {gaps.slice(0, 12).map((g) => {
                const maxGap = gaps[0]?.gap_score || 1;
                const ratio = g.gap_score / maxGap;
                const color = ratio > 0.66 ? C.danger : ratio > 0.33 ? C.warning : C.success;
                const bg = ratio > 0.66 ? C.dangerBg : ratio > 0.33 ? C.warningBg : C.successBg;
                const on = filterIndustry === g.industry;
                const miss = [
                  g.miss_phone ? `電話${g.miss_phone.toLocaleString()}` : "",
                  g.miss_email ? `Email${g.miss_email.toLocaleString()}` : "",
                  g.miss_line ? `LINE${g.miss_line.toLocaleString()}` : "",
                  g.miss_web ? `官網${g.miss_web.toLocaleString()}` : "",
                ].filter(Boolean).slice(0, 3).join(" · ");
                return (
                  <button key={g.industry} onClick={() => setFilterIndustry(on ? null : g.industry)}
                    title={`${g.industry}：共 ${g.total} 筆，缺口分數 ${g.gap_score}`}
                    style={{ flexShrink: 0, textAlign: "left", padding: "8px 12px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${on ? color : "transparent"}`, background: bg, minWidth: 152 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{g.industry}</span>
                      <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>{g.total.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color, marginTop: 3, fontWeight: 600 }}>缺 {miss || "—"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 類別篩選欄 */}
      <div style={{ display: "flex", gap: 6, padding: "8px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
        {/* 產業群組選擇器 */}
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>群組：</span>
        <select
          value={filterGroup ?? ""}
          onChange={(e) => { const v = e.target.value || null; setFilterGroup(v); if (v) setFilterIndustry(null); }}
          title="依產業群組篩選（管理：產業群組頁）"
          style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12, border: `1px solid ${filterGroup ? C.primary : C.border}`, background: filterGroup ? C.p50 : C.surface, color: filterGroup ? C.primary : C.text, fontWeight: filterGroup ? 700 : 400, cursor: "pointer" }}
        >
          <option value="">全部群組</option>
          {groups.map((g) => (<option key={g.id} value={g.id}>◳ {g.name}（{g.brandCount ?? g.industries.length}）</option>))}
        </select>
        <span style={{ width: 1, height: 16, background: C.border, margin: "0 4px" }} />
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>類別：</span>
        <button
          onClick={() => { setFilterIndustry(null); }}
          style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: filterIndustry === null ? 700 : 400, border: `1px solid ${filterIndustry === null ? C.primary : C.border}`, background: filterIndustry === null ? C.p50 : "transparent", color: filterIndustry === null ? C.primary : C.muted, cursor: "pointer" }}
        >
          全部（{filterGroup
            ? (gaps.filter((g) => groupIndustries.includes(g.industry)).reduce((s, g) => s + g.total, 0) || brands.filter((b) => groupIndustries.includes(b.industry)).length)
            : (overview?.total ?? (gaps.reduce((s, g) => s + g.total, 0) || brands.length))}）
        </button>
        {availableIndustries.filter((ind) => !filterGroup || groupIndustries.includes(ind)).map((ind) => {
          // 數字取自完整統計(gaps.total，跨全部名單)，非只算已載入的 1000 筆；查無再退回載入數
          const cnt = gaps.find((g) => g.industry === ind)?.total ?? brands.filter((b) => b.industry === ind).length;
          const active = filterIndustry === ind;
          return (
            <button
              key={ind}
              onClick={() => setFilterIndustry(active ? null : ind)}
              style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: active ? 700 : 400, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.p50 : "transparent", color: active ? C.primary : C.muted, cursor: "pointer" }}
            >
              {ind}（{cnt}）
            </button>
          );
        })}
      </div>

      {/* 工商 / 管道 / 縣市篩選欄（數字依篩選後的名單動態計算） */}
      {(() => {
        // 先依類別/縣市/地區篩選（不含工商/管道本身，避免循環）
        const baseFiltered = brands.filter((b) => {
          if (filterGroup && !groupIndustries.includes(b.industry)) return false;
          if (filterIndustry && b.industry !== filterIndustry) return false;
          if (filterCity && !b.cities.includes(filterCity)) return false;
          if (filterDistrict && !b.districts.includes(filterDistrict)) return false;
          return true;
        });
        const availableCities = [...new Set(brands.flatMap((b) => b.cities))].sort((a, z) => a.localeCompare(z, "zh-TW"));
        const govCount = baseFiltered.filter((b) => b.tax_id).length;
        const chCounts: Record<string, number> = {};
        for (const ch of CHANNEL_ORDER) {
          chCounts[ch] = baseFiltered.filter((b) => b.channels.includes(ch) || (ch === "line" && b.channels.includes("line_id"))).length;
        }
        const hasAnyExtra = filterGov !== null || filterChannel !== null || filterCity !== null || filterDistrict !== null;
        return (
          <div style={{ display: "flex", gap: 6, padding: "7px 20px", background: C.surf2, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
            {/* 工商登記 */}
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>工商：</span>
            {([true, false] as const).map((v) => {
              const cnt = v ? govCount : baseFiltered.length - govCount;
              return (
                <button
                  key={String(v)}
                  onClick={() => setFilterGov(filterGov === v ? null : v)}
                  style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterGov === v ? 700 : 400, border: `1px solid ${filterGov === v ? "#7B6E99" : C.border}`, background: filterGov === v ? "#EAE5F0" : "transparent", color: filterGov === v ? "#7B6E99" : C.muted, cursor: "pointer" }}
                >
                  {v ? "有登記" : "缺登記"}（{cnt}）
                </button>
              );
            })}

            {/* 管道 */}
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6, marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>管道：</span>
            {CHANNEL_ORDER.map((ch) => {
              const cfg = CHANNELS[ch];
              if (!cfg) return null;
              const cnt = chCounts[ch] || 0;
              return (
                <button
                  key={ch}
                  onClick={() => setFilterChannel(filterChannel === ch ? null : ch)}
                  style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterChannel === ch ? 700 : 400, border: `1px solid ${filterChannel === ch ? cfg.bg : C.border}`, background: filterChannel === ch ? cfg.bg : "transparent", color: filterChannel === ch ? "white" : C.muted, cursor: "pointer" }}
                >
                  {cfg.label}（{cnt}）
                </button>
              );
            })}

            {/* 縣市 */}
            {availableCities.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6, marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>縣市：</span>
                {availableCities.map((city) => (
                  <button
                    key={city}
                    onClick={() => { setFilterCity(filterCity === city ? null : city); setFilterDistrict(null); }}
                    style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterCity === city ? 700 : 400, border: `1px solid ${filterCity === city ? C.accent : C.border}`, background: filterCity === city ? "#EDF4F0" : "transparent", color: filterCity === city ? C.accentDk : C.muted, cursor: "pointer" }}
                  >
                    {city}
                  </button>
                ))}
              </>
            )}

            {/* 地區（僅在選了縣市後，顯示該縣市實際有資料的行政區） */}
            {(() => {
              if (!filterCity) return null; // 未選縣市不顯示地區
              const cityKey = Object.keys(CITY_DISTRICTS).find((c) => c === filterCity);
              const dists = cityKey ? CITY_DISTRICTS[cityKey] : [];
              // 只顯示「該縣市品牌實際出現過」的行政區
              const inCity = [...new Set(brands.filter((b) => b.cities.includes(filterCity)).flatMap((b) => b.districts))];
              const availableDistricts = (dists.length > 0
                ? dists.filter((d) => inCity.includes(d))
                : inCity
              ).sort((a, z) => a.localeCompare(z, "zh-TW"));
              if (availableDistricts.length === 0) return null;
              return (
                <>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6, marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>地區：</span>
                  {availableDistricts.map((d) => (
                    <button
                      key={d}
                      onClick={() => setFilterDistrict(filterDistrict === d ? null : d)}
                      style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterDistrict === d ? 700 : 400, border: `1px solid ${filterDistrict === d ? "#D97706" : C.border}`, background: filterDistrict === d ? "#FEF3C7" : "transparent", color: filterDistrict === d ? "#92400E" : C.muted, cursor: "pointer" }}
                    >
                      {d}
                    </button>
                  ))}
                </>
              );
            })()}

            {hasAnyExtra && (
              <button
                onClick={() => { setFilterGov(null); setFilterChannel(null); setFilterCity(null); setFilterDistrict(null); }}
                style={{ marginLeft: "auto", fontSize: 11, color: C.muted, border: "none", background: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                清除
              </button>
            )}
          </div>
        );
      })()}

      {/* 採集覆蓋率：篩選後清楚看到哪些縣市/地區/工商尚未採集完成（項目 6、7） */}
      {(() => {
        const vb = visibleBrands;
        if (vb.length === 0) return null;
        const isDone = (b: ScrapeBrand) => completeness(b.tasks) === 100;
        const complete = vb.filter(isDone).length;
        const incomplete = vb.length - complete;
        const noGov = vb.filter((b) => !b.tax_id).length;
        const noMap = vb.filter((b) => b.tasks.map?.status !== "done").length;
        const noChannel = vb.filter((b) => !["line", "fb", "ig"].some((c) => b.channels.includes(c))).length;

        // 待採集地區彙整（選了縣市看地區、否則看縣市）；點擊可直接篩選
        const useDistrict = !!filterCity;
        const gapMap: Record<string, number> = {};
        for (const b of vb) {
          if (isDone(b)) continue;
          const keys = useDistrict ? b.districts : b.cities;
          for (const k of keys.length ? keys : ["（未標記）"]) gapMap[k] = (gapMap[k] || 0) + 1;
        }
        const gaps = Object.entries(gapMap).filter(([k]) => k !== "（未標記）").sort((a, z) => z[1] - a[1]).slice(0, 12);

        const chip = (label: string, n: number, color: string, bg: string) => (
          <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: bg, color, fontWeight: 600 }}>{label} {n}</span>
        );
        return (
          <div style={{ display: "flex", gap: 8, padding: "8px 20px", background: C.warningBg, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>採集進度：</span>
            {chip("完整", complete, C.success, C.successBg)}
            {chip("待採集", incomplete, "#92400E", "#FEF3C7")}
            {chip("缺工商", noGov, "#7B6E99", "#EAE5F0")}
            {chip("缺社群", noChannel, "#5B7C99", "#E3ECF2")}
            {chip("缺地圖", noMap, "#9E7048", "#F5EDDD")}
            {gaps.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginLeft: 6, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>
                  待採集{useDistrict ? "地區" : "縣市"}：
                </span>
                {gaps.map(([area, n]) => (
                  <button
                    key={area}
                    onClick={() => { if (useDistrict) setFilterDistrict(filterDistrict === area ? null : area); else { setFilterCity(filterCity === area ? null : area); setFilterDistrict(null); } }}
                    title="點擊篩選此區待採集品牌"
                    style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer" }}
                  >
                    {area} <b style={{ color: "#92400E" }}>{n}</b>
                  </button>
                ))}
              </>
            )}

            {/* 尚未採集的縣市提示 */}
            {(() => {
              const collectedCities = new Set(brands.flatMap((b) => b.cities));
              const uncollected = CITY_OPTIONS.filter((c) => !collectedCities.has(c));
              if (uncollected.length === 0) return null;
              return (
                <>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginLeft: 6, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>
                    尚未採集（{uncollected.length}）：
                  </span>
                  {uncollected.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setJobPanelOpen(true); }}
                      title={`點擊開啟採集任務，前往採集「${c}」`}
                      style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, border: `1px dashed #D97706`, background: "transparent", color: "#92400E", cursor: "pointer" }}
                    >
                      {c}
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
        );
      })()}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {loadingBrands ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.muted }}>
            <div className="spin" style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%" }} />
            <div style={{ fontSize: 14 }}>載入品牌資料中…</div>
          </div>
        ) : loadError ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: C.muted, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>讀取資料失敗</div>
            <div style={{ fontSize: 12, maxWidth: 360 }}>{loadError}</div>
            <button onClick={() => { setLoadingBrands(true); loadBrands(); }} className="pressable"
              style={{ marginTop: 4, padding: "8px 18px", borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              重試
            </button>
          </div>
        ) : brands.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>{debouncedSearch ? "🔍" : "🌿"}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>
              {debouncedSearch
                ? `查無符合「${debouncedSearch}」的品牌`
                : <>{COUNTRIES.find((c) => c.code === country)?.flag} {COUNTRIES.find((c) => c.code === country)?.label}尚無品牌資料</>}
            </div>
            <div style={{ fontSize: 13 }}>點右上「⚡ 新增採集任務」開始採集{country !== "TW" ? "（面板內可切換國家）" : "，或至名單總覽新增"}</div>
            <button
              onClick={() => setJobPanelOpen(true)}
              className="pressable"
              style={{ marginTop: 6, padding: "8px 18px", borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              ⚡ 開始採集
            </button>
          </div>
        ) : (
        <>
        {/* 手機：選了品牌就隱藏名單（改顯示詳情覆蓋層） */}
        {!(isMobile && mobileDetail) && (
        <BrandList
          isMobile={isMobile}
          brands={visibleBrands}
          selectedId={selectedId}
          search={searchTerm}
          onSearch={setSearchTerm}
          total={totalCount}
          limited={limited}
          onSelect={(id) => {
            setSelectedId(id);
            setTab("tasks");
            if (isMobile) setMobileDetail(true);
          }}
          onRunAll={async () => {
            if (usingApi) {
              setGovBatchOpen(true);
              await runBulk("channels");
            } else {
              visibleBrands.forEach((b) => Object.keys(b.tasks).forEach((k) => runTask(b.id, k)));
            }
            const now = new Date();
            setLastRunAll(`${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
          }}
        />
        )}
        {/* 桌機：右側固定顯示詳情；手機：選取後以全幅覆蓋層顯示，附返回鍵 */}
        {selected && (!isMobile || mobileDetail) && (
          isMobile ? (
            <div style={{ position: "absolute", inset: 0, zIndex: 20, background: C.surface, display: "flex", flexDirection: "column" }}>
              <button
                onClick={() => setMobileDetail(false)}
                style={{ flexShrink: 0, textAlign: "left", padding: "11px 16px", border: "none", borderBottom: `1px solid ${C.border}`, background: C.surf2, color: C.primary, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                ← 返回名單
              </button>
              <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                <DetailPanel brand={selected} tab={tab} onTabChange={setTab} onRunTask={runTask} onAcceptConflict={resolveConflict} onGovUpdated={loadBrands} onDelete={handleDeleteBrand} />
              </div>
            </div>
          ) : (
            <DetailPanel brand={selected} tab={tab} onTabChange={setTab} onRunTask={runTask} onAcceptConflict={resolveConflict} onGovUpdated={loadBrands} onDelete={handleDeleteBrand} />
          )
        )}
        </>
        )}
      </div>

      {jobPanelOpen && <PlacesJobPanel onClose={() => setJobPanelOpen(false)} onDone={() => loadBrands()} country={country} onCountryChange={setCountry} />}
      {websitePanelOpen && <WebsiteScraperPanel onClose={() => setWebsitePanelOpen(false)} onDone={loadBrands} industries={availableIndustries} filterCity={filterCity} filterIndustry={filterIndustry} filterGroupName={groups.find((g) => g.id === filterGroup)?.name ?? null} visibleBrandIds={visibleBrands.map((b) => String(b.id))} />}
      {placesRefreshOpen && <PlacesRefreshPanel onClose={() => setPlacesRefreshOpen(false)} onDone={loadBrands} />}
      {govBatchOpen && <GovBatchPanel industry={filterIndustry} brandIds={visibleBrands.map((b) => String(b.id))} onClose={() => setGovBatchOpen(false)} onDone={loadBrands} />}
      {superMatchOpen && <GovBatchPanel concurrency={30} thenChannels title="🚀 批次採集（30 線並行）" industry={filterIndustry} brandIds={visibleBrands.map((b) => String(b.id))} onClose={() => setSuperMatchOpen(false)} onDone={() => { loadBrands(); reloadGaps(); }} />}
      {channelBatchOpen && <GovBatchPanel concurrency={30} channelsMode title="🔗 管道補齊（批次）" industry={filterIndustry} brandIds={visibleBrands.map((b) => String(b.id))} onClose={() => setChannelBatchOpen(false)} onDone={() => { loadBrands(); reloadGaps(); }} />}
    </>
  );
}
