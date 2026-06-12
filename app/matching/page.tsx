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

// ── 主頁面 ───────────────────────────────────────────
export default function MatchingPage() {
  const [brands, setBrands] = useState<ScrapeBrand[]>(INIT_BRANDS);
  const [selectedId, setSelectedId] = useState(1);
  const [tab, setTab] = useState("tasks");
  const [isMobile, setIsMobile] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 900);
    fn();
    window.addEventListener("resize", fn);
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
          onClick={exportCSV}
          className="pressable"
          style={{ marginLeft: "auto", padding: "7px 13px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
        >
          ↓ CSV
        </button>
      </div>
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
    </>
  );
}
