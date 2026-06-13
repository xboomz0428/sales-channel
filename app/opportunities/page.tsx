"use client";

import { useState, useEffect } from "react";
import { C, STAGES, STAGE_CFG, downloadCSV, StatusKey } from "@/lib/design";
import Icon from "@/components/Icon";
import MobileTabBar from "@/components/MobileTabBar";

interface Opp {
  id: string | number;
  brand: string;
  product: string;
  stage: StatusKey;
  est: number;
  prob: number;
  days: number;
  lost_reason?: string;
}


// ── 看板卡片 ─────────────────────────────────────────
function KanbanCard({ opp, onMove, stageIdx }: { opp: Opp; onMove: (id: Opp["id"], dir: number) => void; stageIdx: number }) {
  const cfg = STAGE_CFG[opp.stage];
  const stale = cfg.stale != null && opp.days > cfg.stale;
  const canBack = stageIdx > 0 && opp.stage !== "won" && opp.stage !== "lost";
  const canFwd = stageIdx < STAGES.length - 3; // 不含 won/lost

  return (
    <div
      className="kcard"
      style={{
        background: C.surface,
        borderRadius: 13,
        border: `1px solid ${stale ? C.danger + "60" : C.border}`,
        marginBottom: 9,
        overflow: "hidden",
        boxShadow: "0 1px 6px rgba(58,92,87,.05)",
      }}
    >
      {stale && (
        <div style={{ background: `${C.danger}20`, padding: "4px 12px", fontSize: 11, color: C.danger, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          <Icon n="warn" size={11} color={C.danger} />
          停留 {opp.days} 天，建議跟進
        </div>
      )}
      <div style={{ padding: "11px 12px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={opp.brand}>
          {opp.brand}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 9 }}>{opp.product}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>NT${(opp.est / 10000).toFixed(0)}萬</span>
          {opp.prob > 0 && (
            <span style={{ padding: "2px 8px", borderRadius: 999, background: C.p50, color: C.primary, fontSize: 11, fontWeight: 600 }}>{opp.prob}%</span>
          )}
        </div>
        {opp.days > 0 && (
          <div style={{ fontSize: 11, color: stale ? C.danger : C.muted, marginBottom: 9, display: "flex", alignItems: "center", gap: 4 }}>
            <Icon n="clock" size={10} color={stale ? C.danger : C.muted} />
            {opp.days} 天
          </div>
        )}
        {opp.stage !== "won" && opp.stage !== "lost" && (
          <div style={{ display: "flex", gap: 5 }}>
            {canBack && (
              <button
                onClick={() => onMove(opp.id, -1)}
                className="pressable"
                style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 11, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}
              >
                <Icon n="chL" size={11} color={C.muted} />退
              </button>
            )}
            {canFwd && (
              <button
                onClick={() => onMove(opp.id, 1)}
                className="pressable"
                style={{ flex: 2, padding: "5px 0", borderRadius: 8, border: "none", background: C.p50, cursor: "pointer", fontSize: 11, color: C.primary, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}
              >
                推進
                <Icon n="chR" size={11} color={C.primary} />
              </button>
            )}
          </div>
        )}
        {opp.stage === "won" && <div style={{ textAlign: "center", fontSize: 12, color: STAGE_CFG.won.color, fontWeight: 600 }}>🎉 已成交</div>}
        {opp.stage === "lost" && <div style={{ textAlign: "center", fontSize: 12, color: STAGE_CFG.lost.color }}>{opp.lost_reason || "已流失"}</div>}
      </div>
    </div>
  );
}

// ── 看板欄位 ─────────────────────────────────────────
function KanbanCol({ stageKey, opps, onMove }: { stageKey: StatusKey; opps: Opp[]; onMove: (id: Opp["id"], dir: number) => void }) {
  const cfg = STAGE_CFG[stageKey];
  const stageIdx = STAGES.indexOf(stageKey);
  const total = opps.reduce((s, o) => s + (o.prob > 0 ? (o.est * o.prob) / 100 : 0), 0);

  return (
    <div style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 12px 9px", borderRadius: "12px 12px 0 0", background: cfg.bg, border: `1px solid ${cfg.color}30`, borderBottom: "none", marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: cfg.color + "25", color: cfg.color, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {opps.length}
          </span>
        </div>
        {total > 0 && <div style={{ fontSize: 11, color: cfg.color, fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>NT${(total / 10000).toFixed(0)}萬</div>}
      </div>
      <div
        style={{
          flex: 1,
          background: C.surf2 + "80",
          border: `1px solid ${cfg.color}20`,
          borderTop: "none",
          borderRadius: "0 0 12px 12px",
          padding: 8,
          minHeight: 160,
          overflowY: "auto",
          maxHeight: "calc(100vh - 220px)",
        }}
      >
        {opps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 8px", fontSize: 12, color: C.muted, opacity: 0.6 }}>暫無</div>
        ) : (
          opps.map((o) => <KanbanCard key={o.id} opp={o} onMove={onMove} stageIdx={stageIdx} />)
        )}
      </div>
    </div>
  );
}

// ── 手機階段列表 ─────────────────────────────────────
function MobileList({ opps, onMove }: { opps: Opp[]; onMove: (id: Opp["id"], dir: number) => void }) {
  const [activeStage, setActiveStage] = useState<StatusKey>("quoting");
  const stageOpps = opps.filter((o) => o.stage === activeStage);
  return (
    <div>
      <div style={{ overflowX: "auto", display: "flex", gap: 6, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        {STAGES.map((s) => {
          const cfg = STAGE_CFG[s];
          const on = s === activeStage;
          const count = opps.filter((o) => o.stage === s).length;
          return (
            <button
              key={s}
              onClick={() => setActiveStage(s)}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${on ? cfg.color : C.border}`,
                background: on ? cfg.bg : "transparent",
                color: on ? cfg.color : C.muted,
                fontSize: 12,
                fontWeight: on ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {cfg.label} {count > 0 && <span style={{ opacity: 0.7 }}>·{count}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ padding: "12px 16px", overflowY: "auto", paddingBottom: 80 }}>
        {stageOpps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted, fontSize: 14 }}>🌿 此階段暫無商機</div>
        ) : (
          stageOpps.map((o) => <KanbanCard key={o.id} opp={o} onMove={onMove} stageIdx={STAGES.indexOf(o.stage)} />)
        )}
      </div>
    </div>
  );
}

// ── 主頁面 ───────────────────────────────────────────
export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingApi, setUsingApi] = useState(false);

  useEffect(() => {
    fetch("/api/opportunities")
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data)) {
          setOpps(
            result.data.map((o: Record<string, unknown>) => {
              const entered = o.stage_entered_at ? new Date(o.stage_entered_at as string).getTime() : Date.now();
              const days = Math.max(0, Math.floor((Date.now() - entered) / 86400000));
              const brands = o.brands as { name?: string } | undefined;
              return {
                id: o.id as string,
                brand: brands?.name || "未命名",
                product: (o.product_line as string) || "—",
                stage: ((o.stage as string) || "new") as StatusKey,
                est: (o.est_annual_value as number) || 0,
                prob: (o.probability as number) || 0,
                days,
              };
            })
          );
          setUsingApi(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const move = (id: Opp["id"], dir: number) => {
    let nextStage: StatusKey | undefined;
    setOpps((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const idx = STAGES.indexOf(o.stage);
        const next = STAGES[idx + dir];
        if (!next) return o;
        nextStage = next;
        return { ...o, stage: next, days: 0 };
      })
    );
    if (usingApi && nextStage) {
      fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage: nextStage }),
      }).catch(() => {});
    }
  };

  const weighted = opps.filter((o) => !["won", "lost"].includes(o.stage)).reduce((s, o) => s + (o.est * o.prob) / 100, 0);
  const wonTotal = opps.filter((o) => o.stage === "won").reduce((s, o) => s + o.est, 0);

  const exportCSV = () => {
    const hdrs = ["品牌", "產品", "階段", "預估年營收(NT$)", "成交機率(%)", "停留天數"];
    const rows = opps.map((o) => [o.brand, o.product, STAGE_CFG[o.stage]?.label || o.stage, o.est, o.prob, o.days]);
    downloadCSV("HeroHerb_商機看板.csv", hdrs, rows);
  };

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0, whiteSpace: "nowrap" }}>商機進度看板</h1>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <div style={{ padding: "6px 14px", borderRadius: 10, background: `${C.primary}15` }}>
            <span style={{ fontSize: 12, color: C.muted }}>開發中加權商機</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>NT${(weighted / 10000).toFixed(0)}萬</span>
          </div>
          <div style={{ padding: "6px 14px", borderRadius: 10, background: "#DCE9DC" }}>
            <span style={{ fontSize: 12, color: "#4A6B50" }}>已成交</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#4A6B50", marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>NT${(wonTotal / 10000).toFixed(0)}萬</span>
          </div>
          <button
            onClick={exportCSV}
            className="pressable"
            style={{ padding: "6px 13px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.muted }}>
          <div className="spin" style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%" }} />
          <div style={{ fontSize: 14 }}>載入商機資料中…</div>
        </div>
      ) : (
        <>
          {/* Desktop kanban */}
          <div className="d-only" style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: "16px 20px" }}>
            <div style={{ display: "flex", gap: 10, height: "100%", alignItems: "flex-start" }}>
              {STAGES.map((s) => (
                <KanbanCol key={s} stageKey={s} opps={opps.filter((o) => o.stage === s)} onMove={move} />
              ))}
            </div>
          </div>

          {/* Mobile list */}
          <div className="m-only" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <MobileList opps={opps} onMove={move} />
          </div>
        </>
      )}

      <MobileTabBar />
    </>
  );
}
