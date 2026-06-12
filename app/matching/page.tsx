"use client";

import { useState } from "react";
import { Check, X, AlertCircle } from "lucide-react";

interface MatchRecord {
  id: number;
  googleName: string;
  registeredName: string;
  googleData: Record<string, any>;
  registeredData: Record<string, any>;
  confidence: number;
}

const mockMatches: MatchRecord[] = [
  {
    id: 1,
    googleName: "6星集足體養生會館",
    registeredName: "六星集足體",
    googleData: {
      phone: "02-2234-5678",
      address: "台北市信義區",
      website: "www.6stars.com",
    },
    registeredData: {
      phone: "02-2234-5678",
      address: "台北市信義區123號",
      website: "www.6stars.com",
    },
    confidence: 92,
  },
];

export default function MatchingPage() {
  const [currentTab, setCurrentTab] = useState<"collect" | "match">("collect");
  const [matches] = useState(mockMatches);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">資料中心</h1>
        <p className="text-muted mt-2">採集任務 & 名冊比對</p>
      </div>

      {/* Tabs - 所有設備都可見 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: "collect", label: "採集任務" },
          { id: "match", label: "比對中心" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id as any)}
            className={`px-4 py-2 rounded-[10px] transition-all text-sm md:text-base ${
              currentTab === tab.id
                ? "bg-[color:var(--primary)] text-white"
                : "bg-[color:var(--surface-2)] text-[color:var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab === "collect" && (
        <CollectSection />
      )}

      {currentTab === "match" && (
        <MatchSection matches={matches} />
      )}
    </div>
  );
}

function CollectSection() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const cities = [
    "台北市", "新北市", "桃園市", "新竹市", "新竹縣",
    "苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣",
    "嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣",
    "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣",
    "連江縣"
  ];

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
  const estimatedCost = estimatedRequests * 0.5; // 每個請求 NT$0.5

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "待採集", value: 45, icon: "⏳" },
          { label: "採集中", value: 12, icon: "⚡" },
          { label: "已完成", value: 234, icon: "✓" },
        ].map((s, i) => (
          <div key={i} className="card py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-medium text-[color:var(--primary)]">
                  {s.value}
                </p>
                <p className="text-xs text-muted mt-1">{s.label}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Task Config */}
      <div className="card space-y-4">
        <h3 className="section-title">建立採集任務</h3>

        {/* Keywords */}
        <div>
          <label className="text-sm font-medium text-[color:var(--text)] block mb-2">
            關鍵字 Tag ({keywords.length})
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addKeyword()}
              placeholder="輸入關鍵字後按 Enter"
              className="input flex-1"
            />
            <button onClick={addKeyword} className="btn-primary px-4">
              加入
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <div
                  key={k}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-[8px] bg-[color:var(--primary)] text-white text-sm"
                >
                  {k}
                  <button
                    onClick={() => removeKeyword(k)}
                    className="hover:opacity-70 transition-all"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cities */}
        <div>
          <label className="text-sm font-medium text-[color:var(--text)] block mb-2">
            城市 ({selectedCities.length})
          </label>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => toggleCity(city)}
                className={`px-3 py-2 rounded-[8px] text-sm transition-all ${
                  selectedCities.includes(city)
                    ? "bg-[color:var(--primary)] text-white"
                    : "bg-[color:var(--surface-2)] text-[color:var(--text)] hover:bg-[color:var(--primary-50)]"
                }`}
              >
                {city.slice(0, 4)}
              </button>
            ))}
          </div>
        </div>

        {/* Estimate */}
        {(keywords.length > 0 || selectedCities.length > 0) && (
          <div className="p-4 bg-[color:var(--primary-50)] rounded-[10px] space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">預估請求數</span>
              <span className="font-medium text-[color:var(--primary)]">
                {estimatedRequests.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">預估費用</span>
              <span className="font-medium text-[color:var(--primary)]">
                NT${estimatedCost.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        <button
          disabled={keywords.length === 0 || selectedCities.length === 0}
          className={`w-full py-2 rounded-[10px] font-medium transition-all ${
            keywords.length === 0 || selectedCities.length === 0
              ? "bg-[color:var(--border)] text-muted cursor-not-allowed opacity-50"
              : "btn-primary"
          }`}
        >
          🚀 啟動採集任務
        </button>
      </div>

      {/* Task List */}
      <div className="card">
        <h3 className="section-title mb-4">進行中的任務</h3>
        <div className="space-y-3">
          {[
            { keyword: "養生館", cities: ["台北", "台中"], progress: 75, status: "採集中" },
            { keyword: "長照", cities: ["台中", "高雄"], progress: 45, status: "採集中" },
          ].map((task, i) => (
            <div key={i} className="p-4 bg-[color:var(--surface-2)] rounded-[10px] space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-[color:var(--text)]">{task.keyword}</p>
                  <p className="text-xs text-muted mt-1">
                    {task.cities.join(" • ")}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-[6px] bg-[color:var(--primary)] text-white">
                  {task.status}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted">
                  <span>進度</span>
                  <span>{task.progress}%</span>
                </div>
                <div className="h-2 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--primary)]"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button className="flex-1 py-1 text-xs rounded-[6px] bg-white text-[color:var(--primary)] hover:opacity-80 transition-all">
                  暫停
                </button>
                <button className="flex-1 py-1 text-xs rounded-[6px] bg-[color:var(--danger)] bg-opacity-10 text-[color:var(--danger)] hover:opacity-80 transition-all">
                  取消
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchSection({ matches }: { matches: MatchRecord[] }) {
  const [confirmed, setConfirmed] = useState<number[]>([]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="card">
        <p className="text-sm text-muted mb-1">待比對數量</p>
        <p className="text-3xl font-medium text-[color:var(--primary)]">
          {matches.length}
        </p>
      </div>

      {/* Match Queue */}
      <div className="space-y-4">
        {matches.map((match) => (
          <div
            key={match.id}
            className="card p-6 space-y-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">信心度: {match.confidence}%</span>
                {match.confidence > 80 && (
                  <Check size={16} className="text-[color:var(--primary)]" />
                )}
                {match.confidence < 60 && (
                  <AlertCircle
                    size={16}
                    className="text-[color:var(--danger)]"
                  />
                )}
              </div>
            </div>

            {/* Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-[color:var(--surface-2)] rounded-[10px]">
                <p className="text-xs font-medium text-muted mb-2">Google Places</p>
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-[color:var(--text)]">
                    {match.googleName}
                  </p>
                  {Object.entries(match.googleData).map(([k, v]) => (
                    <p key={k} className="text-muted">
                      <span className="text-xs">{k}:</span> {v}
                    </p>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-[color:var(--status-new-bg)] rounded-[10px]">
                <p className="text-xs font-medium text-muted mb-2">政府名冊</p>
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-[color:var(--text)]">
                    {match.registeredName}
                  </p>
                  {Object.entries(match.registeredData).map(([k, v]) => (
                    <p key={k} className="text-muted">
                      <span className="text-xs">{k}:</span> {v}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            {!confirmed.includes(match.id) && (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmed([...confirmed, match.id])}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  確認配對
                </button>
                <button className="flex-1 btn-secondary flex items-center justify-center gap-2">
                  <X size={18} />
                  拒絕
                </button>
              </div>
            )}
            {confirmed.includes(match.id) && (
              <div className="text-center py-2 bg-[color:var(--primary-50)] rounded-[10px]">
                <p className="text-sm font-medium text-[color:var(--primary)]">
                  ✓ 已確認
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
  },
  {
    id: 3,
    companyName: "範例商家三號",
    googleMatch: "成功",
    registrationMatch: "已找到",
    dataCompleteness: 85,
    status: "已核對",
  },
];

export default function MatchingPage() {
  const successCount = mockResults.filter((r) => r.status === "已核對").length;
  const pendingCount = mockResults.filter((r) => r.status === "待核對").length;
  const errorCount = mockResults.filter((r) => r.status === "有誤").length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">採集比對</h1>
        <p className="text-gray-600 mt-1">Google Places 與政府名冊比對結果</p>
      </div>

      <Card title="批量匯入">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-1">上傳名單檔案</p>
          <p className="text-sm text-gray-600 mb-4">
            支援 CSV、Excel 或 JSON 格式
          </p>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            選擇檔案
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
        <Card title="已核對">
          <div className="flex items-center gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <div>
              <p className="text-3xl font-bold text-gray-900">{successCount}</p>
              <p className="text-sm text-gray-600">筆資料</p>
            </div>
          </div>
        </Card>

        <Card title="待核對">
          <div className="flex items-center gap-4">
            <AlertCircle className="w-12 h-12 text-yellow-600" />
            <div>
              <p className="text-3xl font-bold text-gray-900">{pendingCount}</p>
              <p className="text-sm text-gray-600">筆資料</p>
            </div>
          </div>
        </Card>

        <Card title="有誤">
          <div className="flex items-center gap-4">
            <AlertCircle className="w-12 h-12 text-red-600" />
            <div>
              <p className="text-3xl font-bold text-gray-900">{errorCount}</p>
              <p className="text-sm text-gray-600">筆資料</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                商家名稱
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                Google 比對
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                登記資料比對
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                資料完整度
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                核對狀態
              </th>
            </tr>
          </thead>
          <tbody>
            {mockResults.map((result) => (
              <tr
                key={result.id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {result.companyName}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      result.googleMatch === "成功"
                        ? "bg-green-100 text-green-800"
                        : result.googleMatch === "部分"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {result.googleMatch}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      result.registrationMatch === "已找到"
                        ? "bg-green-100 text-green-800"
                        : result.registrationMatch === "部分信息"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {result.registrationMatch}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${result.dataCompleteness}%` }}
                      />
                    </div>
                    <span className="text-gray-900">
                      {result.dataCompleteness}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      result.status === "已核對"
                        ? "bg-green-100 text-green-800"
                        : result.status === "待核對"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {result.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
