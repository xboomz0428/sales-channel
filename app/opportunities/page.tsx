"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

interface Opportunity {
  id: number;
  brand: string;
  product: string;
  est_annual: number;
  probability: number;
  stage: "new" | "contacted" | "sampling" | "quoting" | "negotiating" | "won" | "lost";
  stage_days: number;
}

const mockOpportunities: Opportunity[] = [
  { id: 1, brand: "6星集", product: "足浴套組", est_annual: 1800000, probability: 60, stage: "quoting", stage_days: 12 },
  { id: 2, brand: "悅禾莊園", product: "草本精油", est_annual: 2400000, probability: 40, stage: "sampling", stage_days: 18 },
  { id: 3, brand: "青松健康", product: "長照套組", est_annual: 1200000, probability: 80, stage: "negotiating", stage_days: 5 },
  { id: 4, brand: "大甲鎮瀾宮", product: "香品組合", est_annual: 600000, probability: 30, stage: "contacted", stage_days: 2 },
];

const STAGES = ["new", "contacted", "sampling", "quoting", "negotiating", "won", "lost"] as const;

const STAGE_LABELS = {
  new: "新名單",
  contacted: "已聯繫",
  sampling: "打樣中",
  quoting: "報價中",
  negotiating: "議約中",
  won: "成交",
  lost: "流失",
};

const STAGE_COLORS = {
  new: "badge-new",
  contacted: "badge-contacted",
  sampling: "badge-sampling",
  quoting: "badge-quoting",
  negotiating: "badge-negotiating",
  won: "badge-won",
  lost: "badge-lost",
};

export default function OpportunitiesPage() {
  const [opportunities] = useState(mockOpportunities);

  const totalValue = opportunities.reduce(
    (sum, opp) => sum + opp.est_annual * (opp.probability / 100),
    0
  );

  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = opportunities.filter((o) => o.stage === stage);
    return acc;
  }, {} as Record<string, Opportunity[]>);

  const isStalled = (opp: Opportunity) => {
    if (opp.stage === "sampling" && opp.stage_days > 14) return true;
    if (opp.stage === "quoting" && opp.stage_days > 30) return true;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">商機進度看板</h1>
        <p className="text-muted mt-2">跟蹤業務開發進度</p>
      </div>

      {/* 加權總值 */}
      <div className="card">
        <p className="text-sm text-muted mb-1">加權商機總值</p>
        <p className="text-3xl font-medium text-primary">
          NT${(totalValue / 1000000).toFixed(2)}M
        </p>
        <p className="text-xs text-muted mt-2">
          {opportunities.length} 個商機 · 平均機率{" "}
          {(opportunities.reduce((sum, o) => sum + o.probability, 0) / opportunities.length).toFixed(0)}%
        </p>
      </div>

      {/* 看板視圖（桌機） */}
      <div className="d-only">
        <div className="grid grid-cols-7 gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div key={stage}>
              <div className="bg-[var(--surface-2)] rounded-lg p-3 mb-3 sticky top-0">
                <p className="text-sm font-medium text-text">{STAGE_LABELS[stage]}</p>
                <p className="text-xs text-muted">{grouped[stage].length} 個</p>
              </div>
              <div className="space-y-2 min-h-[400px]">
                {grouped[stage].map((opp) => (
                  <div
                    key={opp.id}
                    className="card p-3 relative hover:shadow-md transition-shadow cursor-grab"
                  >
                    {isStalled(opp) && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-danger rounded-full flex items-center justify-center">
                        <AlertCircle size={14} className="text-white" />
                      </div>
                    )}
                    <p className="font-medium text-sm text-text truncate">{opp.brand}</p>
                    <p className="text-xs text-muted mt-1 truncate">{opp.product}</p>
                    <div className="space-y-2 mt-3">
                      <div className="flex justify-between text-xs text-muted">
                        <span>NT${opp.est_annual / 1000}K</span>
                        <span>{opp.probability}%</span>
                      </div>
                      <div className="w-full h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${opp.probability}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 列表視圖（手機） */}
      <div className="m-only space-y-4">
        {STAGES.map((stage) => (
          <div key={stage}>
            <h3 className="section-title mb-3 px-4">
              {STAGE_LABELS[stage]} ({grouped[stage].length})
            </h3>
            <div className="space-y-2">
              {grouped[stage].map((opp) => (
                <div key={opp.id} className="card p-4 relative">
                  {isStalled(opp) && (
                    <div className="absolute top-2 right-2">
                      <AlertCircle size={18} className="text-danger" />
                    </div>
                  )}
                  <p className="font-medium">{opp.brand}</p>
                  <p className="text-sm text-muted mt-1">{opp.product}</p>
                  <div className="flex justify-between items-center mt-3 text-sm">
                    <span className="text-muted">NT${opp.est_annual / 1000}K</span>
                    <span className="font-medium text-primary">{opp.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
