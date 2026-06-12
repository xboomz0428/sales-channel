"use client";

import { useState } from "react";
import { Heart, AlertCircle, Gift } from "lucide-react";

interface Customer {
  id: number;
  brand: string;
  tier: "A" | "B" | "C";
  lastContact: number;
  reorderDays?: number;
  health: "green" | "yellow" | "red";
}

const mockCustomers: Customer[] = [
  {
    id: 1,
    brand: "青松健康",
    tier: "A",
    lastContact: 3,
    reorderDays: 6,
    health: "green",
  },
  {
    id: 2,
    brand: "6星集",
    tier: "A",
    lastContact: 41,
    reorderDays: undefined,
    health: "red",
  },
  {
    id: 3,
    brand: "滋和堂",
    tier: "B",
    lastContact: 18,
    reorderDays: 22,
    health: "yellow",
  },
];

const TIERS = {
  A: { color: "bg-[#F5EDDD]", text: "text-[#A6824A]", label: "A級" },
  B: { color: "bg-[#E6EFE6]", text: "text-[#5E7F64]", label: "B級" },
  C: { color: "bg-[#ECE8DF]", text: "text-[#6E7A6D]", label: "C級" },
};

const HEALTH_COLORS = {
  green: "text-[color:var(--primary)]",
  yellow: "text-[color:var(--accent)]",
  red: "text-[color:var(--danger)]",
};

export default function CarePage() {
  const [customers] = useState(mockCustomers);
  const [activeTab, setActiveTab] = useState<"all" | "neglected" | "festival">(
    "all"
  );

  const filtered = customers.filter((c) => {
    if (activeTab === "neglected") return c.health === "red" || c.health === "yellow";
    if (activeTab === "festival") return true;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">客情維護</h1>
        <p className="text-muted mt-2">成交客戶關係管理</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: "all", label: "全部客戶" },
          { id: "neglected", label: "被冷落客戶" },
          { id: "festival", label: "三節送禮" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-[10px] transition-all ${
              activeTab === tab.id
                ? "bg-[color:var(--primary)] text-white"
                : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "健康", value: customers.filter((c) => c.health === "green").length },
          { label: "警告", value: customers.filter((c) => c.health === "yellow").length },
          { label: "風險", value: customers.filter((c) => c.health === "red").length },
        ].map((stat, i) => (
          <div key={i} className="card text-center py-4">
            <p className="text-2xl font-medium text-[color:var(--primary)]">
              {stat.value}
            </p>
            <p className="text-xs text-muted mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Customer List - Desktop */}
      <div className="d-only">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)]">
                <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">
                  品牌
                </th>
                <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">
                  分級
                </th>
                <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">
                  最後聯繫
                </th>
                <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">
                  回購倒數
                </th>
                <th className="px-4 py-4 text-center font-medium text-[color:var(--text)]">
                  健康度
                </th>
                <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[color:var(--border)] hover:bg-[color:var(--primary-50)]"
                >
                  <td className="px-4 py-4 font-medium">{c.brand}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-block px-2 py-1 rounded-[8px] text-xs font-medium ${
                        TIERS[c.tier].color + " " + TIERS[c.tier].text
                      }`}
                    >
                      {TIERS[c.tier].label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-muted">{c.lastContact} 天前</td>
                  <td className="px-4 py-4">
                    {c.reorderDays ? (
                      <span className="text-[color:var(--primary)]">
                        {c.reorderDays} 天
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Heart
                      size={18}
                      className={`mx-auto ${HEALTH_COLORS[c.health]}`}
                      fill="currentColor"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <button className="text-xs text-[color:var(--primary)] hover:underline">
                      編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Cards - Mobile */}
      <div className="m-only space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-[color:var(--text)]">{c.brand}</p>
                <p className="text-xs text-muted mt-1">最後聯繫: {c.lastContact} 天前</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Heart
                  size={20}
                  className={HEALTH_COLORS[c.health]}
                  fill="currentColor"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <span
                className={`px-2 py-1 rounded-[8px] text-xs font-medium ${
                  TIERS[c.tier].color + " " + TIERS[c.tier].text
                }`}
              >
                {TIERS[c.tier].label}
              </span>
              {c.reorderDays && (
                <span className="px-2 py-1 rounded-[8px] text-xs font-medium bg-[color:var(--status-quoting-bg)] text-[color:var(--status-quoting-text)]">
                  {c.reorderDays} 天回購
                </span>
              )}
            </div>
            <button className="w-full py-2 rounded-[10px] bg-[color:var(--primary-50)] text-[color:var(--primary)] font-medium text-sm">
              編輯客戶資料
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
