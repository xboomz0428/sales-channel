"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

interface CareCustomer {
  id: string;
  brand_id: string;
  brands: { name: string };
  tier: "A" | "B" | "C";
  last_contact_days: number;
  reorder_cycle_days?: number;
  health: "green" | "yellow" | "red";
}

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
  const [customers, setCustomers] = useState<CareCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "neglected">("all");

  // 載入資料
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/care?tab=${activeTab}`);
        const result = await response.json();

        if (result.success) {
          setCustomers(result.data);
        }
      } catch (error) {
        console.error("載入客情資料失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [activeTab]);

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

      {loading ? (
        <div className="card text-center py-12">
          <p className="text-muted">載入中...</p>
        </div>
      ) : (
        <>
          {/* 桌機版：表格 */}
          <div className="d-only card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-medium text-muted">品牌</th>
                  <th className="text-center py-4 px-4 font-medium text-muted">分級</th>
                  <th className="text-center py-4 px-4 font-medium text-muted">最後聯繫</th>
                  <th className="text-center py-4 px-4 font-medium text-muted">健康度</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-border hover:bg-primary-50">
                    <td className="py-4 px-4 font-medium">{c.brands?.name}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`badge ${tierConfig[c.tier].color} text-white`}>
                        {tierConfig[c.tier].label}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center text-muted">{c.last_contact_days} 天前</td>
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
            {customers.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-text">{c.brands?.name}</p>
                    <p className="text-xs text-muted mt-1">最後聯繫: {c.last_contact_days} 天前</p>
                  </div>
                  <Heart size={20} className={`${healthColors[c.health]}`} fill="currentColor" />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <span className={`badge ${tierConfig[c.tier].color} text-white`}>
                    {tierConfig[c.tier].label}
                  </span>
                </div>

                <button className="w-full py-2 mt-3 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90">
                  編輯客戶資料
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
