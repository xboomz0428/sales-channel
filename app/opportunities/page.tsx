"use client";

import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface Opportunity {
  id: string;
  brand_id: string;
  brands?: { name: string };
  product_line?: string;
  est_annual_value?: number;
  probability?: number;
  stage: string;
  stage_entered_at: string;
}

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

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  // 載入資料
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/opportunities");
        const result = await response.json();

        if (result.success) {
          setOpportunities(result.data);
        }
      } catch (error) {
        console.error("載入商機失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunities();
  }, []);

  const totalValue = opportunities.reduce(
    (sum, opp) => sum + ((opp.est_annual_value || 0) * ((opp.probability || 0) / 100)),
    0
  );

  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = opportunities.filter((o) => o.stage === stage);
    return acc;
  }, {} as Record<string, Opportunity[]>);

  const isStalled = (opp: Opportunity) => {
    const daysInStage = Math.floor(
      (Date.now() - new Date(opp.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (opp.stage === "sampling" && daysInStage > 14) return true;
    if (opp.stage === "quoting" && daysInStage > 30) return true;
    return false;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">商機進度看板</h1>
        <p className="text-muted mt-2">載入中...</p>
      </div>
    );
  }

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
          {opportunities.length > 0
            ? (opportunities.reduce((sum, o) => sum + (o.probability || 0), 0) / opportunities.length).toFixed(0)
            : 0}
          %
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
                    <p className="font-medium text-sm text-text truncate">
                      {opp.brands?.name}
                    </p>
                    <p className="text-xs text-muted mt-1 truncate">{opp.product_line}</p>
                    <div className="space-y-2 mt-3">
                      <div className="flex justify-between text-xs text-muted">
                        <span>NT${((opp.est_annual_value || 0) / 1000).toLocaleString()}K</span>
                        <span>{opp.probability}%</span>
                      </div>
                      <div className="w-full h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${opp.probability || 0}%` }}
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
                  <p className="font-medium">{opp.brands?.name}</p>
                  <p className="text-sm text-muted mt-1">{opp.product_line}</p>
                  <div className="flex justify-between items-center mt-3 text-sm">
                    <span className="text-muted">NT${((opp.est_annual_value || 0) / 1000).toLocaleString()}K</span>
                    <span className="font-medium text-primary">{opp.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {opportunities.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-muted">無商機資料</p>
        </div>
      )}
    </div>
  );
}
