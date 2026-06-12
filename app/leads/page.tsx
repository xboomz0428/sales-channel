"use client";

import { useState, useMemo } from "react";
import { Search, Download, Filter } from "lucide-react";

interface Brand {
  id: number;
  name: string;
  industry: string;
  stores: number;
  cities: string;
  channels: string[];
  score: number;
  status: "new" | "contacted" | "sampling" | "quoting" | "negotiating" | "won" | "lost";
  tax_id?: string;
  owner?: string;
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
    tax_id: "16830000",
    owner: "江○○",
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

const statusBadgeClass = {
  new: "badge-new",
  contacted: "badge-contacted",
  sampling: "badge-sampling",
  quoting: "badge-quoting",
  negotiating: "badge-negotiating",
  won: "badge-won",
  lost: "badge-lost",
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

const channelIcon = {
  email: "📧",
  line: "💬",
  fb: "📘",
  ig: "📷",
};

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [industryFilter, setIndustryFilter] = useState<string>("");

  const filtered = useMemo(() => {
    return mockBrands.filter((brand) => {
      const matchSearch =
        brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        brand.industry.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = !statusFilter || brand.status === statusFilter;
      const matchIndustry = !industryFilter || brand.industry === industryFilter;
      return matchSearch && matchStatus && matchIndustry;
    });
  }, [searchTerm, statusFilter, industryFilter]);

  const industries = [...new Set(mockBrands.map((b) => b.industry))];

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">名單總覽</h1>
        <p className="text-muted mt-2">共 {filtered.length} 筆名單</p>
      </div>

      {/* 桌機版：篩選欄 */}
      <div className="d-only card">
        <div className="flex gap-4 items-end flex-wrap">
          {/* 搜尋 */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm text-muted block mb-2">搜尋品牌</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-muted" size={20} />
              <input
                type="text"
                placeholder="品牌名稱或產業"
                className="input pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* 產業篩選 */}
          <div className="min-w-[150px]">
            <label className="text-sm text-muted block mb-2">產業</label>
            <select
              className="input"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            >
              <option value="">全部產業</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          {/* 狀態篩選 */}
          <div className="min-w-[150px]">
            <label className="text-sm text-muted block mb-2">狀態</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">全部狀態</option>
              {Object.entries(statusLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* 匯出按鈕 */}
          <button className="btn-secondary">
            <Download size={18} />
            匯出 Excel
          </button>
        </div>
      </div>

      {/* 桌機版：表格 */}
      <div className="d-only card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)]">
              <th className="text-left py-4 px-4 font-medium text-muted">品牌名稱</th>
              <th className="text-left py-4 px-4 font-medium text-muted">產業</th>
              <th className="text-center py-4 px-4 font-medium text-muted">分店數</th>
              <th className="text-left py-4 px-4 font-medium text-muted">城市</th>
              <th className="text-center py-4 px-4 font-medium text-muted">聯繫管道</th>
              <th className="text-center py-4 px-4 font-medium text-muted">優先分數</th>
              <th className="text-center py-4 px-4 font-medium text-muted">狀態</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((brand) => (
              <tr
                key={brand.id}
                className="border-b border-[color:var(--border)] hover:bg-[color:var(--primary-50)] cursor-pointer transition-colors"
              >
                <td className="py-4 px-4 font-medium">{brand.name}</td>
                <td className="py-4 px-4 text-muted">{brand.industry}</td>
                <td className="py-4 px-4 text-center">{brand.stores}</td>
                <td className="py-4 px-4 text-muted">{brand.cities}</td>
                <td className="py-4 px-4 text-center">
                  <div className="flex gap-2 justify-center">
                    {brand.channels.map((ch) => (
                      <span key={ch} title={ch}>
                        {channelIcon[ch as keyof typeof channelIcon]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-4 px-4 text-center font-medium">{brand.score}</td>
                <td className="py-4 px-4 text-center">
                  <span className={`badge ${statusBadgeClass[brand.status]}`}>
                    {statusLabel[brand.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 手機版：卡片 */}
      <div className="m-only space-y-3">
        {filtered.map((brand) => (
          <div key={brand.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-medium text-text">{brand.name}</h3>
                <p className="text-sm text-muted mt-1">{brand.industry}</p>
              </div>
              <span className={`badge ${statusBadgeClass[brand.status]}`}>
                {statusLabel[brand.status]}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm text-muted mb-3">
              <span>{brand.stores} 分店</span>
              <span>{brand.cities}</span>
              <span className="font-medium text-text">{brand.score} 分</span>
            </div>

            <div className="flex gap-2">
              {brand.channels.map((ch) => (
                <span key={ch} className="text-xl">
                  {channelIcon[ch as keyof typeof channelIcon]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
