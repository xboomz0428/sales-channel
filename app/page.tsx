"use client";

import { useState, useEffect, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { C, downloadCSV } from "@/lib/design";
import MobileTabBar from "@/components/MobileTabBar";

// ── 圖表種子資料（API 無資料時顯示）─────────────────────
const FUNNEL_SEED = [
  { stage: "新名單", n: 6, color: "#B5CAC5" },
  { stage: "已聯繫", n: 5, color: "#9DBDB7" },
  { stage: "打樣中", n: 3, color: "#8FAAA4" },
  { stage: "報價中", n: 2, color: "#7A9893" },
  { stage: "議約中", n: 1, color: "#6A8882" },
  { stage: "成交", n: 1, color: "#4A6B50" },
];
const FUNNEL_COLORS = ["#B5CAC5", "#9DBDB7", "#8FAAA4", "#7A9893", "#6A8882", "#4A6B50"];

const INDUSTRY_SEED = [
  { label: "養生館", n: 2 },
  { label: "禮儀", n: 1 },
  { label: "長照", n: 1 },
  { label: "宮廟", n: 1 },
  { label: "越式洗髮", n: 1 },
];

const COMPLETENESS = [
  { label: "統編比對率", pct: 83, color: "#8FAAA4" },
  { label: "LINE 覆蓋率", pct: 67, color: "#D9B68C" },
  { label: "Email 覆蓋率", pct: 50, color: "#B5CAC5" },
];

const NEGLECTED = [
  { brand: "滋和堂中醫養生", tier: "A", days: 91, status: "won" },
  { brand: "清心SPA連鎖", tier: "A", days: 48, status: "won" },
  { brand: "青松健康(長照)", tier: "A", days: 6, status: "won" },
];

const PIPELINE_STAGES = [
  { stage: "新名單", n: 4, value: 0 },
  { stage: "已聯繫", n: 3, value: 600000 },
  { stage: "打樣中", n: 2, value: 2400000 },
  { stage: "報價中", n: 2, value: 1800000 },
  { stage: "議約中", n: 1, value: 720000 },
];

const IND_COLOR: Record<string, { c: string; d: string }> = {
  養生館: { c: "#8FAAA4", d: "#3A5C57" },
  越式洗髮: { c: "#5B7C99", d: "#3A5270" },
  宮廟: { c: "#D9B68C", d: "#9E7048" },
  長照: { c: "#9B8CC4", d: "#6B5C94" },
  禮儀: { c: "#8A8678", d: "#5A5650" },
};

const PINS = [
  { brand: "6星集", industry: "養生館", city: "台北", x: 98, y: 36 },
  { brand: "6星集", industry: "養生館", city: "台中", x: 55, y: 116 },
  { brand: "6星集", industry: "養生館", city: "高雄", x: 60, y: 213 },
  { brand: "悦禾莊園", industry: "養生館", city: "台北", x: 98, y: 36 },
  { brand: "小林越式", industry: "越式洗髮", city: "新北", x: 87, y: 50 },
  { brand: "大甲鎮瀾宮", industry: "宮廟", city: "台中", x: 55, y: 116 },
  { brand: "青松健康", industry: "長照", city: "台中", x: 55, y: 116 },
  { brand: "龍岩人本", industry: "禮儀", city: "台北", x: 98, y: 36 },
  { brand: "龍岩人本", industry: "禮儀", city: "台中", x: 55, y: 116 },
  { brand: "龍岩人本", industry: "禮儀", city: "高雄", x: 60, y: 213 },
  { brand: "春天養生", industry: "養生館", city: "高雄", x: 60, y: 213 },
];

type PinGroup = { x: number; y: number; city: string; pins: typeof PINS };
const PIN_GROUPS: PinGroup[] = Object.values(
  PINS.reduce((acc: Record<string, PinGroup>, p) => {
    const k = `${p.x},${p.y}`;
    if (!acc[k]) acc[k] = { x: p.x, y: p.y, city: p.city, pins: [] };
    acc[k].pins.push(p);
    return acc;
  }, {})
);

// ── 台灣插旗地圖 ─────────────────────────────────────
function TaiwanMap() {
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    brand: string;
    city: string;
    industry: string;
  } | null>(null);

  const COUNTIES: [number, number, string][] = [
    [98, 36, "台北"], [87, 50, "新北"], [78, 62, "桃園"], [68, 76, "新竹"],
    [58, 92, "苗栗"], [55, 116, "台中"], [46, 133, "彰化"], [73, 136, "南投"],
    [42, 153, "雲林"], [44, 168, "嘉義"], [38, 190, "台南"], [60, 213, "高雄"],
    [80, 233, "屏東"], [128, 56, "宜蘭"], [140, 142, "花蓮"], [128, 202, "台東"],
  ];

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
      <svg viewBox="0 0 180 268" style={{ width: 180, height: 268, flexShrink: 0 }}>
        <path
          d="M 90,8 L 118,15 L 140,35 L 150,65 L 148,105 L 142,150 L 130,200 L 112,234 L 90,249 L 68,244 L 48,224 L 32,194 L 22,154 L 18,110 L 22,68 L 35,38 L 55,18 Z"
          fill="#F4F1EA"
          stroke="#D5D1C8"
          strokeWidth="1.5"
        />
        {COUNTIES.map(([x, y, name]) => (
          <g key={name}>
            <circle cx={x} cy={y} r={1.8} fill="#C8C5BC" opacity={0.55} />
            <text x={x + 3.5} y={y + 1} fontSize={5.5} fill="#B0ADA5" dominantBaseline="middle" fontFamily="sans-serif">
              {name}
            </text>
          </g>
        ))}
        {PIN_GROUPS.map((g, gi) =>
          g.pins.map((p, pi) => {
            const cfg = IND_COLOR[p.industry] || { c: "#aaa" };
            const off = g.pins.length > 1 ? (pi - (g.pins.length - 1) / 2) * 8 : 0;
            return (
              <g
                key={`${gi}-${pi}`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() =>
                  setTip({ x: g.x + off, y: g.y, brand: p.brand, city: g.city, industry: p.industry })
                }
                onMouseLeave={() => setTip(null)}
              >
                <circle cx={g.x + off} cy={g.y} r={6} fill={cfg.c} stroke="white" strokeWidth={1.5} opacity={0.92} />
                <text
                  x={g.x + off}
                  y={g.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={5}
                  fill="white"
                  fontWeight="700"
                  fontFamily="sans-serif"
                >
                  {p.industry[0]}
                </text>
              </g>
            );
          })
        )}
        {tip && (
          <g>
            <rect x={Math.min(tip.x + 8, 90)} y={tip.y - 16} width={76} height={26} rx={4} fill="white" stroke="#ECE8DF" strokeWidth={1} />
            <text x={Math.min(tip.x + 12, 94)} y={tip.y - 6} fontSize={6.5} fill="#3D4A3E" fontWeight="600" fontFamily="sans-serif">
              {tip.brand}
            </text>
            <text x={Math.min(tip.x + 12, 94)} y={tip.y + 5} fontSize={5.5} fill="#6E7A6D" fontFamily="sans-serif">
              {tip.city} · {tip.industry}
            </text>
          </g>
        )}
      </svg>

      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 10 }}>產業圖例</div>
        {Object.entries(IND_COLOR).map(([ind, cfg]) => {
          const ubs = [...new Set(PINS.filter((p) => p.industry === ind).map((p) => p.brand))].length;
          if (!ubs) return null;
          return (
            <div key={ind} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: cfg.c,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 7, color: "white", fontWeight: 700 }}>{ind[0]}</span>
              </div>
              <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{ind}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{ubs} 家</span>
            </div>
          );
        })}
        <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: C.surf2 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>插旗縣市</div>
          {["台北/新北", "台中", "高雄"].map((city) => {
            const cnt = PINS.filter((p) =>
              ["台北", "新北"].includes(p.city) ? city === "台北/新北" : p.city === city
            ).length;
            return (
              <div key={city} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: C.text }}>{city}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{cnt} 個商機</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 卡片容器 ─────────────────────────────────────────
function DCard({
  title,
  subtitle,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        padding: "20px 22px",
        boxShadow: "0 2px 10px rgba(58,92,87,.05)",
        ...style,
      }}
    >
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
  const W = 280, barH = 30, gap = 6;
  const maxN = funnel[0]?.n || 1;
  const totalH = funnel.length * (barH + gap) - gap;
  const convRate = funnel.length ? Math.round(((funnel[funnel.length - 1]?.n || 0) / maxN) * 100) : 0;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${totalH}`} style={{ overflow: "visible" }}>
        {funnel.map((row, i) => {
          const barW = (row.n / maxN) * W;
          const x = (W - barW) / 2;
          const y = i * (barH + gap);
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={6} fill={row.color} opacity={0.9} />
              <text x={x + 8} y={y + barH / 2 + 1} dominantBaseline="middle" fontSize={11} fill="white" fontWeight="600" fontFamily="inherit">
                {row.stage}
              </text>
              <text x={W / 2} y={y + barH / 2 + 1} dominantBaseline="middle" textAnchor="middle" fontSize={13} fill="white" fontWeight="700" fontFamily="inherit">
                {row.n}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.p50, borderRadius: 10 }}>
        <span style={{ fontSize: 12, color: C.muted }}>名單→成交轉換率</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{convRate}%</span>
      </div>
    </div>
  );
}

// ── 橫向長條圖（產業分佈）─────────────────────────────
function BarChart({ data }: { data: { label: string; n: number }[] }) {
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 68, flexShrink: 0, fontSize: 13, color: C.text, textAlign: "right" }}>{d.label}</div>
          <div style={{ flex: 1, height: 26, background: C.surf2, borderRadius: 6, overflow: "hidden", position: "relative" }}>
            <div
              style={{
                height: "100%",
                width: `${(d.n / max) * 100}%`,
                background: C.primary,
                borderRadius: 6,
                transition: "width 800ms cubic-bezier(.2,.8,.2,1)",
                opacity: 0.85,
              }}
            />
          </div>
          <div style={{ width: 20, fontSize: 13, fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>{d.n}</div>
        </div>
      ))}
    </div>
  );
}

// ── 甜甜圈圖 ─────────────────────────────────────────
function DonutChart({ pct, color, label, size = 96 }: { pct: number; color: string; label: string; size?: number }) {
  const r = 36, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surf2} strokeWidth={10} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1000ms cubic-bezier(.2,.8,.2,1)" }}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={15}
          fontWeight="700"
          fill={C.text}
          fontFamily="inherit"
          style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px` }}
        >
          {pct}%
        </text>
      </svg>
      <div style={{ fontSize: 12, color: C.muted, textAlign: "center" }}>{label}</div>
    </div>
  );
}

// ── 被冷落的 A 級客戶 ─────────────────────────────────
function NeglectedList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {NEGLECTED.map((n, i) => {
        const urgent = n.days > 60;
        const warn = n.days > 30;
        const color = urgent ? C.danger : warn ? C.accentDk : C.muted;
        const bg = urgent ? `${C.danger}12` : warn ? `${C.accent}20` : C.surf2;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 14px",
              borderRadius: 12,
              background: bg,
              border: `1px solid ${urgent ? C.danger + "30" : warn ? C.accent + "30" : C.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: urgent ? `${C.danger}25` : `${C.primary}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 14, color: urgent ? C.danger : C.primary, fontWeight: 700 }}>{n.brand[0]}</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{n.brand}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 1 }}>
                  <span style={{ padding: "1px 7px", borderRadius: 999, background: "#FFF3CC", color: "#A6824A", fontSize: 10, fontWeight: 700 }}>
                    {n.tier}級
                  </span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{n.days}天</div>
              <div style={{ fontSize: 11, color: C.muted }}>無互動</div>
            </div>
          </div>
        );
      })}
      <Link
        href="/followups"
        style={{
          textAlign: "center",
          padding: "10px",
          borderRadius: 12,
          border: `1px dashed ${C.border}`,
          display: "block",
          fontSize: 13,
          color: C.primary,
          fontWeight: 600,
          textDecoration: "none",
          marginTop: 2,
        }}
      >
        開始跟進 →
      </Link>
    </div>
  );
}

// ── 商機管線分佈 ─────────────────────────────────────
function PipelineBar() {
  const total = PIPELINE_STAGES.reduce((s, d) => s + d.value, 0) || 1;
  const colors = ["#B5CAC5", "#9DBDB7", "#8FAAA4", "#7A9893", "#6A8882"];
  return (
    <div>
      <div style={{ display: "flex", height: 36, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        {PIPELINE_STAGES.filter((d) => d.value > 0).map((d, i) => (
          <div
            key={i}
            title={`${d.stage}: NT$${(d.value / 10000).toFixed(0)}萬`}
            style={{ flex: d.value / total, background: colors[i], minWidth: 4, transition: "flex 800ms" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {PIPELINE_STAGES.filter((d) => d.value > 0).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.muted }}>{d.stage}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              NT${(d.value / 10000).toFixed(0)}萬
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          background: C.p50,
          borderRadius: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, color: C.muted }}>加權商機合計</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>
          NT${(PIPELINE_STAGES.reduce((s, d) => s + d.value * 0.4, 0) / 10000).toFixed(0)}萬
        </span>
      </div>
    </div>
  );
}

// ── 統計列 ───────────────────────────────────────────
function StatStrip({ stats }: { stats: { label: string; value: string; sub: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            background: C.surface,
            borderRadius: 13,
            border: `1px solid ${C.border}`,
            padding: "14px 16px",
            boxShadow: "0 1px 4px rgba(58,92,87,.04)",
          }}
        >
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
interface DashboardData {
  stats: {
    total_leads: number;
    by_status: Record<string, number>;
    total_opportunities: number;
    total_value: number;
    win_rate: string;
  };
  funnel: { stage: string; count: number }[];
}

export default function Dashboard() {
  const [api, setApi] = useState<DashboardData | null>(null);
  const [industries, setIndustries] = useState(INDUSTRY_SEED);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((result) => {
        if (result.success && result.data?.stats?.total_leads > 0) setApi(result.data);
      })
      .catch(() => {});
    fetch("/api/brands")
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          const counts: Record<string, number> = {};
          for (const b of result.data) counts[b.industry || "其他"] = (counts[b.industry || "其他"] || 0) + 1;
          setIndustries(
            Object.entries(counts)
              .map(([label, n]) => ({ label, n }))
              .sort((a, b) => b.n - a.n)
          );
        }
      })
      .catch(() => {});
  }, []);

  // 漏斗資料：優先用 API，否則用種子
  const funnel = api?.funnel?.length
    ? api.funnel.map((f, i) => ({ stage: f.stage, n: f.count, color: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }))
    : FUNNEL_SEED;

  const totalLeads = api?.stats?.total_leads ?? 6;
  const won = api?.stats?.by_status?.won ?? 1;
  const active = api ? totalLeads - won - (api.stats.by_status?.lost ?? 0) : 5;

  const statsDesktop = [
    { label: "名單總數", value: String(totalLeads), sub: `已覆蓋產業 ${industries.length} 類` },
    { label: "開發中", value: String(active), sub: "本月新增 2" },
    { label: "已成交", value: String(won), sub: "NT$96萬/年" },
    { label: "今日待辦", value: "4", sub: "含 1 補貨提醒" },
  ];
  const statsMobile = [
    { label: "名單", v: String(totalLeads) },
    { label: "開發中", v: String(active) },
    { label: "成交", v: String(won) },
    { label: "待辦", v: "4" },
  ];

  const exportCSV = () => {
    const rows: (string | number)[][] = [
      ...funnel.map((f) => [`漏斗_${f.stage}`, f.n]),
      ...PIPELINE_STAGES.map((p) => [`管線_${p.stage}(NT$)`, p.value]),
      ...industries.map((d) => [`產業_${d.label}`, d.n]),
    ];
    downloadCSV("HeroHerb_儀表板.csv", ["指標", "數值"], rows);
  };

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  return (
    <>
      {/* Top bar */}
      <div
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: "11px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div className="m-only" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.sidebar, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: 11, fontWeight: 800 }}>W</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>通路開發</span>
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }} className="d-only">
          儀表板
        </h1>
        <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }} className="d-only">
          截至 {dateStr}
        </span>
        <button
          onClick={exportCSV}
          className="d-only pressable"
          style={{
            marginLeft: "auto",
            padding: "7px 13px",
            borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: C.muted,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
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

        {/* 2×2 圖表 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
          <DCard title="開發漏斗" subtitle="各階段名單數量">
            <FunnelChart funnel={funnel} />
          </DCard>

          <DCard title="各產業名單分佈" subtitle={`共 ${totalLeads} 筆品牌`}>
            <BarChart data={industries} />
          </DCard>

          <DCard title="資料完整度" subtitle="自動採集覆蓋率">
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 16 }}>
              {COMPLETENESS.map((d, i) => (
                <DonutChart key={i} pct={d.pct} color={d.color} label={d.label} />
              ))}
            </div>
            <div style={{ padding: "10px 14px", background: C.surf2, borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>提升建議</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>2 筆品牌缺少 LINE 帳號，可透過採集任務補齊</div>
            </div>
          </DCard>

          <DCard title="最近被冷落的 A 級客戶" subtitle="按最後互動天數排序">
            <NeglectedList />
          </DCard>
        </div>

        {/* 商機管線（滿版） */}
        <div style={{ marginTop: 16 }}>
          <DCard title="商機管線分佈" subtitle="各開發階段預估金額">
            <PipelineBar />
          </DCard>
        </div>

        {/* 台灣地圖 */}
        <div style={{ marginTop: 16 }}>
          <DCard title="地區插旗地圖" subtitle="目前代工服務覆蓋縣市 × 名單類型">
            <TaiwanMap />
          </DCard>
        </div>
      </div>

      <MobileTabBar />
    </>
  );
}
