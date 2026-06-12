"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Download } from "lucide-react";
import { exportToExcel, generateExcelFilename } from "@/lib/export";

interface Brand {
  id: string;
  name: string;
  industry?: string;
  store_count?: number;
  status: string;
  priority_score?: number;
}

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

export default function LeadsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [industryFilter, setIndustryFilter] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);

  // 載入資料
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) params.append("status", statusFilter);
        if (industryFilter) params.append("industry", industryFilter);
        if (searchTerm) params.append("search", searchTerm);

        const response = await fetch(`/api/brands?${params}`);
        const result = await response.json();

        if (result.success) {
          setBrands(result.data);
        }
      } catch (error) {
        console.error("載入品牌失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchBrands, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, statusFilter, industryFilter]);

  const filtered = useMemo(() => {
    return brands.filter((brand) => {
      const matchSearch = brand.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [brands, searchTerm]);

  const industries = [
    ...new Set(brands.map((b) => b.industry).filter(Boolean)),
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      exportToExcel({
        brands: filtered.map((b) => ({
          name: b.name,
          industry: b.industry,
          stores: b.store_count,
          status: b.status,
        })),
        filename: generateExcelFilename("leads"),
      });
    } catch (error) {
      console.error("匯出失敗:", error);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">名單總覽</h1>
          <p className="text-muted mt-2">載入中...</p>
        </div>
      </div>
    );
  }

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
                placeholder="品牌名稱"
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
              {(industries as string[]).map((ind) => (
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
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn-secondary disabled:opacity-50"
          >
            <Download size={18} />
            {isExporting ? "匯出中..." : "匯出 CSV"}
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
                <td className="py-4 px-4 text-muted">{brand.industry || "-"}</td>
                <td className="py-4 px-4 text-center">{brand.store_count || 1}</td>
                <td className="py-4 px-4 text-center font-medium">
                  {brand.priority_score || "-"}
                </td>
                <td className="py-4 px-4 text-center">
                  <span
                    className={`badge ${statusBadgeClass[brand.status as keyof typeof statusBadgeClass]}`}
                  >
                    {statusLabel[brand.status as keyof typeof statusLabel]}
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
                <p className="text-sm text-muted mt-1">{brand.industry || "未分類"}</p>
              </div>
              <span
                className={`badge ${statusBadgeClass[brand.status as keyof typeof statusBadgeClass]}`}
              >
                {statusLabel[brand.status as keyof typeof statusLabel]}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm text-muted">
              <span>{brand.store_count || 1} 分店</span>
              {brand.priority_score && (
                <span className="font-medium text-text">{brand.priority_score} 分</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 空狀態 */}
      {filtered.length === 0 && !loading && (
        <div className="card text-center py-12">
          <p className="text-muted">無符合條件的品牌</p>
        </div>
      )}
    </div>
  );
}
