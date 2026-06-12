"use client";

import { useState } from "react";
import { Search, Plus, Download } from "lucide-react";

interface Brand {
  id: number;
  name: string;
  industry: string;
  stores: number;
  cities: string;
  channels: string[];
  score: number;
  status: "new" | "contacted" | "sampling" | "quoting" | "negotiating" | "won" | "lost";
}

const mockBrands: Brand[] = [
  {
    id: 1,
    name: "6星集足體養生會館",
    industry: "養生會館",
    stores: 9,
    cities: "北/中/南",
    channels: ["line", "fb", "ig", "email"],
    score: 92,
    status: "quoting",
  },
  {
    id: 2,
    name: "悅禾莊園SPA",
    industry: "養生會館",
    stores: 12,
    cities: "北/中/南",
    channels: ["line", "fb", "ig"],
    score: 89,
    status: "sampling",
  },
  {
    id: 3,
    name: "小林越式洗髮",
    industry: "越式洗髮",
    stores: 5,
    cities: "新北",
    channels: ["fb"],
    score: 61,
    status: "contacted",
  },
  {
    id: 4,
    name: "大甲鎮瀾宮",
    industry: "宮廟",
    stores: 1,
    cities: "台中",
    channels: ["fb", "line"],
    score: 95,
    status: "new",
  },
  {
    id: 5,
    name: "青松健康(長照)",
    industry: "長照",
    stores: 23,
    cities: "中部",
    channels: ["email", "fb"],
    score: 88,
    status: "won",
  },
  {
    id: 6,
    name: "龍巖人本",
    industry: "禮儀",
    stores: 40,
    cities: "全台",
    channels: ["email"],
    score: 85,
    status: "lost",
  },
];

const statusMap = {
  new: "status-new",
  contacted: "status-contacted",
  sampling: "status-sampling",
  quoting: "status-quoting",
  negotiating: "status-negotiating",
  won: "status-won",
  lost: "status-lost",
};

const statusLabel = {
  new: "新名單",
  contacted: "已聯繫",
  sampling: "打樣中",
  quoting: "報價中",
  negotiating: "議約中",
  won: "成交",
  lost: "流失",
};

const channelEmoji = {
  email: "📧",
  line: "💬",
  fb: "📘",
  ig: "📷",
};

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterIndustry, setFilterIndustry] = useState<string | null>(null);

  const filtered = mockBrands.filter((b) => {
    const matchSearch =
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.industry.includes(searchTerm);
    const matchStatus = !filterStatus || b.status === filterStatus;
    const matchIndustry = !filterIndustry || b.industry === filterIndustry;
    return matchSearch && matchStatus && matchIndustry;
  });

  const industries = [...new Set(mockBrands.map((b) => b.industry))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">名單總覽</h1>
          <p className="text-muted mt-2">共 {mockBrands.length} 筆名單</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary flex items-center gap-2">
            <Download size={18} />
            匯出 Excel
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            新增品牌
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="搜尋品牌名稱或產業..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <label className="text-sm text-muted">產業</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterIndustry(null)}
                className={`px-3 py-1 rounded-full text-sm transition-all ${
                  !filterIndustry
                    ? "bg-[color:var(--primary)] text-white"
                    : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
                }`}
              >
                全部
              </button>
              {industries.map((ind) => (
                <button
                  key={ind}
                  onClick={() => setFilterIndustry(ind)}
                  className={`px-3 py-1 rounded-full text-sm transition-all ${
                    filterIndustry === ind
                      ? "bg-[color:var(--primary)] text-white"
                      : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)]">
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">品牌名稱</th>
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">產業</th>
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">分店</th>
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">城市</th>
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">聯繫方式</th>
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">優先度</th>
              <th className="px-4 py-4 text-left font-medium text-[color:var(--text)]">狀態</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((brand) => (
              <tr
                key={brand.id}
                className="border-b border-[color:var(--border)] hover:bg-[color:var(--primary-50)] transition-colors cursor-pointer"
                onClick={() => console.log("Click brand:", brand.id)}
              >
                <td className="px-4 py-4 font-medium text-[color:var(--text)]">{brand.name}</td>
                <td className="px-4 py-4 text-muted">{brand.industry}</td>
                <td className="px-4 py-4 text-muted">{brand.stores}</td>
                <td className="px-4 py-4 text-muted">{brand.cities}</td>
                <td className="px-4 py-4">
                  <div className="flex gap-1">
                    {brand.channels.map((ch) => (
                      <span key={ch} title={ch}>
                        {channelEmoji[ch as keyof typeof channelEmoji] || "•"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="w-12 h-2 bg-[color:var(--surface-2)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--accent)]"
                      style={{ width: `${brand.score}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`status-badge ${statusMap[brand.status]}`}>
                    {statusLabel[brand.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card View */}
      <div className="m-only space-y-3">
        {filtered.map((brand) => (
          <div
            key={brand.id}
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => console.log("Click brand:", brand.id)}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="font-medium text-[color:var(--text)]">{brand.name}</h3>
                <p className="text-sm text-muted">{brand.industry}</p>
              </div>
              <span className={`status-badge ${statusMap[brand.status]}`}>
                {statusLabel[brand.status]}
              </span>
            </div>
            <div className="flex gap-4 text-sm text-muted mb-3">
              <span>分店: {brand.stores}</span>
              <span>城市: {brand.cities}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {brand.channels.map((ch) => (
                  <span key={ch}>{channelEmoji[ch as keyof typeof channelEmoji]}</span>
                ))}
              </div>
              <div className="w-24 h-2 bg-[color:var(--surface-2)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[color:var(--accent)]"
                  style={{ width: `${brand.score}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
