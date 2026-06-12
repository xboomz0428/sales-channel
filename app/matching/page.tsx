"use client";

import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import Card from "@/components/Card";

interface MatchingResult {
  id: number;
  companyName: string;
  googleMatch: "成功" | "部分" | "未找到";
  registrationMatch: "已找到" | "部分信息" | "未找到";
  dataCompleteness: number;
  status: "已核對" | "待核對" | "有誤";
}

const mockResults: MatchingResult[] = [
  {
    id: 1,
    companyName: "範例商家一號",
    googleMatch: "成功",
    registrationMatch: "已找到",
    dataCompleteness: 95,
    status: "已核對",
  },
  {
    id: 2,
    companyName: "範例商家二號",
    googleMatch: "部分",
    registrationMatch: "部分信息",
    dataCompleteness: 65,
    status: "待核對",
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
