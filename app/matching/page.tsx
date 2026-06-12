"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { C, downloadCSV } from "@/lib/design";

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

interface ScrapeTask {
  status: TaskStatusKey;
  last: string | null;
  result: Record<string, string | number> | null;
  error?: string;
}

interface Conflict {
  field: string;
  current: string;
  collected: string;
  source: string;
  accepted: boolean | null;
}

interface ScrapeBrand {
  id: number;
  name: string;
  score: number;
  stage: string;
  tasks: Record<string, ScrapeTask>;
  conflicts: Conflict[];
}

// ── 種子資料 ─────────────────────────────────────────
const INIT_BRANDS: ScrapeBrand[] = [
  {
    id: 1, name: "6星集足體養生會館", score: 92, stage: "quoting",
    tasks: {
      gov: { status: "done", last: "6/8", result: { tax_id: "16830000", owner: "江○○", est: "2017-03", addr: "台北市大安區忠孝東路四段…" } },
      line: { status: "done", last: "6/5", result: { account: "@sixstar_spa", followers: 12400, posts: 88 } },
      fb: { status: "done", last: "6/5", result: { page: "6星集足體養生", likes: 8900 } },
      ig: { status: "stale", last: "5/20", result: { handle: "@sixstar_spa_tw", followers: 3200 } },
      map: { status: "done", last: "6/8", result: { rating: 4.7, reviews: 312, branches: 9 } },
    },
    conflicts: [
      { field: "門市數", current: "7", collected: "9", source: "map", accepted: null },
      { field: "LINE粉絲數", current: "11,200", collected: "12,400", source: "line", accepted: null },
    ],
  },
  {
    id: 2, name: "悅禾莊園SPA", score: 78, stage: "sampling",
    tasks: {
      gov: { status: "done", last: "6/2", result: { tax_id: "23150000", owner: "陳○○", est: "2019-07", addr: "新北市板橋區…" } },
      line: { status: "queued", last: null, result: null },
      fb: { status: "done", last: "6/1", result: { page: "悅禾莊園", likes: 4200 } },
      ig: { status: "error", last: "6/1", result: null, error: "帳號私人，無法抓取" },
      map: { status: "running", last: null, result: null },
    },
    conflicts: [],
  },
  {
    id: 3, name: "小林越式洗髮", score: 61, stage: "contacted",
    tasks: {
      gov: { status: "done", last: "5/28", result: { tax_id: "48920000", owner: "林○○", est: "2021-01", addr: "台中市西區…" } },
      line: { status: "queued", last: null, result: null },
      fb: { status: "queued", last: null, result: null },
      ig: { status: "done", last: "5/28", result: { handle: "@holin_viet_hair", followers: 6800 } },
      map: { status: "stale", last: "5/10", result: { rating: 4.5, reviews: 89, branches: 3 } },
    },
    conflicts: [],
  },
  {
    id: 4, name: "大甲鎮瀾宮", score: 55, stage: "new",
    tasks: {
      gov: { status: "error", last: "6/7", result: null, error: "非公司登記，為財團法人" },
      line: { status: "done", last: "6/6", result: { account: "@dajia_mazu", followers: 51000 } },
      fb: { status: "done", last: "6/6", result: { page: "大甲鎮瀾宮", likes: 120000 } },
      ig: { status: "queued", last: null, result: null },
      map: { status: "done", last: "6/6", result: { rating: 4.9, reviews: 12400, branches: 1 } },
    },
    conflicts: [],
  },
  {
    id: 5, name: "春天養生館", score: 74, stage: "negotiating",
    tasks: {
      gov: { status: "done", last: "6/3", result: { tax_id: "29410000", owner: "黃○○", est: "2015-05", addr: "高雄市苓雅區…" } },
      line: { status: "done", last: "6/3", result: { account: "@spring_spa_ks", followers: 7800 } },
      fb: { status: "stale", last: "5/8", result: { page: "春天養生館", likes: 3100 } },
      ig: { status: "queued", last: null, result: null },
      map: { status: "done", last: "6/3", result: { rating: 4.6, reviews: 203, branches: 4 } },
    },
    conflicts: [
      { field: "FB 粉絲數", current: "3,100", collected: "3,100", source: "fb", accepted: null },
    ],
  },
];

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
  selectedId: number;
  onSelect: (id: number) => void;
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
                {typeof v === "number" ? v.toLocaleString() : v}
              </span>
            </div>
          ))}
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
}: {
  brand: ScrapeBrand;
  tab: string;
  onTabChange: (t: string) => void;
  onRunTask: (brandId: number, src: string) => void;
  onAcceptConflict: (brandId: number, idx: number, accepted: boolean) => void;
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
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{brand.name}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
            資料完整度 {pct}%
            {pending > 0 && (
              <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: C.dangerBg, color: C.danger, fontSize: 11, fontWeight: 700 }}>
                ⚠ {pending} 筆待確認
              </span>
            )}
          </div>
        </div>
        <Link
          href="/brands"
          style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.primary, fontSize: 13, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
        >
          開啟詳情 →
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {[
          { id: "tasks", label: "採集任務" },
          { id: "diff", label: `比對結果${pending > 0 ? " (" + pending + ")" : ""}` },
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
function SummaryBar({ brands }: { brands: ScrapeBrand[] }) {
  const all = brands.length;
  const done = brands.filter((b) => completeness(b.tasks) === 100).length;
  const allTasks = brands.flatMap((b) => Object.values(b.tasks));
  const running = allTasks.filter((t) => t.status === "running").length;
  const errors = allTasks.filter((t) => t.status === "error").length;
  const pending = brands.reduce((s, b) => s + b.conflicts.filter((c) => c.accepted === null).length, 0);

  const stats = [
    { label: "品牌", value: all, color: C.text },
    { label: "採集完整", value: done, color: C.success },
    { label: "採集中", value: running, color: C.primary, cls: "pulse" },
    { label: "失敗", value: errors, color: C.danger },
    { label: "待確認差異", value: pending, color: C.warning },
  ];

  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap" }}>
      {stats.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className={s.cls || ""} style={{ fontSize: 18, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
            {s.value}
          </span>
          <span style={{ fontSize: 12, color: C.muted }}>{s.label}</span>
          {i < stats.length - 1 && <span style={{ color: C.border, marginLeft: 6 }}>·</span>}
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#A3C9A3", display: "inline-block" }} />
        上次全採：6/8 14:23
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

function PlacesJobPanel({ onClose }: { onClose: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("台中市");
  const [maxPages, setMaxPages] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);

  const loadJobs = () => {
    fetch("/api/scrape/places")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setJobs(res.data);
      })
      .catch(() => {});
  };
  useEffect(loadJobs, []);

  const run = async () => {
    if (!keyword.trim() || running) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/scrape/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), city, maxPages }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setResultOk(true);
        setResult(
          `找到 ${d.found} 間店家 → 新增 ${d.new_brands} 個品牌、${d.new_stores} 間門市` +
            (d.linked_existing > 0 ? `、歸戶 ${d.linked_existing} 間到既有品牌` : "") +
            ` · 費用約 $${d.est_cost_usd} USD`
        );
      } else {
        setResultOk(false);
        setResult(`採集失敗：${json.error}`);
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
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setMaxPages(n)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 13, fontWeight: maxPages === n ? 700 : 400, border: `1px solid ${maxPages === n ? C.primary : C.border}`, background: maxPages === n ? C.p50 : "transparent", color: maxPages === n ? C.primary : C.muted, cursor: "pointer" }}
              >
                {n * 20} 筆<span style={{ fontSize: 11, opacity: 0.7 }}>（${(n * 0.032).toFixed(3)}）</span>
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

// ── 主頁面 ───────────────────────────────────────────
export default function MatchingPage() {
  const [brands, setBrands] = useState<ScrapeBrand[]>(INIT_BRANDS);
  const [selectedId, setSelectedId] = useState(1);
  const [tab, setTab] = useState("tasks");
  const [isMobile, setIsMobile] = useState(false);
  const [jobPanelOpen, setJobPanelOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 批次政府登記比對 / 管道補齊
  const runBulk = async (kind: "gov" | "channels") => {
    if (bulkRunning) return;
    setBulkRunning(kind);
    setBulkMsg(null);
    try {
      const url = kind === "gov" ? "/api/gov/lookup" : "/api/enrich/channels";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setBulkMsg({
          ok: true,
          text:
            kind === "gov"
              ? `工商登記比對完成：${d.total} 筆中 ${d.matched} 筆高信心回寫（統編/負責人/資本額），${d.low_confidence} 筆待人工確認`
              : `管道補齊完成：${d.total} 個品牌中 ${d.enriched} 個取得官網/電話/地圖/社群連結`,
        });
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

  // 模擬採集流程（1.8~3 秒完成，15% 失敗率）
  const runTask = (brandId: number, srcKey: string) => {
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

  const resolveConflict = (brandId: number, idx: number, accepted: boolean) => {
    setBrands((prev) =>
      prev.map((b) => (b.id !== brandId ? b : { ...b, conflicts: b.conflicts.map((c, i) => (i === idx ? { ...c, accepted } : c)) }))
    );
  };

  const selected = brands.find((b) => b.id === selectedId) || brands[0];

  if (isMobile) return <MobileBlock />;

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
          onClick={() => runBulk("gov")}
          disabled={!!bulkRunning}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #7B6E9960`, background: "#EAE5F0", color: "#7B6E99", fontSize: 13, fontWeight: 700, cursor: bulkRunning ? "default" : "pointer", flexShrink: 0 }}
        >
          {bulkRunning === "gov" ? <span className="spin">↻</span> : "🏛"} 工商登記比對
        </button>
        <button
          onClick={() => runBulk("channels")}
          disabled={!!bulkRunning}
          className="pressable"
          style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid #5B7C9960`, background: "#E3EDFB", color: "#5B7C99", fontSize: 13, fontWeight: 700, cursor: bulkRunning ? "default" : "pointer", flexShrink: 0 }}
        >
          {bulkRunning === "channels" ? <span className="spin">↻</span> : "🔗"} 管道補齊
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
      <SummaryBar brands={brands} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <BrandList
          brands={brands}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setTab("tasks");
          }}
          onRunAll={() => brands.forEach((b) => Object.keys(b.tasks).forEach((k) => runTask(b.id, k)))}
        />
        {selected && <DetailPanel brand={selected} tab={tab} onTabChange={setTab} onRunTask={runTask} onAcceptConflict={resolveConflict} />}
      </div>

      {jobPanelOpen && <PlacesJobPanel onClose={() => setJobPanelOpen(false)} />}
    </>
  );
}
