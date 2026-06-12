"use client";

import { useState } from "react";
import { Users, TrendingUp, Zap, MapPin } from "lucide-react";

// 台灣地圖數據
const COUNTIES = [
  [98, 36, "台北"],
  [87, 50, "新北"],
  [78, 62, "桃園"],
  [68, 76, "新竹"],
  [58, 92, "苗栗"],
  [55, 116, "台中"],
  [46, 133, "彰化"],
  [73, 136, "南投"],
  [42, 153, "雲林"],
  [44, 168, "嘉義"],
  [38, 190, "台南"],
  [60, 213, "高雄"],
  [80, 233, "屏東"],
  [128, 56, "宜蘭"],
  [140, 142, "花蓮"],
  [128, 202, "台東"],
];

const INDUSTRY_COLORS = {
  "養生館": "#6B8F71",
  "越式洗髮": "#5B7C99",
  "宮廟": "#D9B68C",
  "長照": "#A8BCA1",
  "禮儀": "#8A8678",
  "寵物": "#C98A6B",
  "旅宿": "#8FA3B0",
};

const PINS = [
  { brand: "6星集", industry: "養生館", city: "台北", x: 98, y: 36 },
  { brand: "6星集", industry: "養生館", city: "台中", x: 55, y: 116 },
  { brand: "6星集", industry: "養生館", city: "高雄", x: 60, y: 213 },
  { brand: "悅禾莊園", industry: "養生館", city: "台北", x: 98, y: 36 },
  { brand: "小林越式", industry: "越式洗髮", city: "新北", x: 87, y: 50 },
  { brand: "大甲鎮瀾宮", industry: "宮廟", city: "台中", x: 55, y: 116 },
  { brand: "青松健康", industry: "長照", city: "台中", x: 55, y: 116 },
  { brand: "龍巖人本", industry: "禮儀", city: "台北", x: 98, y: 36 },
  { brand: "龍巖人本", industry: "禮儀", city: "台中", x: 55, y: 116 },
  { brand: "龍巖人本", industry: "禮儀", city: "高雄", x: 60, y: 213 },
];

export default function Dashboard() {
  const [mapMode, setMapMode] = useState<"leads" | "won">("leads");
  const [hoveredPin, setHoveredPin] = useState<any>(null);

  const stats = [
    { label: "總名單數", value: 1250, icon: Users, trend: 12 },
    { label: "連鎖品牌", value: 48, icon: TrendingUp, trend: 5 },
    { label: "待跟進", value: 156, icon: Zap, trend: -8 },
    { label: "成交金額", value: "NT$2.4M", icon: TrendingUp, trend: 32 },
  ];

  const funnelData = [
    { stage: "新名單", count: 126, color: "bg-[#EEF3EE]" },
    { stage: "已聯繫", count: 89, color: "bg-[#E3ECF2]" },
    { stage: "打樣中", count: 45, color: "bg-[#EAE5F0]" },
    { stage: "報價中", count: 28, color: "bg-[#F5EDDD]" },
    { stage: "議約中", count: 12, color: "bg-[#E6EFE6]" },
    { stage: "成交", count: 6, color: "bg-[#DCE9DC]" },
  ];


  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">儀表板</h1>
        <p className="text-muted mt-2">銷售通路開發進度概覽</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted mb-1">{stat.label}</p>
                <p className="text-2xl font-medium text-[color:var(--text)]">
                  {stat.value}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  stat.trend > 0
                    ? "bg-[color:var(--primary-50)] text-[color:var(--primary)]"
                    : "bg-[color:var(--danger)] bg-opacity-10 text-[color:var(--danger)]"
                }`}
              >
                {stat.trend > 0 ? "+" : ""}{stat.trend}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Taiwan Map + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map */}
        <div className="card">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMapMode("leads")}
              className={`px-3 py-1 text-sm rounded-[8px] transition-all ${
                mapMode === "leads"
                  ? "bg-[color:var(--primary)] text-white"
                  : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
              }`}
            >
              名單分布
            </button>
            <button
              onClick={() => setMapMode("won")}
              className={`px-3 py-1 text-sm rounded-[8px] transition-all ${
                mapMode === "won"
                  ? "bg-[color:var(--primary)] text-white"
                  : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
              }`}
            >
              代工成交
            </button>
          </div>

          {/* Taiwan Map */}
          <div className="flex gap-4 flex-wrap lg:flex-nowrap mb-4">
            <svg
              viewBox="0 0 180 268"
              className="w-full lg:w-48 h-auto flex-shrink-0"
              style={{ minHeight: 240 }}
            >
              {/* 台灣主島 */}
              <path
                d="M 90,8 L 118,15 L 140,35 L 150,65 L 148,105 L 142,150 L 130,200 L 112,234 L 90,249 L 68,244 L 48,224 L 32,194 L 22,154 L 18,110 L 22,68 L 35,38 L 55,18 Z"
                fill="var(--surface-2)"
                stroke="var(--border)"
                strokeWidth="1.5"
              />
              {/* 縣市點 */}
              {COUNTIES.map(([x, y, name]) => (
                <g key={name}>
                  <circle cx={x} cy={y} r={1.5} fill="var(--text-muted)" opacity={0.5} />
                  <text
                    x={x + 3}
                    y={y}
                    fontSize={5}
                    fill="var(--text-muted)"
                    fontFamily="Noto Sans TC"
                    dominantBaseline="middle"
                  >
                    {name.slice(0, 2)}
                  </text>
                </g>
              ))}
              {/* Pin 標記 */}
              {mapMode === "won" &&
                PINS.map((pin, idx) => {
                  const color =
                    INDUSTRY_COLORS[pin.industry as keyof typeof INDUSTRY_COLORS] ||
                    "var(--primary)";
                  return (
                    <g
                      key={idx}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredPin(pin)}
                      onMouseLeave={() => setHoveredPin(null)}
                    >
                      <circle
                        cx={pin.x}
                        cy={pin.y}
                        r={5}
                        fill={color}
                        stroke="white"
                        strokeWidth={1.2}
                        opacity={0.9}
                      />
                      <text
                        x={pin.x}
                        y={pin.y + 0.5}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={3.5}
                        fill="white"
                        fontWeight="700"
                        fontFamily="Noto Sans TC"
                      >
                        {pin.industry[0]}
                      </text>
                    </g>
                  );
                })}
              {/* Hover Tooltip */}
              {hoveredPin && (
                <g>
                  <rect
                    x={Math.min(hoveredPin.x + 6, 100)}
                    y={hoveredPin.y - 14}
                    width={70}
                    height={24}
                    rx={3}
                    fill="white"
                    stroke="var(--border)"
                    strokeWidth={0.8}
                  />
                  <text
                    x={Math.min(hoveredPin.x + 10, 104)}
                    y={hoveredPin.y - 5}
                    fontSize={6}
                    fill="var(--text)"
                    fontWeight="600"
                    fontFamily="Noto Sans TC"
                  >
                    {hoveredPin.brand}
                  </text>
                  <text
                    x={Math.min(hoveredPin.x + 10, 104)}
                    y={hoveredPin.y + 4}
                    fontSize={5}
                    fill="var(--text-muted)"
                    fontFamily="Noto Sans TC"
                  >
                    {hoveredPin.city} · {hoveredPin.industry}
                  </text>
                </g>
              )}
            </svg>

            {/* 圖例 */}
            <div className="flex-1 min-w-[140px]">
              <p className="text-xs font-medium text-muted mb-3">
                {mapMode === "leads" ? "名單分布" : "產業分布"}
              </p>
              <div className="space-y-2">
                {mapMode === "won" &&
                  Object.entries(INDUSTRY_COLORS).map(([ind, color]) => {
                    const count = PINS.filter((p) => p.industry === ind).length;
                    return count > 0 ? (
                      <div key={ind} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="text-xs text-[color:var(--text)]">
                          {ind}
                        </span>
                        <span className="text-xs text-muted ml-auto">{count}</span>
                      </div>
                    ) : null;
                  })}
                {mapMode === "leads" && (
                  <p className="text-xs text-muted">總名單數: 1,250</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Funnel */}
        <div className="card">
          <h3 className="section-title mb-4">漏斗圖</h3>
          <div className="space-y-3">
            {funnelData.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-[color:var(--text)]">
                    {item.stage}
                  </span>
                  <span className="text-xs text-muted">{item.count}</span>
                </div>
                <div className="h-8 rounded-[8px] overflow-hidden bg-[color:var(--surface-2)]">
                  <div
                    className={item.color + " h-full transition-all"}
                    style={{ width: `${(item.count / funnelData[0].count) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--border)] text-sm">
            <p className="text-muted">轉換率</p>
            <p className="font-medium text-[color:var(--text)] mt-1">
              新→成交: 4.8% (6/126)
            </p>
          </div>
        </div>
      </div>

      {/* Industry + Completeness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Industry Chart */}
        <div className="card">
          <h3 className="section-title mb-4">產業分布</h3>
          <div className="space-y-3">
            {[
              { label: "養生館", count: 286 },
              { label: "長照", count: 198 },
              { label: "宮廟", count: 156 },
              { label: "禮儀", count: 142 },
              { label: "其他", count: 482 },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[color:var(--text)]">
                    {item.label}
                  </p>
                  <div className="h-2 bg-[color:var(--surface-2)] rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-[color:var(--primary)]"
                      style={{
                        width: `${(item.count / 1264) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-muted">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data Completeness */}
        <div className="card">
          <h3 className="section-title mb-4">資料完整度</h3>
          <div className="space-y-4">
            {[
              { label: "統編比對率", value: 83, color: "#6B8F71" },
              { label: "LINE 覆蓋率", value: 67, color: "#D9B68C" },
              { label: "Email 覆蓋率", value: 50, color: "#A8BCA1" },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-[color:var(--text)]">
                    {item.label}
                  </span>
                  <span className="text-sm font-medium" style={{ color: item.color }}>
                    {item.value}%
                  </span>
                </div>
                <div className="h-3 bg-[color:var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${item.value}%`, background: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Neglected Customers */}
      <div className="card">
        <h3 className="section-title mb-4">被冷落的 A 級客戶</h3>
        <div className="space-y-2">
          {[
            { name: "滋和堂中醫養生", days: 91 },
            { name: "清心SPA連鎖", days: 48 },
            { name: "悅禾莊園SPA", days: 32 },
          ].map((customer, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-[color:var(--status-lost-bg)] rounded-[10px]">
              <span className="font-medium text-[color:var(--status-lost-text)]">
                {customer.name}
              </span>
              <span className="text-sm text-[color:var(--status-lost-text)]">
                {customer.days} 天未聯繫
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// Auto-deploy test at Fri Jun 12 17:05:14     2026
