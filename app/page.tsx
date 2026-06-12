"use client";

import { BarChart3, Users, Building2, TrendingUp } from "lucide-react";
import Card from "@/components/Card";
import StatCard from "@/components/StatCard";

const stats = [
  {
    label: "總名單數",
    value: 1250,
    icon: Users,
    trend: 12,
  },
  {
    label: "連鎖品牌",
    value: 48,
    icon: Building2,
    trend: 5,
  },
  {
    label: "待跟進",
    value: 156,
    icon: BarChart3,
    trend: -8,
  },
  {
    label: "轉換率",
    value: "8.5%",
    icon: TrendingUp,
    trend: 2,
  },
];

export default function Dashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">儀表板</h1>
        <p className="text-gray-600 mt-1">銷售通路開發進度概覽</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="最近新增名單" description="過去7天的新增記錄">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between items-center py-3 border-b last:border-b-0">
                <div>
                  <p className="font-medium text-gray-900">範例商家 {i + 1}</p>
                  <p className="text-sm text-gray-500">地址信息</p>
                </div>
                <span className="text-sm font-medium text-blue-600">新增</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="待處理任務" description="需要跟進的事項">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b last:border-b-0">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">聯繫客戶 {i + 1}</p>
                  <p className="text-sm text-gray-500">預計時間：今天</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
