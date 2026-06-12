"use client";

import { useState } from "react";
import { Users, TrendingUp, AlertCircle } from "lucide-react";

const COUNTIES = [
  { name: "台北市", x: 95, y: 35, leads: 86 },
  { name: "新北市", x: 85, y: 50, leads: 74 },
  { name: "桃園市", x: 75, y: 65, leads: 41 },
  { name: "新竹市", x: 65, y: 75, leads: 28 },
  { name: "新竹縣", x: 55, y: 88, leads: 32 },
  { name: "苗栗縣", x: 50, y: 105, leads: 19 },
  { name: "台中市", x: 52, y: 115, leads: 58 },
  { name: "彰化縣", x: 42, y: 130, leads: 31 },
  { name: "南投縣", x: 70, y: 135, leads: 15 },
  { name: "雲林縣", x: 40, y: 150, leads: 18 },
  { name: "嘉義市", x: 42, y: 165, leads: 12 },
  { name: "嘉義縣", x: 50, y: 175, leads: 8 },
  { name: "台南市", x: 35, y: 188, leads: 33 },
  { name: "高雄市", x: 57, y: 210, leads: 47 },
  { name: "屏東縣", x: 75, y: 230, leads: 19 },
  { name: "宜蘭縣", x: 125, y: 55, leads: 12 },
  { name: "花蓮縣", x: 135, y: 140, leads: 8 },
  { name: "台東縣", x: 125, y: 200, leads: 5 },
];

const funnelData = [
  { stage: "新名單", count: 1250, color: "#6B8F71" },
  { stage: "已聯繫", count: 890, color: "#A8BCA1" },
  { stage: "打樣中", count: 450, color: "#D9B68C" },
  { stage: "報價中", count: 280, color: "#C98A6B" },
  { stage: "議約中", count: 120, color: "#5B7C99" },
  { stage: "成交", color: "#4A6B50", count: 45 },
];

const industryData = [
  { name: "養生館", count: 286 },
  { name: "長照", count: 198 },
  { name: "宮廟", count: 156 },
  { name: "禮儀", count: 142 },
  { name: "其他", count: 482 },
];

const neglectedCustomers = [
  { name: "6星集", days: 91 },
  { name: "清心SPA", days: 48 },
  { name: "悅禾莊園SPA", days: 32 },
];

export default function Dashboard() {
  const [mapMode, setMapMode] = useState<"leads" | "won">("leads");
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);

  const stats = [
    { label: "總名單數", value: 1250, trend: 12 },
    { label: "連鎖品牌", value: 48, trend: 5 },
    { label: "待跟進", value: 156, trend: -8 },
    { label: "成交金額", value: "NT$2.4M", trend: 32 },
  ];

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">儀表板</h1>
        <p className="text-muted mt-2">銷售通路開發進度概覽</p>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="card">
            <p className="text-sm text-muted mb-1">{stat.label}</p>
            <p className="text-2xl font-medium text-text">{stat.value}</p>
            <p className={`text-xs mt-2 ${stat.trend > 0 ? "text-primary" : "text-danger"}`}>
              {stat.trend > 0 ? "+" : ""}{stat.trend}%
            </p>
          </div>
        ))}
      </div>

      {/* 台灣地圖 + 漏斗圖 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 地圖 */}
        <div className="card">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMapMode("leads")}
              className={`px-3 py-1 text-sm rounded-lg transition-all ${
                mapMode === "leads"
                  ? "bg-primary text-white"
                  : "bg-surface-2 text-text"
              }`}
            >
              名單分布
            </button>
            <button
              onClick={() => setMapMode("won")}
              className={`px-3 py-1 text-sm rounded-lg transition-all ${
                mapMode === "won"
                  ? "bg-primary text-white"
                  : "bg-surface-2 text-text"
              }`}
            >
              代工成交
            </button>
          </div>

          <svg viewBox="0 0 180 268" className="w-full h-auto" style={{ minHeight: 300 }}>
            {/* 台灣主島輪廓（簡化） */}
            <path
              d="M 90,10 L 120,15 L 140,35 L 150,65 L 148,105 L 142,150 L 130,200 L 112,234 L 90,249 L 68,244 L 48,224 L 32,194 L 22,154 L 18,110 L 22,68 L 35,38 L 55,18 Z"
              fill="var(--surface-2)"
              stroke="var(--border)"
              strokeWidth="1.5"
            />

            {/* 縣市點 */}
            {COUNTIES.map((county) => (
              <g
                key={county.name}
                onMouseEnter={() => setHoveredCounty(county.name)}
                onMouseLeave={() => setHoveredCounty(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={county.x}
                  cy={county.y}
                  r={mapMode === "leads" ? Math.sqrt(county.leads) / 2 : 2.5}
                  fill={mapMode === "leads" ? "#6B8F71" : "#8FA3B0"}
                  opacity={0.7}
                />
                <text
                  x={county.x + 5}
                  y={county.y}
                  fontSize="10"
                  fill="var(--text-muted)"
                  fontFamily="Noto Sans TC"
                >
                  {county.name.slice(0, 2)}
                </text>

                {/* Hover 提示 */}
                {hoveredCounty === county.name && (
                  <g>
                    <rect x={county.x - 25} y={county.y - 25} width="60" height="30" rx="4" fill="white" stroke="var(--border)" />
                    <text x={county.x - 20} y={county.y - 10} fontSize="12" fontWeight="600" fill="var(--text)">
                      {county.name}
                    </text>
                    <text x={county.x - 20} y={county.y + 5} fontSize="10" fill="var(--text-muted)">
                      {county.leads} 筆
                    </text>
                  </g>
                )}
              </g>
            ))}
          </svg>
        </div>

        {/* 漏斗圖 */}
        <div className="card">
          <h3 className="section-title mb-4">開發進度漏斗</h3>
          <div className="space-y-4">
            {funnelData.map((item, i) => {
              const percentage = (item.count / funnelData[0].count) * 100;
              return (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-text">{item.stage}</span>
                    <span className="text-xs text-muted">{item.count}</span>
                  </div>
                  <div
                    className="h-8 rounded-lg overflow-hidden bg-surface-2"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: item.color,
                      transition: "width 300ms",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-border text-sm">
            <p className="text-muted">轉換率</p>
            <p className="font-medium text-text mt-1">
              新→成交: {((45 / 1250) * 100).toFixed(1)}% (45/1250)
            </p>
          </div>
        </div>
      </div>

      {/* 產業分布 + 被冷落客戶 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 產業分布 */}
        <div className="card">
          <h3 className="section-title mb-4">產業分布</h3>
          <div className="space-y-3">
            {industryData.map((item, i) => {
              const percentage = (item.count / industryData.reduce((sum, x) => sum + x.count, 0)) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text">{item.name}</p>
                    <div className="h-2 bg-surface-2 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-muted">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 被冷落的 A 級客戶 */}
        <div className="card">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-danger" />
            被冷落的 A 級客戶
          </h3>
          <div className="space-y-2">
            {neglectedCustomers.map((customer, i) => (
              <div key={i} className="p-3 bg-[var(--status-lost-bg)] rounded-lg">
                <p className="font-medium text-sm text-[var(--status-lost-text)]">
                  {customer.name}
                </p>
                <p className="text-xs text-[var(--status-lost-text)] mt-1">
                  {customer.days} 天未聯繫
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
