"use client";

import { useState, useEffect, Fragment, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { C, STATUS, STAGE_ORDER, CHANNELS, CHANNEL_ORDER, INDUSTRIES, channelHref, StatusKey } from "@/lib/design";
import Icon from "@/components/Icon";
import MobileTabBar from "@/components/MobileTabBar";

// ── 品牌視圖模型 ─────────────────────────────────────
export interface BrandVM {
  id: string | number;
  name: string;
  industry: string;
  stores: number;
  cities: string;
  channels: string[];
  score: number;
  status: string;
  channelLinks?: Record<string, string>;
  owner?: string;
  tax_id?: string;
  est_annual?: number;
  probability?: number;
  stage_days?: number;
  extra?: string;
  tier?: string;
  reorder_in_days?: number;
  lost_reason?: string;
}

// 種子資料（API 無資料時顯示）
const SEED_BRANDS: BrandVM[] = [
  { id: 1, name: "6星集足體養生會館", industry: "養生館", stores: 9, cities: "北/中/南", channels: ["line", "fb", "ig", "email"], score: 92, status: "quoting", owner: "江○○", tax_id: "16830000", est_annual: 1800000, probability: 60, stage_days: 12 },
  { id: 2, name: "悅禾莊園SPA", industry: "養生館", stores: 12, cities: "北/中/南", channels: ["line", "fb", "ig"], score: 89, status: "sampling", est_annual: 2400000, probability: 40, stage_days: 18 },
  { id: 3, name: "小林越式洗髮", industry: "越式洗髮", stores: 5, cities: "新北", channels: ["fb"], score: 61, status: "contacted" },
  { id: 4, name: "大甲鎮瀾宮", industry: "宮廟", stores: 1, cities: "台中", channels: ["fb", "line"], score: 95, status: "new", extra: "主祀:天上聖母" },
  { id: 5, name: "青松健康(長照)", industry: "長照", stores: 23, cities: "中部", channels: ["email", "fb"], score: 88, status: "won", tier: "A", reorder_in_days: 6 },
  { id: 6, name: "龍巖人本", industry: "禮儀", stores: 40, cities: "全台", channels: ["email"], score: 85, status: "lost", lost_reason: "已有供應商" },
];

// ── 基礎元件 ─────────────────────────────────────────
function ChannelDots({ channels, links }: { channels: string[]; links?: Record<string, string> }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {channels.map((ch) => {
        const c = CHANNELS[ch] || { abbr: ch.slice(0, 2).toUpperCase(), bg: "#aaa", label: ch };
        const href = links?.[ch] ? channelHref(ch, links[ch]) : null;
        const dot = (
          <div
            title={href ? `${c.label}：${links?.[ch]}` : c.label || ch}
            style={{ width: 26, height: 26, borderRadius: 7, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: href ? 1 : 0.85 }}
          >
            <span style={{ color: "white", fontSize: 9, fontWeight: 700, letterSpacing: -0.3 }}>{c.abbr}</span>
          </div>
        );
        return href ? (
          <a key={ch} href={href} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ display: "block" }}>
            {dot}
          </a>
        ) : (
          <span key={ch}>{dot}</span>
        );
      })}
    </div>
  );
}

function Badge({ status, onClick }: { status: string; onClick?: () => void }) {
  const s = STATUS[status as StatusKey] || STATUS.new;
  return (
    <button
      onClick={onClick}
      className="pressable"
      style={{
        padding: "4px 11px",
        borderRadius: 999,
        border: "none",
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 600,
        cursor: onClick ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
      {onClick && <Icon n="chD" size={10} color={s.fg} />}
    </button>
  );
}

function StatusTrail({ status, onClick }: { status: string; onClick?: () => void }) {
  if (status === "lost") {
    const s = STATUS.lost;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
        <span style={{ padding: "2px 9px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
        {onClick && <Icon n="chD" size={9} color={s.fg} />}
      </div>
    );
  }
  const curIdx = STAGE_ORDER.indexOf(status as StatusKey);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, cursor: onClick ? "pointer" : "default", flexWrap: "nowrap" }} onClick={onClick}>
      {STAGE_ORDER.map((s, i) => {
        const cfg = STATUS[s];
        const isCur = i === curIdx;
        const isPast = i < curIdx;
        return (
          <Fragment key={s}>
            {i > 0 && <div style={{ width: 5, height: 1.5, flexShrink: 0, background: isPast ? "#C8C5BC" : "#E4E1DB" }} />}
            <div
              style={{
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: isCur ? 700 : 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
                background: isCur ? cfg.bg : isPast ? "#E8E6E0" : "transparent",
                color: isCur ? cfg.fg : isPast ? "#5A5855" : "#9A978F",
                border: `1px solid ${isCur ? cfg.fg + "88" : isPast ? "#B0ADA5" : "#D4D1CB"}`,
                letterSpacing: 0.1,
                transition: "all 120ms",
              }}
            >
              {cfg.label}
            </div>
          </Fragment>
        );
      })}
      {onClick && <Icon n="chD" size={9} color={C.muted} style={{ marginLeft: 3, flexShrink: 0 }} />}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 85 ? C.primary : score >= 70 ? C.accent : C.sage;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 76 }}>
      <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C.text, minWidth: 22 }}>{score}</span>
      <div style={{ flex: 1, height: 4, background: C.surf2, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 500ms" }} />
      </div>
    </div>
  );
}

function StatusPicker({
  current,
  onSelect,
  align = "left",
}: {
  current: string;
  onSelect: (k: string) => void;
  align?: "left" | "right";
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        [align === "right" ? "right" : "left"]: 0,
        zIndex: 300,
        background: C.surface,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        boxShadow: "0 10px 30px rgba(46,69,53,.14)",
        padding: 6,
        minWidth: 154,
      }}
    >
      {Object.entries(STATUS).map(([k, s]) => (
        <button
          key={k}
          onClick={() => onSelect(k)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "7px 10px",
            border: "none",
            borderRadius: 9,
            cursor: "pointer",
            background: k === current ? C.p50 : "transparent",
            fontSize: 14,
            color: C.text,
          }}
        >
          <span style={{ padding: "2px 9px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── 抽屜輔助元件 ─────────────────────────────────────
function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.4, color: C.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ background: C.surf2, borderRadius: 12, padding: "12px 14px" }}>{children}</div>
    </div>
  );
}

function DrawerRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, color: C.muted, minWidth: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: C.text, fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, background: C.surf2 }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color || C.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: "72px 20px", color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>🌿</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 6 }}>沒有找到符合條件的品牌</div>
      <div style={{ fontSize: 14 }}>試試清除篩選條件</div>
    </div>
  );
}

function Overlay({ onClick, blur }: { onClick: () => void; blur?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(46,69,53,.4)",
        backdropFilter: blur ? "blur(2px)" : "none",
        animation: "fadeIn 180ms",
      }}
    />
  );
}

// ── 篩選列 ───────────────────────────────────────────
type Filters = { industry?: string; status?: string };

function FilterBar({
  filters,
  onAdd,
  onRemove,
  onOpenDrawer,
}: {
  filters: Filters;
  onAdd: (k: keyof Filters, v: string) => void;
  onRemove: (k: keyof Filters) => void;
  onOpenDrawer: () => void;
}) {
  const chips = Object.entries(filters).filter(([, v]) => v) as [keyof Filters, string][];
  return (
    <div
      style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      <button
        onClick={onOpenDrawer}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 13px",
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          background: "transparent",
          cursor: "pointer",
          fontSize: 13,
          color: C.muted,
        }}
      >
        <Icon n="filter" size={13} />
        篩選
      </button>

      {chips.map(([key, val]) => {
        const isStatus = key === "status";
        const s = isStatus ? STATUS[val as StatusKey] : null;
        return (
          <span
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px 5px 13px",
              borderRadius: 999,
              background: s ? s.bg : C.p50,
              color: s ? s.fg : C.primary,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {isStatus ? s?.label : val}
            <button
              onClick={() => onRemove(key)}
              style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, opacity: 0.65, lineHeight: 1, display: "flex", alignItems: "center" }}
            >
              <Icon n="x" size={12} />
            </button>
          </span>
        );
      })}

      <div className="d-only" style={{ display: "flex", gap: 4, marginLeft: 4 }}>
        {Object.entries(STATUS)
          .slice(0, 5)
          .map(([k, s]) => (
            <button
              key={k}
              onClick={() => onAdd("status", k)}
              style={{
                padding: "4px 11px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${filters.status === k ? s.fg : C.border}`,
                background: filters.status === k ? s.bg : "transparent",
                color: filters.status === k ? s.fg : C.muted,
                cursor: "pointer",
                transition: "all 130ms",
              }}
            >
              {s.label}
            </button>
          ))}
      </div>

      {chips.length > 0 && (
        <button
          onClick={() => chips.forEach(([k]) => onRemove(k))}
          style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 999, fontSize: 12, border: "none", background: "transparent", color: C.muted, cursor: "pointer" }}
        >
          清除全部
        </button>
      )}
    </div>
  );
}

// ── 品牌表格（桌機）──────────────────────────────────
function BrandTable({
  brands,
  onRowClick,
  onStatusChange,
}: {
  brands: BrandVM[];
  onRowClick: (b: BrandVM) => void;
  onStatusChange: (id: BrandVM["id"], s: string) => void;
}) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [picker, setPicker] = useState<BrandVM["id"] | null>(null);

  const doSort = (f: string) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };

  const getVal = (item: BrandVM, f: string): number | string | undefined => {
    if (f === "channels") return (item.channels || []).length;
    if (f === "status") {
      const idx = STAGE_ORDER.indexOf(item.status as StatusKey);
      return idx >= 0 ? idx : 99;
    }
    return item[f as keyof BrandVM] as number | string | undefined;
  };

  const sorted = [...brands].sort((a, b) => {
    if (!sortField) return 0;
    const av = getVal(a, sortField);
    const bv = getVal(b, sortField);
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "zh-TW");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const TH = ({ f, children, center }: { f?: string; children: ReactNode; center?: boolean }) => (
    <th
      onClick={f ? () => doSort(f) : undefined}
      style={{ padding: "12px 16px", textAlign: center ? "center" : "left", cursor: f ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          justifyContent: center ? "center" : "flex-start",
          color: C.muted,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.9,
        }}
      >
        {children}
        {f && <Icon n={sortField === f ? (sortDir === "asc" ? "chU" : "chD") : "chD"} size={11} color={sortField === f ? C.primary : C.border} />}
      </div>
    </th>
  );

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      {picker !== null && <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setPicker(null)} />}
      <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: C.surf2, borderBottom: `1px solid ${C.border}` }}>
            <TH f="name">品牌名稱</TH>
            <TH f="industry">類別</TH>
            <TH f="stores" center>分店</TH>
            <TH f="cities">城市</TH>
            <TH f="channels">管道</TH>
            <TH f="score">評分</TH>
            <TH f="status">狀態</TH>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => (
            <tr
              key={b.id}
              className="trow"
              onClick={() => onRowClick(b)}
              style={{ background: i % 2 === 0 ? C.surface : "rgba(244,241,234,.3)", borderBottom: `1px solid ${C.border}` }}
            >
              <td style={{ padding: "16px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: C.p50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 15, color: C.primary, fontWeight: 700 }}>{b.name[0]}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, color: C.text, fontSize: 14, lineHeight: 1.35 }}>{b.name}</div>
                    {b.owner && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{b.owner}</div>}
                    {b.extra && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{b.extra}</div>}
                    {b.reorder_in_days != null && (
                      <div style={{ fontSize: 11, color: C.danger, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                        <Icon n="clock" size={10} color={C.danger} />
                        補貨剩 {b.reorder_in_days} 天
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td style={{ padding: 16, color: C.muted, whiteSpace: "nowrap" }}>{b.industry}</td>
              <td style={{ padding: 16, textAlign: "center", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C.text }}>{b.stores}</td>
              <td style={{ padding: 16, color: C.muted, fontSize: 13, whiteSpace: "nowrap" }}>{b.cities}</td>
              <td style={{ padding: 16 }}>
                <ChannelDots channels={b.channels} links={b.channelLinks} />
              </td>
              <td style={{ padding: 16 }}>
                <ScoreBar score={b.score} />
              </td>
              <td style={{ padding: 16, position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <StatusTrail status={b.status} onClick={() => setPicker(picker === b.id ? null : b.id)} />
                  {picker === b.id && (
                    <StatusPicker
                      current={b.status}
                      onSelect={(s) => {
                        onStatusChange(b.id, s);
                        setPicker(null);
                      }}
                    />
                  )}
                </div>
                {b.stage_days != null && (
                  <div style={{ fontSize: 11, color: b.stage_days > 14 ? C.danger : C.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 2 }}>
                    <Icon n={b.stage_days > 14 ? "warn" : "clock"} size={10} color={b.stage_days > 14 ? C.danger : C.muted} />
                    {b.stage_days} 天
                  </div>
                )}
              </td>
              <td style={{ padding: "16px 10px 16px 4px" }}>
                <Icon n="chR" size={15} color={C.muted} style={{ opacity: 0.4 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 品牌卡片（手機）──────────────────────────────────
function BrandCard({
  brand: b,
  onClick,
  onStatusChange,
}: {
  brand: BrandVM;
  onClick: () => void;
  onStatusChange: (id: BrandVM["id"], s: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface,
        borderRadius: 16,
        padding: "16px 16px 14px",
        border: `1px solid ${C.border}`,
        marginBottom: 10,
        boxShadow: "0 2px 10px rgba(46,69,53,.05)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: C.p50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 16, color: C.primary, fontWeight: 700 }}>{b.name[0]}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
              {b.industry} · {b.stores} 間 · {b.cities}
            </div>
          </div>
        </div>
        <div
          style={{ position: "relative", marginLeft: 10, flexShrink: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            setPicker(!picker);
          }}
        >
          <Badge status={b.status} onClick={() => {}} />
          {picker && (
            <StatusPicker
              current={b.status}
              align="right"
              onSelect={(s) => {
                onStatusChange(b.id, s);
                setPicker(false);
              }}
            />
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <ChannelDots channels={b.channels} links={b.channelLinks} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {b.reorder_in_days != null && (
            <span style={{ fontSize: 11, color: C.danger, display: "flex", alignItems: "center", gap: 3 }}>
              <Icon n="clock" size={11} color={C.danger} />
              補貨 {b.reorder_in_days} 天
            </span>
          )}
          {(b.stage_days || 0) > 14 && (
            <span style={{ fontSize: 11, color: C.danger, display: "flex", alignItems: "center", gap: 3 }}>
              <Icon n="warn" size={11} color={C.danger} />
              停留 {b.stage_days} 天
            </span>
          )}
          <span style={{ fontSize: 12, color: C.muted }}>
            評分 <strong style={{ color: C.text }}>{b.score}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 品牌詳情抽屜 ─────────────────────────────────────
function BrandDrawer({
  brand: b,
  onClose,
  onRecord,
  onDetail,
}: {
  brand: BrandVM;
  onClose: () => void;
  onRecord: () => void;
  onDetail: () => void;
}) {
  const pipeline = b.est_annual && b.probability ? Math.round((b.est_annual * b.probability) / 100) : null;
  return (
    <>
      <Overlay onClick={onClose} blur />
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 390,
          maxWidth: "95vw",
          background: C.surface,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 40px rgba(46,69,53,.16)",
          animation: "slideInRight 260ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: C.p50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 18, color: C.primary, fontWeight: 700 }}>{b.name[0]}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {b.industry} · {b.stores} 間 · {b.cities}
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, padding: 6, borderRadius: 8, flexShrink: 0 }}>
            <Icon n="x" size={20} />
          </button>
        </div>

        {/* Pills */}
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge status={b.status} />
          {b.tier && <span style={{ padding: "4px 11px", borderRadius: 999, background: "#FFF3CC", color: "#A6824A", fontSize: 12, fontWeight: 700 }}>{b.tier} 級客戶</span>}
          <span style={{ padding: "4px 11px", borderRadius: 999, background: C.surf2, color: C.muted, fontSize: 12 }}>評分 {b.score}</span>
          {b.tax_id && <span style={{ padding: "4px 11px", borderRadius: 999, background: C.surf2, color: C.muted, fontSize: 12, fontFamily: "monospace" }}>{b.tax_id}</span>}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <DrawerSection label="聯絡管道">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {b.channels.length === 0 && <span style={{ fontSize: 13, color: C.muted }}>尚未採集到聯絡管道</span>}
              {b.channels.map((ch) => {
                const cfg = CHANNELS[ch] || { label: ch, bg: "#aaa", abbr: ch };
                const link = b.channelLinks?.[ch];
                const chip = (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "white", fontSize: 8, fontWeight: 700 }}>{cfg.abbr}</span>
                    </div>
                    <span style={{ fontSize: 13, color: C.text }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>{link ? "開啟 →" : "已驗證"}</span>
                  </div>
                );
                return link ? (
                  <a key={ch} href={channelHref(ch, link)} target="_blank" rel="noopener" style={{ textDecoration: "none" }} title={link}>
                    {chip}
                  </a>
                ) : (
                  <span key={ch}>{chip}</span>
                );
              })}
            </div>
          </DrawerSection>

          {(b.owner || b.extra || b.lost_reason) && (
            <DrawerSection label="備註資料">
              {b.owner && <DrawerRow label="負責人" value={b.owner} />}
              {b.extra && <DrawerRow label="特殊資訊" value={b.extra} />}
              {b.lost_reason && <DrawerRow label="流失原因" value={b.lost_reason} />}
            </DrawerSection>
          )}

          {b.est_annual && (
            <DrawerSection label="商機概況">
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <KPI label="預估年營收" value={`NT$${(b.est_annual / 10000).toFixed(0)}萬`} />
                {b.probability ? <KPI label="成交機率" value={`${b.probability}%`} color={C.primary} /> : null}
                {pipeline ? <KPI label="加權商機" value={`NT$${(pipeline / 10000).toFixed(0)}萬`} color={C.accentDk} /> : null}
              </div>
              {b.stage_days ? (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: b.stage_days > 14 ? C.danger : C.muted }}>
                  <Icon n={b.stage_days > 14 ? "warn" : "clock"} size={13} color={b.stage_days > 14 ? C.danger : C.muted} />
                  已在此階段 {b.stage_days} 天
                  {b.stage_days > 14 && (
                    <span style={{ background: C.danger + "20", color: C.danger, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>建議跟進</span>
                  )}
                </div>
              ) : null}
            </DrawerSection>
          )}

          {b.reorder_in_days != null && (
            <div style={{ background: "#FFF0E8", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <Icon n="clock" size={18} color={C.danger} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.danger }}>補貨提醒</div>
                <div style={{ fontSize: 13, color: C.muted }}>預估補貨日剩 {b.reorder_in_days} 天，建議本週聯繫</div>
              </div>
            </div>
          )}

          <DrawerSection label="聯繫紀錄">
            <div style={{ padding: "16px 0", textAlign: "center", color: C.muted, fontSize: 14 }}>🌿 尚無聯繫紀錄，點下方快速記錄第一筆</div>
          </DrawerSection>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
          <button
            onClick={onRecord}
            className="pressable"
            style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: C.primary, color: "white", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            ✏️ 快速記錄
          </button>
          <button
            onClick={onDetail}
            className="pressable"
            style={{ padding: "13px 18px", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 14, cursor: "pointer" }}
          >
            詳情 →
          </button>
        </div>
      </div>
    </>
  );
}

// ── 30 秒快速記錄 ────────────────────────────────────
function QuickRecord({ brand: b, onClose }: { brand: BrandVM; onClose: () => void }) {
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const opts = [
    { id: "interested", label: "有興趣", emoji: "👍", bg: "#E6EFE6", fg: "#4A6B50" },
    { id: "reschedule", label: "再約時間", emoji: "📅", bg: "#F5EDDD", fg: "#A6824A" },
    { id: "rejected", label: "婉拒了", emoji: "😔", bg: "#F3E4DC", fg: "#A66A4F" },
  ];

  const save = async () => {
    if (!result) return;
    setSaving(true);
    const labels: Record<string, string> = { interested: "有興趣", reschedule: "再約時間", rejected: "婉拒了" };
    try {
      await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: b.id,
          channel: "phone",
          summary: `【${labels[result]}】${note || "快速記錄"}（跟進日期 ${date}）`,
        }),
      });
    } catch {
      // 離線時僅本地關閉
    }
    setSaving(false);
    onClose();
  };

  return (
    <>
      <Overlay onClick={onClose} blur />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 60,
          background: C.surface,
          borderRadius: "20px 20px 0 0",
          padding: "0 20px 32px",
          boxShadow: "0 -8px 40px rgba(46,69,53,.16)",
          animation: "slideInUp 260ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "12px auto 18px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>30 秒快速記錄</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{b.name}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted }}>
            <Icon n="x" size={22} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {opts.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setResult(opt.id)}
              className="pressable"
              style={{
                padding: "16px 8px",
                borderRadius: 14,
                textAlign: "center",
                lineHeight: 1.5,
                border: `2px solid ${result === opt.id ? opt.fg : "transparent"}`,
                background: result === opt.id ? opt.bg : C.surf2,
                color: result === opt.id ? opt.fg : C.muted,
                fontSize: 14,
                fontWeight: result === opt.id ? 700 : 400,
                cursor: "pointer",
                transition: "all 150ms",
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 5 }}>{opt.emoji}</div>
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>跟進日期</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 15, color: C.text }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>備註（可選）</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="談話重點、對方反應、下次策略…"
            rows={2}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 15, color: C.text, resize: "none", lineHeight: 1.6 }}
          />
        </div>

        <button
          onClick={save}
          className="pressable"
          style={{
            width: "100%",
            padding: 15,
            borderRadius: 13,
            border: "none",
            background: result ? C.primary : C.surf2,
            color: result ? "white" : C.muted,
            fontWeight: 700,
            fontSize: 16,
            cursor: result ? "pointer" : "default",
            transition: "background 200ms, color 200ms",
          }}
        >
          {saving ? "儲存中…" : result ? "儲存記錄 ✓" : "請先選擇結果"}
        </button>
      </div>
    </>
  );
}

// ── 篩選抽屜（手機）──────────────────────────────────
function FilterDrawer({
  filters,
  onApply,
  onClose,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<Filters>({ ...filters });
  const toggle = (k: keyof Filters, v: string) => setLocal((prev) => ({ ...prev, [k]: prev[k] === v ? undefined : v }));

  const Pill = ({ k, v, bg, fg, label }: { k: keyof Filters; v: string; bg?: string; fg?: string; label: string }) => (
    <button
      onClick={() => toggle(k, v)}
      style={{
        padding: "7px 15px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        border: `1px solid ${local[k] === v ? fg || C.primary : C.border}`,
        background: local[k] === v ? bg || C.p50 : "transparent",
        color: local[k] === v ? fg || C.primary : C.text,
        cursor: "pointer",
        transition: "all 130ms",
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <Overlay onClick={onClose} blur />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 60,
          background: C.surface,
          borderRadius: "20px 20px 0 0",
          padding: "0 20px 32px",
          maxHeight: "82vh",
          overflowY: "auto",
          animation: "slideInUp 260ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "12px auto 18px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: C.text }}>篩選條件</span>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted }}>
            <Icon n="x" size={22} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.4, color: C.muted, marginBottom: 10 }}>產業類別</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {INDUSTRIES.map((opt) => (
              <Pill key={opt} k="industry" v={opt} label={opt} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.4, color: C.muted, marginBottom: 10 }}>開發狀態</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(STATUS).map(([k, s]) => (
              <Pill key={k} k="status" v={k} bg={s.bg} fg={s.fg} label={s.label} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              setLocal({});
              onApply({});
              onClose();
            }}
            style={{ flex: 1, padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 15, cursor: "pointer" }}
          >
            清除
          </button>
          <button
            onClick={() => {
              onApply(local);
              onClose();
            }}
            className="pressable"
            style={{ flex: 2, padding: 13, borderRadius: 12, border: "none", background: C.primary, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            套用篩選
          </button>
        </div>
      </div>
    </>
  );
}

// ── AI 開發分析（本地規則引擎）────────────────────────
function analyzeBrands(brands: BrandVM[]): string {
  const active = brands.filter((b) => !["won", "lost"].includes(b.status));
  const stalled = active.filter((b) => (b.stage_days || 0) > 14);
  const reorder = brands.filter((b) => b.reorder_in_days != null && b.reorder_in_days <= 7);
  const pipe = Math.round(active.reduce((s, b) => s + ((b.est_annual || 0) * (b.probability || 0)) / 100, 0) / 10000);
  const winRate = brands.length ? Math.round((brands.filter((b) => b.status === "won").length / brands.length) * 100) : 0;

  const priority = [...active]
    .sort((a, b) => {
      const av = ((a.est_annual || 0) * (a.probability || 0)) / 100 + a.score * 1000;
      const bv = ((b.est_annual || 0) * (b.probability || 0)) / 100 + b.score * 1000;
      return bv - av;
    })
    .slice(0, 3);

  const lines: string[] = [];
  lines.push("【前 3 大優先跟進品牌】");
  priority.forEach((b, i) => {
    const reason: string[] = [];
    if (b.est_annual) reason.push(`年預估 NT$${(b.est_annual / 10000).toFixed(0)}萬`);
    if (b.probability) reason.push(`成交機率 ${b.probability}%`);
    if ((b.stage_days || 0) > 14) reason.push(`已停留 ${b.stage_days} 天需立即跟進`);
    if (b.score >= 90) reason.push(`評分 ${b.score} 屬高潛力名單`);
    lines.push(`${i + 1}. ${b.name}（${STATUS[b.status as StatusKey]?.label || b.status}）— ${reason.join("、") || "新名單，建議盡快首次接觸"}`);
  });

  lines.push("");
  lines.push("【整體管線健康度】");
  lines.push(`開發中 ${active.length} 筆、加權商機 NT$${pipe}萬、歷史成交率 ${winRate}%。`);
  if (stalled.length > 0) lines.push(`⚠ ${stalled.length} 筆商機停留超過 14 天（${stalled.map((b) => b.name).join("、")}），管線有阻塞風險。`);
  else lines.push("各階段流速正常，無明顯阻塞。");

  lines.push("");
  lines.push("【下週具體行動建議】");
  const actions: string[] = [];
  if (stalled.length) actions.push(`優先跟進停滯商機：${stalled[0].name}，主動詢問試用回饋並提出限時優惠。`);
  if (reorder.length) actions.push(`${reorder[0].name} 補貨日剩 ${reorder[0].reorder_in_days} 天，本週主動聯繫補貨並嘗試擴大月用量。`);
  const newOnes = active.filter((b) => b.status === "new");
  if (newOnes.length) actions.push(`新名單 ${newOnes.map((b) => b.name).join("、")} 尚未接觸，安排首次拜訪或 LINE 開場。`);
  while (actions.length < 3) actions.push("整理報價單模板與樣品庫存，縮短打樣→報價的週期。");
  actions.slice(0, 3).forEach((a, i) => lines.push(`${i + 1}. ${a}`));

  lines.push("");
  lines.push("【潛在風險提醒】");
  const lost = brands.filter((b) => b.status === "lost");
  if (lost.length) lines.push(`・${lost.map((b) => `${b.name}（${b.lost_reason || "原因未記錄"}）`).join("、")} 已流失，建議季度後重新接觸。`);
  if (stalled.length) lines.push("・打樣/報價停留過久會降低成交機率，建議設定 14 天自動提醒。");
  lines.push("・LINE/Email 覆蓋率未滿，部分品牌僅單一聯絡管道，存在斷聯風險。");

  return lines.join("\n");
}

// ── 批次匯入 Modal ────────────────────────────────────
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);

  const upload = async () => {
    if (!file || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brands/import", { method: "POST", body: fd });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setResult({
          ok: true,
          text: `匯入完成：新增 ${d.imported} 筆，略過 ${d.skipped} 筆（已存在或空白），${d.errors > 0 ? `失敗 ${d.errors} 筆` : "無失敗"}`,
          details: d.errorDetails,
        });
        onDone();
      } else {
        setResult({ ok: false, text: json.error || "匯入失敗" });
      }
    } catch {
      setResult({ ok: false, text: "網路錯誤" });
    }
    setLoading(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.35)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 610, width: "92vw", maxWidth: 460, background: C.surface, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,.2)", padding: "22px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>批次匯入品牌</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* 下載樣板 */}
        <a
          href="/api/brands/template"
          download
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: `1px dashed ${C.primary}80`, background: C.p50, color: C.primary, textDecoration: "none", fontSize: 13, fontWeight: 600, marginBottom: 16 }}
        >
          ↓ 下載匯入樣板 (.xlsx)
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontWeight: 400 }}>含欄位說明工作表</span>
        </a>

        {/* 上傳區 */}
        <div
          onClick={() => document.getElementById("import-file-input")?.click()}
          style={{ padding: "24px 16px", borderRadius: 12, border: `2px dashed ${file ? C.primary : C.border}`, background: file ? C.p50 : C.surf2, textAlign: "center", cursor: "pointer", marginBottom: 14, transition: "all 150ms" }}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>{file ? "📄" : "📁"}</div>
          <div style={{ fontSize: 13, color: file ? C.primary : C.muted, fontWeight: file ? 600 : 400 }}>
            {file ? file.name : "點擊選擇 .xlsx / .xls 檔案"}
          </div>
          {file && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{(file.size / 1024).toFixed(1)} KB</div>}
        </div>
        <input
          id="import-file-input"
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
        />

        {result && (
          <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 9, background: result.ok ? C.successBg : C.dangerBg, color: result.ok ? C.success : C.danger, fontSize: 13, lineHeight: 1.6 }}>
            {result.ok ? "✓ " : "✕ "}{result.text}
            {result.details && result.details.length > 0 && (
              <ul style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 11 }}>
                {result.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={upload}
            disabled={!file || loading}
            className="pressable"
            style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: !file || loading ? C.surf2 : C.primary, color: !file || loading ? C.muted : "white", fontSize: 14, fontWeight: 700, cursor: !file || loading ? "default" : "pointer" }}
          >
            {loading ? "匯入中…" : "開始匯入"}
          </button>
          <button onClick={onClose} style={{ padding: "11px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}>關閉</button>
        </div>
      </div>
    </>
  );
}

// ── 主頁面 ───────────────────────────────────────────
export default function LeadsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandVM[]>(SEED_BRANDS);
  const [usingApi, setUsingApi] = useState(false);
  const [selected, setSelected] = useState<BrandVM | null>(null);
  const [recorder, setRecorder] = useState<BrandVM | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          setBrands(
            result.data.map((b: Record<string, unknown>) => {
              // 管道：來自 brand_channels join，依固定順序排列
              const chRows = (Array.isArray(b.brand_channels) ? b.brand_channels : []) as { channel: string; value: string }[];
              const channelLinks: Record<string, string> = {};
              for (const c of chRows) if (c.channel && c.value) channelLinks[c.channel] = c.value;
              const channels = CHANNEL_ORDER.filter((ch) => channelLinks[ch]);
              // 城市：來自 stores join 的去重清單
              const storeRows = (Array.isArray(b.stores) ? b.stores : []) as { city: string | null }[];
              const cities = [...new Set(storeRows.map((s) => (s.city || "").replace(/[市縣]$/, "")).filter(Boolean))];
              return {
                id: b.id as string,
                name: (b.name as string) || "未命名",
                industry: (b.industry as string) || "其他",
                stores: (b.store_count as number) || 1,
                cities: cities.length ? cities.slice(0, 3).join("/") : "—",
                channels,
                channelLinks,
                score: (b.priority_score as number) ?? 50,
                status: (b.status as string) || "new",
                owner: b.owner_name as string | undefined,
                tax_id: b.tax_id as string | undefined,
              };
            })
          );
          setUsingApi(true);
        }
      })
      .catch(() => {});
  }, []);

  const exportXLS = () => {
    window.location.href = "/api/brands/export";
  };

  const runAI = () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiText("");
    // 本地規則分析（AI 顧問），保留思考感
    setTimeout(() => {
      setAiText(analyzeBrands(brands));
      setAiLoading(false);
    }, 800);
  };

  const changeStatus = (id: BrandVM["id"], status: string) => {
    setBrands((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
    if (usingApi) {
      fetch(`/api/brands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => {});
    }
  };

  const goDetail = (b: BrandVM) => {
    try {
      localStorage.setItem("heroherb_selected_brand", JSON.stringify(b));
    } catch {}
    router.push("/brands");
  };

  const addFilter = (k: keyof Filters, v: string) => setFilters((prev) => ({ ...prev, [k]: prev[k] === v ? undefined : v }));
  const removeFilter = (k: keyof Filters) =>
    setFilters((prev) => {
      const n = { ...prev };
      delete n[k];
      return n;
    });

  const visible = brands.filter((b) => {
    if (search && !b.name.includes(search) && !b.industry.includes(search)) return false;
    if (filters.industry && b.industry !== filters.industry) return false;
    if (filters.status && b.status !== filters.status) return false;
    return true;
  });

  const stats = {
    total: brands.length,
    active: brands.filter((b) => !["won", "lost"].includes(b.status)).length,
    won: brands.filter((b) => b.status === "won").length,
    pipe: Math.round(brands.reduce((s, b) => s + ((b.est_annual || 0) * (b.probability || 0)) / 100, 0) / 10000),
  };

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div className="d-only" style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>名單總覽</h1>
          <span style={{ fontSize: 13, color: C.muted }}>全部 {brands.length} 筆</span>
        </div>

        <div className="m-only" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.sidebar, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: 11, fontWeight: 800 }}>W</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>通路開發</span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 320, display: "flex", alignItems: "center", gap: 7, background: C.surf2, borderRadius: 10, padding: "9px 13px", border: `1px solid ${C.border}` }}>
          <Icon n="search" size={14} color={C.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋品牌或產業…"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, color: C.text, outline: "none" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>
              <Icon n="x" size={13} />
            </button>
          )}
        </div>

        <div className="d-only" style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <StatChip label="開發中" value={stats.active} color={C.primary} />
          <StatChip label="已成交" value={stats.won} color="#4A6B50" />
          <StatChip label="加權商機" value={`NT$${stats.pipe}萬`} color={C.accentDk} />
        </div>

        <button
          className="m-only"
          onClick={() => setFilterOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "9px 13px",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            background: "transparent",
            cursor: "pointer",
            color: C.muted,
            fontSize: 14,
            marginLeft: "auto",
          }}
        >
          <Icon n="filter" size={15} />
          篩選
        </button>

        <div className="d-only" style={{ display: "flex", gap: 7, marginLeft: 8 }}>
          <button
            onClick={() => setImportOpen(true)}
            className="pressable"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 13px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, color: C.muted, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            ↑ 匯入
          </button>
          <button
            onClick={exportXLS}
            className="pressable"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 13px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, color: C.muted, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            ↓ XLS
          </button>
          <a
            href="/api/brands/template"
            download
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 13px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, color: C.muted, textDecoration: "none", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            ↓ 樣板
          </a>
          <button
            onClick={runAI}
            className="pressable"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 13px", border: `1px solid ${C.primary}60`, borderRadius: 10, background: C.p50, color: C.primary, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            ✦ AI 分析
          </button>
          <button
            className="pressable"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "none", borderRadius: 10, background: C.primary, color: "white", cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            <Icon n="plus" size={14} color="white" />
            新增品牌
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onAdd={addFilter} onRemove={removeFilter} onOpenDrawer={() => setFilterOpen(true)} />

      {/* Results summary */}
      {(Object.values(filters).some(Boolean) || search) && (
        <div style={{ padding: "8px 20px", background: C.surf2, borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.muted, flexShrink: 0 }}>
          找到 <strong style={{ color: C.text }}>{visible.length}</strong> 筆，共 {brands.length} 筆
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>
        <div className="d-only">
          {visible.length > 0 ? <BrandTable brands={visible} onRowClick={setSelected} onStatusChange={changeStatus} /> : <Empty />}
        </div>
        <div className="m-only" style={{ padding: "12px 16px" }}>
          {visible.length > 0
            ? visible.map((b) => <BrandCard key={b.id} brand={b} onClick={() => setSelected(b)} onStatusChange={changeStatus} />)
            : <Empty />}
        </div>
      </div>

      <MobileTabBar />

      {/* Brand drawer */}
      {selected && (
        <BrandDrawer
          brand={selected}
          onClose={() => setSelected(null)}
          onRecord={() => {
            const b = selected;
            setSelected(null);
            setRecorder(b);
          }}
          onDetail={() => goDetail(selected)}
        />
      )}

      {/* AI 分析 Modal */}
      {aiOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(21,20,26,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: C.surface, borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(21,20,26,.22)" }}>
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>✦ AI 開發分析</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>基於目前 {brands.length} 筆品牌資料</div>
              </div>
              <button onClick={() => setAiOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1, padding: 4 }}>
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
              {aiLoading ? (
                <div style={{ textAlign: "center", padding: "50px 0" }}>
                  <div style={{ fontSize: 30, marginBottom: 14 }} className="spin">✦</div>
                  <div style={{ fontSize: 14, color: C.muted }}>分析中…</div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: C.text, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{aiText}</div>
              )}
            </div>
            {!aiLoading && aiText && (
              <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (!w) return;
                    w.document.write(
                      `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>AI 開發分析 — HeroHerb</title><style>body{font-family:'Noto Sans TC',sans-serif;padding:48px 56px;max-width:720px;margin:0 auto;color:#3D4A3E;line-height:1.9}h1{color:#3A5C57;margin-bottom:4px}p.sub{color:#6E7A6D;font-size:13px;margin-bottom:28px}pre{white-space:pre-wrap;font-family:inherit;font-size:15px}hr{border:none;border-top:1px solid #ECE8DF;margin:20px 0}@media print{body{padding:24px}}</style></head><body><h1>✦ HeroHerb 通路開發 AI 分析報告</h1><p class="sub">分析時間：${new Date().toLocaleDateString("zh-TW")}</p><hr/><pre>${aiText.replace(/</g, "&lt;")}</pre></body></html>`
                    );
                    w.document.close();
                    setTimeout(() => w.print(), 700);
                  }}
                  className="pressable"
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: C.sidebar, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  🖴 匯出 PDF
                </button>
                <button
                  onClick={() => setAiOpen(false)}
                  style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}
                >
                  關閉
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {recorder && <QuickRecord brand={recorder} onClose={() => setRecorder(null)} />}

      {filterOpen && <FilterDrawer filters={filters} onApply={(f) => setFilters(f)} onClose={() => setFilterOpen(false)} />}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            fetch("/api/brands")
              .then((r) => r.json())
              .then((result) => {
                if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                  setBrands(
                    result.data.map((b: Record<string, unknown>) => {
                      const chRows = (Array.isArray(b.brand_channels) ? b.brand_channels : []) as { channel: string; value: string }[];
                      const channelLinks: Record<string, string> = {};
                      for (const c of chRows) if (c.channel && c.value) channelLinks[c.channel] = c.value;
                      const channels = CHANNEL_ORDER.filter((ch) => channelLinks[ch]);
                      const storeRows = (Array.isArray(b.stores) ? b.stores : []) as { city: string | null }[];
                      const cities = [...new Set(storeRows.map((s) => (s.city || "").replace(/[市縣]$/, "")).filter(Boolean))];
                      return {
                        id: b.id as string,
                        name: (b.name as string) || "未命名",
                        industry: (b.industry as string) || "其他",
                        stores: (b.store_count as number) || 1,
                        cities: cities.length ? cities.slice(0, 3).join("/") : "—",
                        channels,
                        channelLinks,
                        score: (b.priority_score as number) ?? 50,
                        status: (b.status as string) || "new",
                        owner: b.owner_name as string | undefined,
                        tax_id: b.tax_id as string | undefined,
                      };
                    })
                  );
                  setUsingApi(true);
                }
              })
              .catch(() => {});
          }}
        />
      )}
    </>
  );
}
