"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

interface CareCustomer {
  id: number;
  brand: string;
  tier: "A" | "B" | "C";
  lastContactDays: number;
  reorderInDays?: number;
  health: "green" | "yellow" | "red";
}

const mockCustomers: CareCustomer[] = [
  {
    id: 1,
    brand: "青松健康",
    tier: "A",
    lastContactDays: 3,
    reorderInDays: 6,
    health: "green",
  },
  {
    id: 2,
    brand: "6星集",
    tier: "A",
    lastContactDays: 41,
    reorderInDays: undefined,
    health: "red",
  },
  {
    id: 3,
    brand: "滋和堂",
    tier: "B",
    lastContactDays: 18,
    reorderInDays: 22,
    health: "yellow",
  },
];

const tierConfig = {
  A: { color: "bg-accent", text: "text-accent", label: "A級", desc: "月訂/連鎖總部" },
  B: { color: "bg-sage", text: "text-sage", label: "B級", desc: "穩定回購" },
  C: { color: "bg-surface-2", text: "text-muted", label: "C級", desc: "零星購買" },
};

const healthColors = {
  green: "text-primary",
  yellow: "text-accent",
  red: "text-danger",
};

export default function CarePage() {
  const [customers] = useState(mockCustomers);
  const [activeTab, setActiveTab] = useState<"all" | "neglected">("all");

  const filtered = customers.filter((c) => {
    if (activeTab === "neglected") return c.health === "red" || c.health === "yellow";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">客情維護</h1>
        <p className="text-muted mt-2">成交客戶關係管理</p>
      </div>

      {/* 標籤頁 */}
      <div className="flex gap-2 border-b border-border d-only">
        {[
          { id: "all", label: "全部客戶" },
          { id: "neglected", label: "被冷落客戶" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? "text-primary border-primary"
                : "text-muted border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "健康", value: customers.filter((c) => c.health === "green").length, color: "text-primary" },
          { label: "警告", value: customers.filter((c) => c.health === "yellow").length, color: "text-accent" },
          { label: "風險", value: customers.filter((c) => c.health === "red").length, color: "text-danger" },
        ].map((stat, i) => (
          <div key={i} className="card text-center py-4">
            <p className={`text-2xl font-medium ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 桌機版：表格 */}
      <div className="d-only card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-4 px-4 font-medium text-muted">品牌</th>
              <th className="text-center py-4 px-4 font-medium text-muted">分級</th>
              <th className="text-center py-4 px-4 font-medium text-muted">最後聯繫</th>
              <th className="text-center py-4 px-4 font-medium text-muted">回購倒數</th>
              <th className="text-center py-4 px-4 font-medium text-muted">健康度</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-border hover:bg-primary-50">
                <td className="py-4 px-4 font-medium">{c.brand}</td>
                <td className="py-4 px-4 text-center">
                  <span className={`badge ${tierConfig[c.tier].color} text-white`}>
                    {tierConfig[c.tier].label}
                  </span>
                </td>
                <td className="py-4 px-4 text-center text-muted">{c.lastContactDays} 天前</td>
                <td className="py-4 px-4 text-center">
                  {c.reorderInDays ? (
                    <span className="text-primary font-medium">{c.reorderInDays} 天</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-4 px-4 text-center">
                  <Heart size={18} className={`mx-auto ${healthColors[c.health]}`} fill="currentColor" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 手機版：卡片 */}
      <div className="m-only space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-medium text-text">{c.brand}</p>
                <p className="text-xs text-muted mt-1">最後聯繫: {c.lastContactDays} 天前</p>
              </div>
              <Heart size={20} className={`${healthColors[c.health]}`} fill="currentColor" />
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className={`badge ${tierConfig[c.tier].color} text-white`}>
                {tierConfig[c.tier].label}
              </span>
              {c.reorderInDays && (
                <span className="badge badge-quoting">
                  {c.reorderInDays} 天回購
                </span>
              )}
            </div>

            <button className="w-full py-2 mt-3 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90">
              編輯客戶資料
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
