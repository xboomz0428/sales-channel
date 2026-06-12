"use client";

import { Calendar, DollarSign, Users } from "lucide-react";
import Card from "@/components/Card";

interface Opportunity {
  id: number;
  brandName: string;
  storeCount: number;
  potentialValue: string;
  expectedCloseDate: string;
  probability: number;
  nextAction: string;
}

const mockOpportunities: Opportunity[] = [
  {
    id: 1,
    brandName: "連鎖咖啡館",
    storeCount: 25,
    potentialValue: "NT$500,000",
    expectedCloseDate: "2024-08-15",
    probability: 75,
    nextAction: "等待總部回覆",
  },
  {
    id: 2,
    brandName: "美妝美容集團",
    storeCount: 18,
    potentialValue: "NT$300,000",
    expectedCloseDate: "2024-07-30",
    probability: 60,
    nextAction: "安排現場訪問",
  },
  {
    id: 3,
    brandName: "飯店連鎖",
    storeCount: 12,
    potentialValue: "NT$450,000",
    expectedCloseDate: "2024-09-01",
    probability: 40,
    nextAction: "提交企劃書",
  },
];

export default function OpportunitiesPage() {
  const totalPotential = mockOpportunities.reduce((sum, opp) => {
    const value = parseInt(opp.potentialValue.replace(/[^0-9]/g, ""));
    return sum + value;
  }, 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">商機看板</h1>
        <p className="text-gray-600 mt-1">業務開發管道管理</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card title="商機總額">
          <div className="flex items-center gap-4">
            <DollarSign className="w-12 h-12 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">
                NT${(totalPotential / 1000000).toFixed(1)}M
              </p>
              <p className="text-sm text-gray-600">{mockOpportunities.length} 個商機</p>
            </div>
          </div>
        </Card>

        <Card title="平均成交機率">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="8"
                  strokeDasharray={`${45 * 2 * Math.PI * 0.6} ${45 * 2 * Math.PI}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold">60%</span>
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">58.3%</p>
              <p className="text-sm text-gray-600">平均轉化率</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {mockOpportunities.map((opp) => (
          <Card key={opp.id} title={opp.brandName}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">分店數</p>
                <p className="font-medium text-gray-900">{opp.storeCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">潛在金額</p>
                <p className="font-medium text-gray-900">{opp.potentialValue}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">預期結案</p>
                <p className="font-medium text-gray-900">{opp.expectedCloseDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">成功機率</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${opp.probability}%` }}
                    />
                  </div>
                  <span className="font-medium text-gray-900 text-sm">
                    {opp.probability}%
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-2">下一步</p>
              <p className="font-medium text-gray-900">{opp.nextAction}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
