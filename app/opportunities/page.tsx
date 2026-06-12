"use client";

import { useState } from "react";
import { GripVertical, AlertCircle } from "lucide-react";

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
  {
    id: 1,
    brand: "6星集足體養生",
    product: "足浴套組",
    est_annual: 1800000,
    probability: 60,
    stage: "quoting",
    stage_days: 12,
  },
  {
    id: 2,
    brand: "悅禾莊園SPA",
    product: "草本精油",
    est_annual: 2400000,
    probability: 40,
    stage: "sampling",
    stage_days: 18,
  },
  {
    id: 3,
    brand: "青松健康",
    product: "長照護理套組",
    est_annual: 1200000,
    probability: 80,
    stage: "negotiating",
    stage_days: 5,
  },
  {
    id: 4,
    brand: "大甲鎮瀾宮",
    product: "香品組合",
    est_annual: 600000,
    probability: 30,
    stage: "contacted",
    stage_days: 2,
  },
];

const STAGES = [
  "new",
  "contacted",
  "sampling",
  "quoting",
  "negotiating",
  "won",
  "lost",
];
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
  new: "bg-[color:var(--status-new-bg)]",
  contacted: "bg-[color:var(--status-contacted-bg)]",
  sampling: "bg-[color:var(--status-sampling-bg)]",
  quoting: "bg-[color:var(--status-quoting-bg)]",
  negotiating: "bg-[color:var(--status-negotiating-bg)]",
  won: "bg-[color:var(--status-won-bg)]",
  lost: "bg-[color:var(--danger)] bg-opacity-10",
};

export default function OpportunitiesPage() {
  const [opportunities] = useState(mockOpportunities);

  const totalValue = opportunities.reduce(
    (sum, opp) => sum + opp.est_annual * (opp.probability / 100),
    0
  );

  const groupedByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = opportunities.filter((o) => o.stage === stage);
    return acc;
  }, {} as Record<string, Opportunity[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">商機進度看板</h1>
        <p className="text-muted mt-2">跟蹤商機推進情況</p>
      </div>

      {/* Total Value */}
      <div className="card">
        <p className="text-sm text-muted mb-1">加權商機總值</p>
        <p className="text-3xl font-medium text-[color:var(--primary)]">
          NT${(totalValue / 1000000).toFixed(2)}M
        </p>
        <p className="text-xs text-muted mt-2">
          {opportunities.length} 個商機 • 平均機率{" "}
          {(
            opportunities.reduce((sum, o) => sum + o.probability, 0) /
            opportunities.length
          ).toFixed(0)}%
        </p>
      </div>

      {/* Kanban Board */}
      <div className="space-y-4">
        {/* Mobile: List View */}
        <div className="m-only space-y-4">
          {STAGES.map((stage) => (
            <div key={stage}>
              <h3 className="section-title px-4 mb-2">
                {STAGE_LABELS[stage as keyof typeof STAGE_LABELS]} (
                {groupedByStage[stage].length})
              </h3>
              <div className="space-y-2">
                {groupedByStage[stage].map((opp) => (
                  <OpportunityCard key={opp.id} opportunity={opp} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: Kanban Columns */}
        <div className="d-only grid grid-cols-7 gap-4">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="space-y-2"
            >
              <div className="px-3 py-2 bg-[color:var(--surface-2)] rounded-[10px]">
                <p className="text-sm font-medium text-[color:var(--text)]">
                  {STAGE_LABELS[stage as keyof typeof STAGE_LABELS]}
                </p>
                <p className="text-xs text-muted">
                  {groupedByStage[stage].length} 個
                </p>
              </div>
              <div className="space-y-2 min-h-[400px]">
                {groupedByStage[stage].map((opp) => (
                  <OpportunityCard key={opp.id} opportunity={opp} desktop />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  desktop = false,
}: {
  opportunity: Opportunity;
  desktop?: boolean;
}) {
  const isWarning =
    (opportunity.stage === "sampling" && opportunity.stage_days > 14) ||
    (opportunity.stage === "quoting" && opportunity.stage_days > 30);

  if (!desktop) {
    return (
      <div className="card p-4 space-y-2 cursor-pointer hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-medium text-[color:var(--text)]">
              {opportunity.brand}
            </p>
            <p className="text-sm text-muted mt-1">{opportunity.product}</p>
          </div>
          {isWarning && (
            <AlertCircle
              size={16}
              className="text-[color:var(--danger)]"
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>年營收: NT${opportunity.est_annual / 1000}K</span>
          <span>機率: {opportunity.probability}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-3 space-y-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all">
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="text-muted flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[color:var(--text)] truncate">
            {opportunity.brand}
          </p>
          <p className="text-xs text-muted truncate">{opportunity.product}</p>
        </div>
        {isWarning && (
          <AlertCircle size={14} className="text-[color:var(--danger)] flex-shrink-0" />
        )}
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between text-muted">
          <span>NT${opportunity.est_annual / 1000}K</span>
          <span>{opportunity.probability}%</span>
        </div>
        <div className="w-full h-1 bg-[color:var(--surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[color:var(--primary)]"
            style={{ width: `${opportunity.probability}%` }}
          />
        </div>
      </div>
    </div>
  );
}
