"use client";

import { useState, useEffect, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { C, STAGE_CFG, downloadCSV } from "@/lib/design";
import MobileTabBar from "@/components/MobileTabBar";

// ── 常數 ─────────────────────────────────────────────
const STAGE_KEY_MAP: { stageKey: keyof typeof STAGE_CFG; label: string }[] = [
  { stageKey: "new",         label: "新名單" },
  { stageKey: "contacted",   label: "已聯繫" },
  { stageKey: "sampling",    label: "打樣中" },
  { stageKey: "quoting",     label: "報價中" },
  { stageKey: "negotiating", label: "議約中" },
  { stageKey: "won",         label: "成交"   },
];
const FUNNEL_COLORS = STAGE_KEY_MAP.map((s) => STAGE_CFG[s.stageKey].color);

const IND_PALETTE = [
  "#8FAAA4", "#5B7C99", "#D9B68C", "#9B8CC4", "#8A8678",
  "#A6824A", "#5E8880", "#A66A4F", "#B5CAC5", "#7B6E99",
];

const CITY_COORDS: Record<string, [number, number]> = {
  台北: [98, 36], 新北: [87, 50], 桃園: [78, 62], 新竹: [68, 76],
  苗栗: [58, 92], 台中: [55, 116], 彰化: [46, 133], 南投: [73, 136],
  雲林: [42, 153], 嘉義: [44, 168], 台南: [38, 190], 高雄: [60, 213],
  屏東: [80, 233], 宜蘭: [128, 56], 花蓮: [140, 142], 台東: [128, 202],
};

function normalizeCity(city: string) {
  return city.replace(/[市縣]$/, "").replace("臺", "台");
}

// ── 型別 ─────────────────────────────────────────────
interface PinData { brand: string; industry: string; city: string; }
interface NeglectedItem { brand: string; tier: string; days: number | null; }
interface PipelineItem { stage: string; stageKey: string; n: number; value: number; weighted: number; }
interface CompletenessItem { label: string; pct: number; count: number; total: number; color: string; }

interface DashData {
  stats: {
    total_leads: number;
    by_status: Record<string, number>;
    active: number;
    won_value: number;
    weighted_value: number;
    win_rate: string;
  };
  funnel: { stage: string; count: number }[];
  industries: { label: string; n: number }[];
  completeness: CompletenessItem[];
  missingLine: number;
  neglected: NeglectedItem[];
  pipeline: PipelineItem[];
  pins: PinData[];
}

// ── 台灣插旗地圖 ─────────────────────────────────────
function TaiwanMap({ pins }: { pins: PinData[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; brand: string; city: string; industry: string } | null>(null);

  // 建立產業→顏色映射
  const industries = [...new Set(pins.map((p) => p.industry))];
  const indColor = Object.fromEntries(industries.map((ind, i) => [ind, IND_PALETTE[i % IND_PALETTE.length]]));

  // 只保留有座標的 pins，城市名正規化
  const mappedPins = pins
    .map((p) => { const city = normalizeCity(p.city); return { ...p, city, coord: CITY_COORDS[city] }; })
    .filter((p) => p.coord);

  // 依座標分組
  type PinGroup = { x: number; y: number; city: string; pins: typeof mappedPins };
  const groups = Object.values(
    mappedPins.reduce((acc: Record<string, PinGroup>, p) => {
      const k = `${p.coord[0]},${p.coord[1]}`;
      if (!acc[k]) acc[k] = { x: p.coord[0], y: p.coord[1], city: p.city, pins: [] };
      acc[k].pins.push(p);
      return acc;
    }, {})
  );

  const COUNTIES: [number, number, string][] = [
    [98, 36, "台北"], [87, 50, "新北"], [78, 62, "桃園"], [68, 76, "新竹"],
    [58, 92, "苗栗"], [55, 116, "台中"], [46, 133, "彰化"], [73, 136, "南投"],
    [42, 153, "雲林"], [44, 168, "嘉義"], [38, 190, "台南"], [60, 213, "高雄"],
    [80, 233, "屏東"], [128, 56, "宜蘭"], [140, 142, "花蓮"], [128, 202, "台東"],
  ];

  // 城市統計（出現在 pins 的）
  const cityCount = mappedPins.reduce((acc: Record<string, number>, p) => {
    acc[p.city] = (acc[p.city] || 0) + 1;
    return acc;
  }, {});
  const topCities = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
      <svg viewBox="0 0 180 268" style={{ width: 180, height: 268, flexShrink: 0 }}>
        <path
          d="M 90,8 L 118,15 L 140,35 L 150,65 L 148,105 L 142,150 L 130,200 L 112,234 L 90,249 L 68,244 L 48,224 L 32,194 L 22,154 L 18,110 L 22,68 L 35,38 L 55,18 Z"
          fill="#F4F1EA" stroke="#D5D1C8" strokeWidth="1.5"
        />
        {COUNTIES.map(([x, y, name]) => (
          <g key={name}>
            <circle cx={x} cy={y} r={1.8} fill="#C8C5BC" opacity={0.55} />
            <text x={x + 3.5} y={y + 1} fontSize={5.5} fill="#B0ADA5" dominantBaseline="middle" fontFamily="sans-serif">{name}</text>
          </g>
        ))}
        {groups.map((g, gi) =>
          g.pins.map((p, pi) => {
            const color = indColor[p.industry] || "#aaa";
            const off = g.pins.length > 1 ? (pi - (g.pins.length - 1) / 2) * 8 : 0;
            return (
              <g key={`${gi}-${pi}`} style={{ cursor: "pointer" }}
                onMouseEnter={() => setTip({ x: g.x + off, y: g.y, brand: p.brand, city: g.city, industry: p.industry })}
                onMouseLeave={() => setTip(null)}>
                <circle cx={g.x + off} cy={g.y} r={6} fill={color} stroke="white" strokeWidth={1.5} opacity={0.92} />
                <text x={g.x + off} y={g.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={5} fill="white" fontWeight="700" fontFamily="sans-serif">
                  {p.industry[0]}
                </text>
              </g>
            );
          })
        )}
        {tip && (
          <g>
            <rect x={Math.min(tip.x + 8, 90)} y={tip.y - 16} width={76} height={26} rx={4} fill="white" stroke="#ECE8DF" strokeWidth={1} />
            <text x={Math.min(tip.x + 12, 94)} y={tip.y - 6} fontSize={6.5} fill="#3D4A3E" fontWeight="600" fontFamily="sans-serif">{tip.brand}</text>
            <text x={Math.min(tip.x + 12, 94)} y={tip.y + 5} fontSize={5.5} fill="#6E7A6D" fontFamily="sans-serif">{tip.city} · {tip.industry}</text>
          </g>
        )}
      </svg>

      <div style={{ flex: 1, minWidth: 160 }}>
        {pins.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted }}>尚無地區資料</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 10 }}>產業圖例</div>
            {industries.map((ind) => {
              const count = [...new Set(mappedPins.filter((p) => p.industry === ind).map((p) => p.brand))].length;
              return (
                <div key={ind} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: indColor[ind], flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 7, color: "white", fontWeight: 700 }}>{ind[0]}</span>
                  </div>
                  <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{ind}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{count} 家</span>
                </div>
              );
            })}
            {topCities.length > 0 && (
              <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: C.surf2 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>插旗縣市</div>
                {topCities.map(([city, cnt]) => (
                  <div key={city} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: C.text }}>{city}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{cnt} 個商機</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 卡片容器 ─────────────────────────────────────────
function DCard({ title, subtitle, children, style }: { title: string; subtitle?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 22px", boxShadow: "0 2px 10px rgba(58,92,87,.05)", ...style }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ── 漏斗圖 ───────────────────────────────────────────
function FunnelChart({ funnel }: { funnel: { stage: string; n: number; color: string }[] }) {
  const maxN = Math.max(funnel[0]?.n || 0, 1);
  const convRate = funnel.length ? Math.round(((funnel[funnel.length - 1]?.n || 0) / maxN) * 100) : 0;
  return (
    <div>
      {/* 每一階段都顯示名稱與數量；0 也看得到（避免 0 寬度看不見） */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {funnel.map((row, i) => {
          const pct = (row.n / maxN) * 100;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 52, flexShrink: 0, fontSize: 13, color: C.text, fontWeight: 600, textAlign: "right" }}>{row.stage}</div>
              <div style={{ flex: 1, height: 30, background: C.surf2, borderRadius: 8, overflow: "hidden", position: "relative" }}>
                <div style={{ height: "100%", width: `${row.n > 0 ? Math.max(pct, 5) : 0}%`, background: row.color, borderRadius: 8, opacity: 0.92, transition: "width 700ms cubic-bezier(.2,.8,.2,1)" }} />
                <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: pct > 88 ? "white" : C.text, fontVariantNumeric: "tabular-nums" }}>{row.n.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.p50, borderRadius: 10 }}>
        <span style={{ fontSize: 12, color: C.muted }}>名單→成交轉換率</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{convRate}%</span>
      </div>
    </div>
  );
}

// ── 橫向長條圖 ───────────────────────────────────────
function BarChart({ data }: { data: { label: string; n: number }[] }) {
  const max = Math.max(...data.map((d) => d.n), 1);
  if (!data.length) return <div style={{ fontSize: 13, color: C.muted, padding: "16px 0" }}>尚無資料</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 68, flexShrink: 0, fontSize: 13, color: C.text, textAlign: "right" }}>{d.label}</div>
          <div style={{ flex: 1, height: 26, background: C.surf2, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(d.n / max) * 100}%`, background: C.primary, borderRadius: 6, transition: "width 800ms cubic-bezier(.2,.8,.2,1)", opacity: 0.85 }} />
          </div>
          <div style={{ width: 20, fontSize: 13, fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>{d.n}</div>
        </div>
      ))}
    </div>
  );
}

// ── 甜甜圈圖 ─────────────────────────────────────────
function DonutChart({ pct, color, label, count, total, size = 86 }: { pct: number; color: string; label: string; count?: number; total?: number; size?: number }) {
  const r = 32, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surf2} strokeWidth={8} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1000ms cubic-bezier(.2,.8,.2,1)" }} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight="700" fill={C.text} fontFamily="inherit" style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px` }}>{pct}%</text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: "center" }}>{label}</div>
      {count != null && total != null && (
        <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>{count} / {total}</div>
      )}
    </div>
  );
}

// ── 被冷落的 A 級客戶 ─────────────────────────────────
function NeglectedList({ neglected }: { neglected: NeglectedItem[] }) {
  if (!neglected.length) {
    return (
      <div style={{ textAlign: "center", padding: "24px", color: C.muted, fontSize: 13 }}>
        🌿 所有 A 級客戶皆有近期互動
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {neglected.map((n, i) => {
        const days = n.days ?? 999;
        const urgent = days > 60;
        const warn = days > 30;
        const color = urgent ? C.danger : warn ? C.accentDk : C.muted;
        const bg = urgent ? `${C.danger}12` : warn ? `${C.accent}20` : C.surf2;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderRadius: 12, background: bg, border: `1px solid ${urgent ? C.danger + "30" : warn ? C.accent + "30" : C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: urgent ? `${C.danger}25` : `${C.primary}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 14, color: urgent ? C.danger : C.primary, fontWeight: 700 }}>{n.brand[0]}</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{n.brand}</div>
                <span style={{ padding: "1px 7px", borderRadius: 999, background: "#FFF3CC", color: "#A6824A", fontSize: 10, fontWeight: 700 }}>{n.tier}級</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {n.days != null
                ? <><div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{n.days}天</div><div style={{ fontSize: 11, color: C.muted }}>無互動</div></>
                : <div style={{ fontSize: 12, color: C.muted }}>從未聯繫</div>
              }
            </div>
          </div>
        );
      })}
      <Link href="/followups" style={{ textAlign: "center", padding: "10px", borderRadius: 12, border: `1px dashed ${C.border}`, display: "block", fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: "none", marginTop: 2 }}>
        開始跟進 →
      </Link>
    </div>
  );
}

// ── 商機管線分佈 ─────────────────────────────────────
function PipelineBar({ pipeline }: { pipeline: PipelineItem[] }) {
  if (!pipeline.length) {
    return <div style={{ fontSize: 13, color: C.muted, padding: "16px 0" }}>尚無進行中的商機</div>;
  }
  const total = pipeline.reduce((s, d) => s + d.value, 0) || 1;
  const totalWeighted = pipeline.reduce((s, d) => s + d.weighted, 0);
  return (
    <div>
      <div style={{ display: "flex", height: 36, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        {pipeline.filter((d) => d.value > 0).map((d) => (
          <div key={d.stageKey} title={`${d.stage}: NT$${(d.value / 10000).toFixed(0)}萬`} style={{ flex: d.value / total, background: STAGE_CFG[d.stageKey as keyof typeof STAGE_CFG]?.color || C.primary, minWidth: 4, transition: "flex 800ms" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {pipeline.filter((d) => d.value > 0).map((d) => (
          <div key={d.stageKey} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: STAGE_CFG[d.stageKey as keyof typeof STAGE_CFG]?.color || C.primary, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.muted }}>{d.stage}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>NT${(d.value / 10000).toFixed(0)}萬</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: "10px 14px", background: C.p50, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.muted }}>加權商機合計</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>NT${(totalWeighted / 10000).toFixed(0)}萬</span>
      </div>
    </div>
  );
}

// ── 統計列 ───────────────────────────────────────────
function StatStrip({ stats }: { stats: { label: string; value: string; sub: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ background: C.surface, borderRadius: 13, border: `1px solid ${C.border}`, padding: "14px 16px", boxShadow: "0 1px 4px rgba(58,92,87,.04)" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

function MobileStatStrip({ stats }: { stats: { label: string; v: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      {stats.map((s, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 10, background: C.surf2 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{s.v}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── 儀表板頁面 ───────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = (fresh = false) => {
    if (fresh) setRefreshing(true);
    fetch(`/api/dashboard${fresh ? "?fresh=1" : ""}`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data); })
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  };
  useEffect(() => { load(false); }, []);

  const funnel = data?.funnel?.length
    ? data.funnel.map((f, i) => ({ stage: f.stage, n: f.count, color: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }))
    : [];

  const totalLeads = data?.stats?.total_leads ?? 0;
  const active = data?.stats?.active ?? 0;
  const won = data?.stats?.by_status?.won ?? 0;
  const winRate = data?.stats?.win_rate ?? "0.0";
  const industries = data?.industries ?? [];

  const statsDesktop = [
    { label: "名單總數", value: loading ? "…" : String(totalLeads), sub: `${industries.length} 個產業` },
    { label: "開發中", value: loading ? "…" : String(active), sub: `${data?.pipeline?.reduce((s, p) => s + p.n, 0) ?? 0} 筆商機` },
    { label: "已成交", value: loading ? "…" : String(won), sub: `勝率 ${winRate}%` },
    { label: "加權商機", value: loading ? "…" : `NT$${((data?.stats?.weighted_value ?? 0) / 10000).toFixed(0)}萬`, sub: "按機率加權" },
  ];
  const statsMobile = [
    { label: "名單", v: loading ? "…" : String(totalLeads) },
    { label: "開發中", v: loading ? "…" : String(active) },
    { label: "成交", v: loading ? "…" : String(won) },
    { label: "加權", v: loading ? "…" : `${((data?.stats?.weighted_value ?? 0) / 10000).toFixed(0)}萬` },
  ];

  const exportCSV = () => {
    const rows: (string | number)[][] = [
      ...(funnel ?? []).map((f) => [`漏斗_${f.stage}`, f.n]),
      ...(data?.pipeline ?? []).map((p) => [`管線_${p.stage}(NT$)`, p.value]),
      ...(industries ?? []).map((d) => [`產業_${d.label}`, d.n]),
    ];
    downloadCSV("HeroHerb_儀表板.csv", ["指標", "數值"], rows);
  };

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const missingLine = data?.missingLine ?? 0;

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div className="m-only" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.sidebar, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: 11, fontWeight: 800 }}>W</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>通路開發</span>
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }} className="d-only">儀表板</h1>
        <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }} className="d-only">截至 {dateStr}</span>
        <button onClick={() => load(true)} disabled={refreshing} className="pressable" title="重新計算最新數據"
          style={{ marginLeft: "auto", padding: "7px 13px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 600, cursor: refreshing ? "default" : "pointer" }}>
          {refreshing ? "更新中…" : "🔄 重新整理"}
        </button>
        <button onClick={exportCSV} className="d-only pressable" style={{ padding: "7px 13px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          ↓ CSV
        </button>
      </div>

      <div className="m-only">
        <MobileStatStrip stats={statsMobile} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, paddingBottom: 80 }}>
        <div className="d-only">
          <StatStrip stats={statsDesktop} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
          <DCard title="開發漏斗" subtitle="各階段名單數量">
            {loading
              ? <div style={{ fontSize: 13, color: C.muted }}>載入中…</div>
              : <FunnelChart funnel={funnel} />
            }
          </DCard>

          <DCard title="各產業名單分佈" subtitle={`共 ${totalLeads} 筆品牌`}>
            {loading
              ? <div style={{ fontSize: 13, color: C.muted }}>載入中…</div>
              : <BarChart data={industries} />
            }
          </DCard>

          <DCard title="資料完整度" subtitle="自動採集覆蓋率">
            {loading
              ? <div style={{ fontSize: 13, color: C.muted }}>載入中…</div>
              : <>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-around", gap: 12, marginBottom: 16 }}>
                    {(data?.completeness ?? []).map((d, i) => (
                      <DonutChart key={i} pct={d.pct} color={d.color} label={d.label} count={d.count} total={d.total} />
                    ))}
                  </div>
                  <div style={{ padding: "10px 14px", background: C.surf2, borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>提升建議</div>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                      {missingLine > 0
                        ? `${missingLine} 筆品牌缺少 LINE 帳號，可透過採集任務補齊`
                        : "所有品牌 LINE 帳號均已完整 🎉"
                      }
                    </div>
                  </div>
                </>
            }
          </DCard>

          <DCard title="最近被冷落的 A 級客戶" subtitle="按最後互動天數排序">
            {loading
              ? <div style={{ fontSize: 13, color: C.muted }}>載入中…</div>
              : <NeglectedList neglected={data?.neglected ?? []} />
            }
          </DCard>
        </div>

        <div style={{ marginTop: 16 }}>
          <DCard title="商機管線分佈" subtitle="各開發階段預估金額">
            {loading
              ? <div style={{ fontSize: 13, color: C.muted }}>載入中…</div>
              : <PipelineBar pipeline={data?.pipeline ?? []} />
            }
          </DCard>
        </div>

        <div style={{ marginTop: 16 }}>
          <DCard title="地區插旗地圖" subtitle="目前代工服務覆蓋縣市 × 名單類型">
            {loading
              ? <div style={{ fontSize: 13, color: C.muted }}>載入中…</div>
              : <TaiwanMap pins={data?.pins ?? []} />
            }
          </DCard>
        </div>
      </div>

      <MobileTabBar />
    </>
  );
}
