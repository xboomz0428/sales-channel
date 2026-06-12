"use client";

import { useState } from "react";
import { Plus, X, AlertCircle, Check } from "lucide-react";

interface ScrapeJob {
  id: string;
  keywords: string[];
  cities: string[];
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  resultCount?: number;
  createdAt: string;
}

interface MatchRecord {
  id: string;
  googleData: {
    name: string;
    address: string;
  };
  govData: {
    name: string;
    address: string;
  };
  confidence: "high" | "medium" | "low";
  status: "pending" | "confirmed" | "rejected";
}

const mockJobs: ScrapeJob[] = [
  {
    id: "job_1",
    keywords: ["養生館"],
    cities: ["台北市", "新北市", "台中市"],
    status: "completed",
    progress: 100,
    resultCount: 234,
    createdAt: "2026-06-10",
  },
  {
    id: "job_2",
    keywords: ["宮廟"],
    cities: ["全台"],
    status: "running",
    progress: 45,
    createdAt: "2026-06-12",
  },
];

const mockMatches: MatchRecord[] = [
  {
    id: "match_1",
    googleData: {
      name: "6星集足體養生會館",
      address: "台北市信義區123號",
    },
    govData: {
      name: "六星集企業有限公司",
      address: "台北市信義區123號",
    },
    confidence: "medium",
    status: "pending",
  },
  {
    id: "match_2",
    googleData: {
      name: "小林越式洗髮",
      address: "新北市456號",
    },
    govData: {
      name: "小林國際美容",
      address: "新北市456號",
    },
    confidence: "low",
    status: "pending",
  },
];

const CITIES = [
  "台北市", "新北市", "桃園市", "新竹市", "新竹縣",
  "苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣",
  "嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣",
  "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣",
  "連江縣"
];

export default function MatchingPage() {
  const [activeTab, setActiveTab] = useState<"scrape" | "match">("scrape");
  const [jobs] = useState(mockJobs);
  const [matches, setMatches] = useState(mockMatches);

  // 採集表單
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (k: string) => {
    setKeywords(keywords.filter((x) => x !== k));
  };

  const toggleCity = (city: string) => {
    setSelectedCities(
      selectedCities.includes(city)
        ? selectedCities.filter((c) => c !== city)
        : [...selectedCities, city]
    );
  };

  const estimatedRequests = (keywords.length || 0) * (selectedCities.length || 0);
  const estimatedCost = estimatedRequests * 0.032; // Google Places $32/1000 requests

  const handleConfirmMatch = (id: string) => {
    setMatches(matches.map((m) => (m.id === id ? { ...m, status: "confirmed" } : m)));
  };

  const handleRejectMatch = (id: string) => {
    setMatches(matches.map((m) => (m.id === id ? { ...m, status: "rejected" } : m)));
  };

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">資料中心</h1>
        <p className="text-muted mt-2">採集任務 & 名冊比對</p>
      </div>

      {/* 標籤頁 */}
      <div className="flex gap-2 border-b border-border">
        {[
          { id: "scrape", label: "採集任務" },
          { id: "match", label: "比對中心" },
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

      {/* 採集任務分頁 */}
      {activeTab === "scrape" && (
        <div className="space-y-6">
          {/* 任務設定卡 */}
          <div className="card">
            <h3 className="section-title mb-4">建立採集任務</h3>

            {/* 關鍵字輸入 */}
            <div className="mb-4">
              <label className="text-sm font-medium text-text block mb-2">
                關鍵字 ({keywords.length})
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addKeyword()}
                  placeholder="輸入關鍵字，按 Enter 新增"
                  className="input flex-1"
                />
                <button onClick={addKeyword} className="btn-primary px-4">
                  <Plus size={18} />
                </button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <div
                      key={k}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-primary text-white text-sm"
                    >
                      {k}
                      <button onClick={() => removeKeyword(k)}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 城市勾選 */}
            <div className="mb-4">
              <label className="text-sm font-medium text-text block mb-2">
                城市 ({selectedCities.length})
              </label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {CITIES.map((city) => (
                  <button
                    key={city}
                    onClick={() => toggleCity(city)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                      selectedCities.includes(city)
                        ? "bg-primary text-white"
                        : "bg-surface-2 text-text hover:bg-primary-50"
                    }`}
                  >
                    {city.slice(0, 4)}
                  </button>
                ))}
              </div>
            </div>

            {/* 預估費用 */}
            {(keywords.length > 0 || selectedCities.length > 0) && (
              <div className="p-4 bg-primary-50 rounded-lg space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">預估請求數</span>
                  <span className="font-medium text-primary">
                    {estimatedRequests.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">預估費用</span>
                  <span className="font-medium text-primary">
                    US${estimatedCost.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* 啟動按鈕 */}
            <button
              disabled={keywords.length === 0 || selectedCities.length === 0}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                keywords.length === 0 || selectedCities.length === 0
                  ? "bg-border text-muted cursor-not-allowed opacity-50"
                  : "btn-primary"
              }`}
            >
              🚀 啟動採集任務
            </button>
          </div>

          {/* 任務列表 */}
          <div className="card">
            <h3 className="section-title mb-4">採集任務歷史</h3>
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="p-4 bg-surface-2 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{job.keywords.join(", ")}</p>
                      <p className="text-xs text-muted mt-1">
                        {job.cities.join(" • ")}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-lg ${
                        job.status === "completed"
                          ? "bg-primary-50 text-primary"
                          : job.status === "running"
                          ? "bg-accent/20 text-accent"
                          : job.status === "failed"
                          ? "bg-danger/20 text-danger"
                          : "bg-border text-muted"
                      }`}
                    >
                      {job.status === "completed"
                        ? "已完成"
                        : job.status === "running"
                        ? "執行中"
                        : job.status === "failed"
                        ? "失敗"
                        : "待執行"}
                    </span>
                  </div>
                  {job.status === "running" && (
                    <div className="space-y-1">
                      <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted text-right">{job.progress}%</p>
                    </div>
                  )}
                  {job.resultCount && (
                    <p className="text-sm text-muted mt-2">
                      ✓ 回傳 {job.resultCount} 筆資料
                    </p>
                  )}
                  <p className="text-xs text-muted mt-2">{job.createdAt}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 比對中心分頁 */}
      {activeTab === "match" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            待比對: {matches.filter((m) => m.status === "pending").length} 筆
          </p>

          {matches.map((match) => {
            const isPending = match.status === "pending";

            return (
              <div key={match.id} className="card p-6">
                {/* 信心度指標 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      信心度:{" "}
                      {match.confidence === "high"
                        ? "高"
                        : match.confidence === "medium"
                        ? "中"
                        : "低"}
                    </span>
                    {match.confidence === "low" && (
                      <AlertCircle size={16} className="text-danger" />
                    )}
                  </div>
                  {match.status === "confirmed" && (
                    <span className="text-xs badge badge-won">✓ 已確認</span>
                  )}
                  {match.status === "rejected" && (
                    <span className="text-xs badge badge-lost">✗ 已拒絕</span>
                  )}
                </div>

                {/* 比對資料 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Google 資料 */}
                  <div className="p-3 bg-surface-2 rounded-lg">
                    <p className="text-xs font-medium text-muted mb-2">Google Places</p>
                    <p className="font-medium text-sm text-text">
                      {match.googleData.name}
                    </p>
                    <p className="text-xs text-muted mt-1">{match.googleData.address}</p>
                  </div>

                  {/* 政府名冊資料 */}
                  <div className="p-3 bg-primary-50 rounded-lg">
                    <p className="text-xs font-medium text-muted mb-2">政府名冊</p>
                    <p className="font-medium text-sm text-text">
                      {match.govData.name}
                    </p>
                    <p className="text-xs text-muted mt-1">{match.govData.address}</p>
                  </div>
                </div>

                {/* 操作按鈕 */}
                {isPending && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirmMatch(match.id)}
                      className="flex-1 btn-primary flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      確認配對
                    </button>
                    <button
                      onClick={() => handleRejectMatch(match.id)}
                      className="flex-1 btn-secondary flex items-center justify-center gap-2"
                    >
                      <X size={18} />
                      拒絕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
