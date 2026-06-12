"use client";

import { useState } from "react";
import { Users, TrendingUp, Zap } from "lucide-react";

export default function Dashboard() {
  const [mapMode, setMapMode] = useState<"leads" | "won">("leads");

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

  const counties = [
    { name: "台北市", leads: 86 },
    { name: "新北市", leads: 74 },
    { name: "桃園市", leads: 41 },
    { name: "台中市", leads: 58 },
    { name: "高雄市", leads: 47 },
    { name: "台南市", leads: 33 },
    { name: "彰化縣", leads: 19 },
  ];

  const maxLeads = Math.max(...counties.map((c) => c.leads));

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

          <div className="bg-[color:var(--surface-2)] rounded-[12px] p-6 min-h-[300px] flex items-center justify-center">
            <div className="text-center text-muted">
              <p className="text-sm mb-4">台灣縣市地圖</p>
              <p className="text-xs">
                {mapMode === "leads"
                  ? "按縣市顯示名單分布"
                  : "按縣市顯示成交客戶"}
              </p>
            </div>
          </div>

          {/* County Legend */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {counties.slice(0, 4).map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    background: `rgba(107, 143, 113, ${c.leads / maxLeads})`,
                  }}
                />
                <span className="text-muted">
                  {c.name} ({c.leads})
                </span>
              </div>
            ))}
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
