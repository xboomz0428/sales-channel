"use client";

import { useState, useEffect } from "react";

const COUNTIES = [
  { name: "台北市", x: 95, y: 35 },
  { name: "新北市", x: 85, y: 50 },
  { name: "桃園市", x: 75, y: 65 },
  { name: "新竹市", x: 65, y: 75 },
  { name: "新竹縣", x: 55, y: 88 },
  { name: "苗栗縣", x: 50, y: 105 },
  { name: "台中市", x: 52, y: 115 },
  { name: "彰化縣", x: 42, y: 130 },
  { name: "南投縣", x: 70, y: 135 },
  { name: "雲林縣", x: 40, y: 150 },
  { name: "嘉義市", x: 42, y: 165 },
  { name: "嘉義縣", x: 50, y: 175 },
  { name: "台南市", x: 35, y: 188 },
  { name: "高雄市", x: 57, y: 210 },
  { name: "屏東縣", x: 75, y: 230 },
  { name: "宜蘭縣", x: 125, y: 55 },
  { name: "花蓮縣", x: 135, y: 140 },
  { name: "台東縣", x: 125, y: 200 },
];

interface DashboardData {
  stats: {
    total_leads: number;
    by_status: Record<string, number>;
    total_opportunities: number;
    total_value: number;
    win_rate: string;
  };
  funnel: Array<{ stage: string; count: number }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapMode, setMapMode] = useState<"leads" | "won">("leads");
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);

  // 載入資料
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard");
        const result = await response.json();

        if (result.success) {
          setData(result.data);
        }
      } catch (error) {
        console.error("載入儀表板資料失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">儀表板</h1>
        <p className="text-muted mt-2">載入中...</p>
      </div>
    );
  }

  const stats = data?.stats || {};
  const funnelData = data?.funnel || [];

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">儀表板</h1>
        <p className="text-muted mt-2">銷售通路開發進度概覽</p>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "總名單數", value: stats.total_leads || 0, trend: 12 },
          { label: "待跟進", value: stats.total_opportunities || 0, trend: 5 },
          { label: "成交金額", value: `NT$${(stats.total_value || 0 / 1000000).toFixed(2)}M`, trend: 32 },
          { label: "成交率", value: `${stats.win_rate || 0}%`, trend: 8 },
        ].map((stat, i) => (
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
            {/* 台灣主島輪廓 */}
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
                  r={2.5}
                  fill="#6B8F71"
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
                      {stats.total_leads || 0} 筆
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
              const percentage = (item.count / (funnelData[0]?.count || 1)) * 100;
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
                      backgroundColor: "#6B8F71",
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
              新→成交: {stats.win_rate || 0}%
            </p>
          </div>
        </div>
      </div>

      {/* 產業分布 */}
      <div className="card">
        <h3 className="section-title mb-4">產業分布</h3>
        <div className="space-y-3">
          {[
            { name: "養生館", count: Math.floor((stats.total_leads || 0) * 0.23) },
            { name: "長照", count: Math.floor((stats.total_leads || 0) * 0.16) },
            { name: "宮廟", count: Math.floor((stats.total_leads || 0) * 0.12) },
            { name: "禮儀", count: Math.floor((stats.total_leads || 0) * 0.11) },
            { name: "其他", count: Math.floor((stats.total_leads || 0) * 0.38) },
          ].map((item, i) => {
            const percentage = (item.count / (stats.total_leads || 1)) * 100;
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
    </div>
  );
}
