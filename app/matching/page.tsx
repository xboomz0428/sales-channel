"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { C, downloadCSV, INDUSTRIES, CHANNELS, CHANNEL_ORDER } from "@/lib/design";

// ── 來源定義 ─────────────────────────────────────────
const SOURCES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  gov: { label: "工商登記", icon: "🏛", color: "#7B6E99", bg: "#EAE5F0" },
  line: { label: "LINE", icon: "💬", color: "#06A74A", bg: "#E3F5EB" },
  fb: { label: "FB", icon: "📘", color: "#1877F2", bg: "#E3EDFB" },
  ig: { label: "IG", icon: "📸", color: "#C13584", bg: "#F5E3F0" },
  map: { label: "地圖", icon: "📍", color: "#D97706", bg: "#FEF3C7" },
};

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
}: {
  brands: ScrapeBrand[];
  selectedId: number | string | null;
  onSelect: (id: number | string) => void;
  onRunAll: () => void;
}) {
  return (
    <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>品牌名單</span>
        <button
          onClick={onRunAll}
          className="pressable"
          style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: C.primary, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
        >
          ⚡ 全部採集
        </button>
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
      <div style={{ fontSize: 12, fontWeight: 700, color: "#7B6E99", marginBottom: 10 }}>🔍 手動查詢工商登記</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !searching && search()}
          placeholder="輸入統一編號（8位數）或公司名稱關鍵字…"
          style={{ flex: 1, padding: "8px 11px", borderRadius: 9, border: "1px solid #DDD5EB", background: "white", fontSize: 13, color: C.text, outline: "none" }}
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
}: {
  brand: ScrapeBrand;
  tab: string;
  onTabChange: (t: string) => void;
  onRunTask: (brandId: number | string, src: string) => void;
  onAcceptConflict: (brandId: number | string, idx: number, accepted: boolean) => void;
  onGovUpdated?: () => void;
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
                onClick={() => Object.keys(brand.tasks).forEach((k) => onRunTask(brand.id, k))}
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

// ── 手機提示 ─────────────────────────────────────────
function MobileBlock() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", background: C.bg }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🖥</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>請使用電腦操作</div>
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
        採集任務與比對中心需要較大的螢幕空間，
        <br />
        請切換到桌機或平板橫向模式後再進入。
      </div>
      <Link href="/followups" style={{ marginTop: 28, padding: "11px 24px", borderRadius: 12, background: C.primary, color: "white", textDecoration: "none", fontSize: 15, fontWeight: 700 }}>
        返回今日跟進
      </Link>
    </div>
  );
}

// ── 摘要列 ───────────────────────────────────────────
type StatusFilter = "done" | "running" | "error" | "pending" | null;

function SummaryBar({
  brands,
  lastRunAll,
  activeFilter,
  onFilter,
}: {
  brands: ScrapeBrand[];
  lastRunAll: string | null;
  activeFilter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
}) {
  const all = brands.length;
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

const CITY_OPTIONS = ["台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市"];
const KEYWORD_SUGGEST = ["養生館", "越式洗髮", "宮廟", "長照中心", "禮儀公司", "SPA"];

function PlacesJobPanel({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("台中市");
  const [maxPages, setMaxPages] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [steps, setSteps] = useState<{ type: string; text: string; ok?: boolean }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const loadJobs = () => {
    fetch("/api/scrape/places")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setJobs(res.data);
      })
      .catch(() => {});
  };
  useEffect(loadJobs, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps]);

  const run = async () => {
    if (!keyword.trim() || running) return;
    setRunning(true);
    setResult(null);
    setResultOk(false);
    setSteps([]);
    try {
      const response = await fetch("/api/scrape/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), city, maxPages }),
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
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>⚡ 新增採集任務</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Google Places 關鍵字 × 城市，自動寫入名單</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {/* 關鍵字 */}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>產業關鍵字</div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例：養生館、宮廟、長照中心…"
            style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 15, color: C.text, outline: "none", marginBottom: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {KEYWORD_SUGGEST.map((k) => (
              <button
                key={k}
                onClick={() => setKeyword(k)}
                style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, border: `1px solid ${keyword === k ? C.primary : C.border}`, background: keyword === k ? C.p50 : "transparent", color: keyword === k ? C.primary : C.muted, cursor: "pointer" }}
              >
                {k}
              </button>
            ))}
          </div>

          {/* 城市 */}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>城市</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {CITY_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: city === c ? 700 : 400, border: `1px solid ${city === c ? C.primary : C.border}`, background: city === c ? C.p50 : "transparent", color: city === c ? C.primary : C.text, cursor: "pointer" }}
              >
                {c}
              </button>
            ))}
          </div>

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
            {running ? (
              <span>
                <span className="spin" style={{ marginRight: 6 }}>↻</span>採集中，約需 5~15 秒…
              </span>
            ) : (
              `⚡ 開始採集「${keyword || "…"} × ${city}」`
            )}
          </button>

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
type ScrapeMode = "limit" | "industry" | "brand";

function WebsiteScraperPanel({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
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
    fetch("/api/brands")
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
    if (mode === "industry") return { all: true, industry }; // 不加 limit，全類別採集
    return limit > 0 ? { all: true, limit } : { all: true }; // limit=0 → 不限制
  };

  const canRun = !running && (
    mode === "limit" ||
    (mode === "industry" && industry) ||
    (mode === "brand" && selectedIds.size > 0)
  );

  const runLabel = () => {
    if (running) return "爬取中…";
    if (mode === "brand") return `🌐 爬取已選 ${selectedIds.size} 個品牌`;
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

  const INDUSTRIES_LIST = ["養生館", "越式洗髮", "宮廟", "長照", "禮儀"];

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
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 510, width: "94vw", maxWidth: 520, maxHeight: "86vh", background: C.surface, borderRadius: 20, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>🌐 官網爬蟲</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>爬取品牌官網，擷取 LINE / FB / IG / 電話 / Email</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {/* 模式切換 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            <ModeBtn m="limit" label="依數量" />
            <ModeBtn m="industry" label="依類別" />
            <ModeBtn m="brand" label="指定品牌" />
          </div>

          {/* 依數量 */}
          {mode === "limit" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              {[20, 50, 100].map((n) => (
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

          {/* 指定品牌 */}
          {mode === "brand" && (
            <div style={{ marginBottom: 18 }}>
              <input
                placeholder="搜尋品牌名稱或類別…"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                style={{ width: "100%", padding: "9px 13px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
              />
              {selectedIds.size > 0 && (
                <div style={{ fontSize: 12, color: C.primary, fontWeight: 600, marginBottom: 8 }}>
                  已選 {selectedIds.size} 個品牌
                  <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 8, fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>全部清除</button>
                </div>
              )}
              <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {filteredBrands.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                    {allBrands.length === 0 ? "載入中…" : "找不到符合的品牌"}
                  </div>
                ) : filteredBrands.map((b) => (
                  <div key={b.id} onClick={() => toggleBrand(b.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: selectedIds.has(b.id) ? C.p50 : "transparent", borderBottom: `1px solid ${C.border}`, transition: "background 120ms" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selectedIds.has(b.id) ? C.primary : C.border}`, background: selectedIds.has(b.id) ? C.primary : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {selectedIds.has(b.id) && <span style={{ color: "white", fontSize: 10, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: selectedIds.has(b.id) ? 600 : 400, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                      {b.industry && <div style={{ fontSize: 11, color: C.muted }}>{b.industry}</div>}
                    </div>
                  </div>
                ))}
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

// ── 主頁面 ───────────────────────────────────────────
export default function MatchingPage() {
  const [brands, setBrands] = useState<ScrapeBrand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [usingApi, setUsingApi] = useState(false);
  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(null);
  const [filterGov, setFilterGov] = useState<boolean | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [filterCity, setFilterCity] = useState<string | null>(null);

  const loadBrands = () => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          const mapped = result.data.map(dbBrandToScrapeBrand);
          setBrands(mapped);
          setUsingApi(true);
          setSelectedId((prev) => (mapped.some((m: ScrapeBrand) => m.id === prev) ? prev : mapped[0].id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBrands(false));
  };
  useEffect(loadBrands, []);
  const [tab, setTab] = useState("tasks");
  const [isMobile, setIsMobile] = useState(false);
  const [jobPanelOpen, setJobPanelOpen] = useState(false);
  const [websitePanelOpen, setWebsitePanelOpen] = useState(false);
  const [placesRefreshOpen, setPlacesRefreshOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastRunAll, setLastRunAll] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 批次政府登記比對 / 管道補齊 / 連鎖偵測
  const runBulk = async (kind: "gov" | "channels" | "chains", industry?: string | null) => {
    if (bulkRunning) return;
    setBulkRunning(kind);
    setBulkMsg(null);
    try {
      const url =
        kind === "gov" ? "/api/gov/lookup"
        : kind === "chains" ? "/api/brands/detect-chains"
        : "/api/enrich/channels";
      const reqBody: Record<string, unknown> = { all: true };
      if (industry && kind !== "chains") reqBody.industry = industry;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        const indsuffix = industry ? `（「${industry}」類）` : "";
        setBulkMsg({
          ok: true,
          text:
            kind === "gov"
              ? `工商登記比對完成${indsuffix}：${d.total} 筆中 ${d.matched} 筆高信心回寫（統編/負責人/資本額），${d.low_confidence} 筆待人工確認`
              : kind === "chains"
              ? `連鎖偵測完成：掃描 ${d.total_brands} 個品牌，識別 ${d.chains_found} 個連鎖品牌（全國連鎖 ${d.groups["全國連鎖"]}、區域連鎖 ${d.groups["區域連鎖"]}、多據點 ${d.groups["多據點"]}），已提升優先分`
              : `管道補齊完成${indsuffix}：${d.total} 個品牌中 ${d.enriched} 個取得官網/電話/地圖/社群連結`,
        });
        loadBrands();
      } else {
        setBulkMsg({ ok: false, text: json.error || "執行失敗" });
      }
    } catch {
      setBulkMsg({ ok: false, text: "網路錯誤" });
    }
    setBulkRunning(null);
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

  // 真實採集：gov → 工商登記比對；其他來源 → 管道補齊
  // line/fb/ig/map 共用同一支 enrich API，同品牌同時只發一次
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
      // gov 回傳 JSON；channels/map 回傳 NDJSON 串流，需消耗完畢才能確保 DB 寫入完成
      if (srcKey === "gov") {
        const json = await res.json();
        if (!json.success) taskError = json.error || "比對失敗";
      } else if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
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
          tasks: { ...b.tasks, [srcKey]: { ...b.tasks[srcKey], status: "error" as TaskStatusKey, error: taskError } },
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

  const visibleBrands = brands.filter((b) => {
    if (filterIndustry && b.industry !== filterIndustry) return false;
    if (filterStatus === "done" && completeness(b.tasks) !== 100) return false;
    if (filterStatus === "running" && !Object.values(b.tasks).some((t) => t.status === "running")) return false;
    if (filterStatus === "error" && !Object.values(b.tasks).some((t) => t.status === "error")) return false;
    if (filterStatus === "pending" && !b.conflicts.some((c) => c.accepted === null)) return false;
    if (filterGov === true && !b.tax_id) return false;
    if (filterGov === false && !!b.tax_id) return false;
    if (filterChannel && !b.channels.includes(filterChannel)) return false;
    if (filterCity && !b.cities.includes(filterCity)) return false;
    return true;
  });
  const selected = selectedId != null ? visibleBrands.find((b) => b.id === selectedId) ?? visibleBrands[0] : visibleBrands[0];

  if (isMobile) return <MobileBlock />;

  if (loadingBrands) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.muted }}>
      <div className="spin" style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%" }} />
      <div style={{ fontSize: 14 }}>載入品牌資料中…</div>
    </div>
  );

  if (brands.length === 0) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted }}>
      <div style={{ fontSize: 36 }}>🌿</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>尚無品牌資料</div>
      <div style={{ fontSize: 13 }}>請先至名單總覽新增品牌，或執行 Google Places 採集</div>
    </div>
  );

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>採集 & 比對中心</h1>
        <span style={{ fontSize: 13, color: C.muted }}>— 自動抓取各管道公開資料，與現有名單核對差異</span>
        <button
          onClick={() => setJobPanelOpen(true)}
          className="pressable"
          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}
        >
          ⚡ 新增採集任務
        </button>
        <button
          onClick={() => setPlacesRefreshOpen(true)}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #D97706 60`, background: "#FEF3C7", color: "#B45309", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
        >
          📍 更新 Places
        </button>
        <button
          onClick={() => runBulk("chains")}
          disabled={!!bulkRunning}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #0891B260`, background: "#E0F2FE", color: "#0369A1", fontSize: 13, fontWeight: 700, cursor: bulkRunning ? "default" : "pointer", flexShrink: 0 }}
        >
          {bulkRunning === "chains" ? <span className="spin">↻</span> : "🔗"} 連鎖偵測
        </button>
        <button
          onClick={() => runBulk("gov", filterIndustry)}
          disabled={!!bulkRunning}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #7B6E9960`, background: "#EAE5F0", color: "#7B6E99", fontSize: 13, fontWeight: 700, cursor: bulkRunning ? "default" : "pointer", flexShrink: 0 }}
        >
          {bulkRunning === "gov" ? <span className="spin">↻</span> : "🏛"} 工商登記比對{filterIndustry ? `（${filterIndustry}）` : ""}
        </button>
        <button
          onClick={() => runBulk("channels", filterIndustry)}
          disabled={!!bulkRunning}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #5B7C9960`, background: "#E3EDFB", color: "#5B7C99", fontSize: 13, fontWeight: 700, cursor: bulkRunning ? "default" : "pointer", flexShrink: 0 }}
        >
          {bulkRunning === "channels" ? <span className="spin">↻</span> : "🔗"} 管道補齊{filterIndustry ? `（${filterIndustry}）` : ""}
        </button>
        <button
          onClick={() => setWebsitePanelOpen(true)}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #2D7D4660`, background: "#E3F5EB", color: "#2D7D46", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
        >
          🌐 官網爬蟲
        </button>
        <button
          onClick={exportCSV}
          className="pressable"
          style={{ padding: "7px 13px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
        >
          ↓ CSV
        </button>
      </div>
      {bulkMsg && (
        <div style={{ padding: "8px 20px", background: bulkMsg.ok ? C.successBg : C.dangerBg, borderBottom: `1px solid ${C.border}`, fontSize: 13, color: bulkMsg.ok ? C.success : C.danger, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {bulkMsg.ok ? "✓" : "✕"} {bulkMsg.text}
          <button onClick={() => setBulkMsg(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "inherit", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      <SummaryBar brands={brands} lastRunAll={lastRunAll} activeFilter={filterStatus} onFilter={setFilterStatus} />

      {/* 類別篩選欄 */}
      <div style={{ display: "flex", gap: 6, padding: "8px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>類別：</span>
        <button
          onClick={() => { setFilterIndustry(null); }}
          style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: filterIndustry === null ? 700 : 400, border: `1px solid ${filterIndustry === null ? C.primary : C.border}`, background: filterIndustry === null ? C.p50 : "transparent", color: filterIndustry === null ? C.primary : C.muted, cursor: "pointer" }}
        >
          全部（{brands.length}）
        </button>
        {INDUSTRIES.map((ind) => {
          const cnt = brands.filter((b) => b.industry === ind).length;
          if (cnt === 0) return null;
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

      {/* 工商 / 管道 / 縣市篩選欄 */}
      {(() => {
        const availableCities = [...new Set(brands.flatMap((b) => b.cities))].sort((a, z) => a.localeCompare(z, "zh-TW"));
        const availableChannels = CHANNEL_ORDER.filter((ch) => brands.some((b) => b.channels.includes(ch)));
        const hasAnyExtra = filterGov !== null || filterChannel !== null || filterCity !== null;
        return (
          <div style={{ display: "flex", gap: 6, padding: "7px 20px", background: C.surf2, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
            {/* 工商登記 */}
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>工商：</span>
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setFilterGov(filterGov === v ? null : v)}
                style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterGov === v ? 700 : 400, border: `1px solid ${filterGov === v ? "#7B6E99" : C.border}`, background: filterGov === v ? "#EAE5F0" : "transparent", color: filterGov === v ? "#7B6E99" : C.muted, cursor: "pointer" }}
              >
                {v ? "有登記" : "缺登記"}
              </button>
            ))}

            {/* 管道 */}
            {availableChannels.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6, marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>管道：</span>
                {availableChannels.map((ch) => {
                  const cfg = CHANNELS[ch];
                  if (!cfg) return null;
                  return (
                    <button
                      key={ch}
                      onClick={() => setFilterChannel(filterChannel === ch ? null : ch)}
                      style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterChannel === ch ? 700 : 400, border: `1px solid ${filterChannel === ch ? cfg.bg : C.border}`, background: filterChannel === ch ? cfg.bg : "transparent", color: filterChannel === ch ? "white" : C.muted, cursor: "pointer" }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </>
            )}

            {/* 縣市 */}
            {availableCities.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.6, marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>縣市：</span>
                {availableCities.slice(0, 8).map((city) => (
                  <button
                    key={city}
                    onClick={() => setFilterCity(filterCity === city ? null : city)}
                    style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: filterCity === city ? 700 : 400, border: `1px solid ${filterCity === city ? C.accent : C.border}`, background: filterCity === city ? "#EDF4F0" : "transparent", color: filterCity === city ? C.accentDk : C.muted, cursor: "pointer" }}
                  >
                    {city}
                  </button>
                ))}
              </>
            )}

            {hasAnyExtra && (
              <button
                onClick={() => { setFilterGov(null); setFilterChannel(null); setFilterCity(null); }}
                style={{ marginLeft: "auto", fontSize: 11, color: C.muted, border: "none", background: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                清除
              </button>
            )}
          </div>
        );
      })()}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <BrandList
          brands={visibleBrands}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setTab("tasks");
          }}
          onRunAll={async () => {
            if (usingApi) {
              await runBulk("gov", filterIndustry);
              await runBulk("channels", filterIndustry);
            } else {
              visibleBrands.forEach((b) => Object.keys(b.tasks).forEach((k) => runTask(b.id, k)));
            }
            const now = new Date();
            setLastRunAll(`${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
          }}
        />
        {selected && <DetailPanel brand={selected} tab={tab} onTabChange={setTab} onRunTask={runTask} onAcceptConflict={resolveConflict} onGovUpdated={loadBrands} />}
      </div>

      {jobPanelOpen && <PlacesJobPanel onClose={() => setJobPanelOpen(false)} onDone={loadBrands} />}
      {websitePanelOpen && <WebsiteScraperPanel onClose={() => setWebsitePanelOpen(false)} onDone={loadBrands} />}
      {placesRefreshOpen && <PlacesRefreshPanel onClose={() => setPlacesRefreshOpen(false)} onDone={loadBrands} />}
    </>
  );
}
