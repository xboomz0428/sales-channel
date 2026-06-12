"use client";

import { useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { C, STATUS, StatusKey } from "@/lib/design";
import Icon from "@/components/Icon";
import MobileTabBar from "@/components/MobileTabBar";

// ── 預設品牌（未從名單帶入時顯示）─────────────────────
interface BrandDetail {
  id?: string | number;
  name: string;
  industry: string;
  stores: number;
  cities: string;
  channels: string[];
  score: number;
  status: string;
  tax_id?: string;
  owner?: string;
  industry_code?: string;
  est_annual?: number;
  probability?: number;
  stage_days?: number;
  pitch?: string;
}

const BRAND_DEFAULT: BrandDetail = {
  name: "6星集足體養生會館",
  industry: "養生館",
  stores: 9,
  cities: "北/中/南",
  channels: ["line", "fb", "ig", "email"],
  score: 92,
  status: "quoting",
  tax_id: "16830000",
  owner: "江○○",
  industry_code: "9640",
  est_annual: 1800000,
  probability: 60,
  stage_days: 12,
  pitch: "連鎖養生館高頻耗材，員工足浴需求穩定，建議先從 3 個主力門市試跑，談定期採購合約。",
};

interface ContactItem {
  id: number | string;
  name: string;
  title?: string;
  role: string;
  mobile?: string;
  line?: string;
  note?: string;
}

const CONTACTS_SEED: ContactItem[] = [
  { id: 1, name: "林明美", title: "採購主管", role: "decision_maker", mobile: "0912-345-678", line: "@mingmei", note: "月底開採購會，建議本週寄報價" },
  { id: 2, name: "陳志文", title: "大安店長", role: "gatekeeper", mobile: "0923-456-789", note: "可請他幫忙引薦總部採購" },
];

interface LogItem {
  id: number | string;
  date: string;
  ch: string;
  summary: string;
  next?: string;
}

const LOGS_SEED: LogItem[] = [
  { id: 3, date: "6/8", ch: "visit", summary: "門市拜訪，展示完整產品線，試泡反應正面，要求正式報價單", next: "寄報價單 6/18前" },
  { id: 2, date: "6/1", ch: "phone", summary: "確認樣品已到貨，安排兩週試用期，約定 6/8 門市拜訪" },
  { id: 1, date: "5/28", ch: "line", summary: "初次聯繫，對艾草足浴包有興趣，詢問是否有樣品可試", next: "寄樣品" },
];

const CH_CFG: Record<string, { label: string; bg: string }> = {
  line: { label: "LINE", bg: "#06C755" },
  fb: { label: "FB", bg: "#1877F2" },
  ig: { label: "IG", bg: "#C13584" },
  email: { label: "Email", bg: "#8FAAA4" },
};
const LOG_EM: Record<string, string> = { visit: "📍", phone: "📞", line: "💬", email: "✉️" };
const ROLE_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  decision_maker: { label: "決策者", bg: "#EDF3F2", fg: "#5E8880" },
  gatekeeper: { label: "守門人", bg: "#F5EDDD", fg: "#A6824A" },
};

function Badge({ status }: { status: string }) {
  const s = STATUS[status as StatusKey] || STATUS.new;
  return (
    <span style={{ padding: "4px 11px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 12, fontWeight: 700, display: "inline-block" }}>
      {s.label}
    </span>
  );
}

function Sec({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: 14, overflow: "hidden" }}>
      {title && (
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted }}>{title}</span>
          {action}
        </div>
      )}
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function IRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, color: C.muted, minWidth: 68, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: C.text, fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

// ── 第一欄：基本資料 ─────────────────────────────────
function Col1({ brand }: { brand: BrandDetail }) {
  return (
    <div>
      <div style={{ background: C.sidebar, borderRadius: 16, padding: "18px 18px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: "white" }}>{brand.name[0]}</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "white", lineHeight: 1.3 }}>{brand.name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 2 }}>
              {brand.industry} · {brand.stores}間 · {brand.cities}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Badge status={brand.status} />
          <span style={{ padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,.15)", color: "white", fontSize: 12, fontWeight: 600 }}>
            評分 {brand.score}
          </span>
        </div>
      </div>

      <div className="d-only" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <a
          href="tel:+886"
          className="pressable"
          style={{ flex: 1, padding: 11, borderRadius: 12, background: C.surf2, color: C.text, textDecoration: "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Icon n="phone" size={14} color={C.primary} />
          撥號
        </a>
        <a
          href="https://line.me"
          target="_blank"
          rel="noopener"
          className="pressable"
          style={{ flex: 1, padding: 11, borderRadius: 12, background: "#06C75515", color: "#06C755", textDecoration: "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          💬 LINE
        </a>
      </div>

      <Sec title="基本資料">
        <IRow label="統一編號" value={brand.tax_id || "—"} mono />
        <IRow label="負責人" value={brand.owner || "—"} />
        <IRow label="行業代號" value={brand.industry_code || "—"} />
        <IRow label="分店數" value={`${brand.stores} 間`} />
        <IRow label="城市" value={brand.cities} />
      </Sec>

      <Sec title="聯絡管道">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {brand.channels.map((ch) => {
            const cfg = CH_CFG[ch] || { label: ch, bg: "#aaa" };
            return (
              <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, background: C.surf2, border: `1px solid ${C.border}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontSize: 8, fontWeight: 700 }}>{cfg.label.slice(0, 2)}</span>
                </div>
                <span style={{ fontSize: 13, color: C.text }}>{cfg.label}</span>
                <span style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>已驗證</span>
              </div>
            );
          })}
        </div>
      </Sec>

      <Sec title="建議切入點">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>{brand.pitch || "尚無建議，可由 AI 分析產生。"}</p>
      </Sec>
    </div>
  );
}

// ── 第二欄：聯絡窗口 + 商機概況 ───────────────────────
function Col2({ brand, contacts }: { brand: BrandDetail; contacts: ContactItem[] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted }}>聯絡窗口</span>
        <button
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 12, color: C.primary, fontWeight: 600 }}
        >
          <Icon n="plus" size={13} color={C.primary} />
          新增
        </button>
      </div>
      {contacts.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18, marginBottom: 10, textAlign: "center", color: C.muted, fontSize: 13 }}>
          尚無聯絡窗口
        </div>
      )}
      {contacts.map((c) => {
        const role = ROLE_CFG[c.role] || ROLE_CFG.gatekeeper;
        return (
          <div key={c.id} style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: C.p50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 15, color: C.primary, fontWeight: 700 }}>{c.name[0]}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{c.title}</div>
                </div>
              </div>
              <span style={{ padding: "3px 9px", borderRadius: 999, background: role.bg, color: role.fg, fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                {role.label}
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: c.note ? 8 : 0 }}>
              {c.mobile && <span style={{ fontSize: 12, color: C.muted }}>📞 {c.mobile}</span>}
              {c.line && <span style={{ fontSize: 12, color: "#06C755", fontWeight: 500 }}>💬 {c.line}</span>}
            </div>
            {c.note && <div style={{ fontSize: 12, color: C.muted, background: C.surf2, borderRadius: 8, padding: "6px 10px" }}>{c.note}</div>}
          </div>
        );
      })}

      <div style={{ marginTop: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted, display: "block", marginBottom: 12 }}>
          商機概況
        </span>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>預估年營收</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              {brand.est_annual ? `NT$${(brand.est_annual / 10000).toFixed(0)}萬` : "—"}
            </div>
          </div>
          <div style={{ flex: 1, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>成交機率</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.primary }}>{brand.probability ? `${brand.probability}%` : "—"}</div>
          </div>
        </div>
        {(brand.stage_days || 0) > 0 && (
          <div style={{ padding: "9px 12px", borderRadius: 10, background: `${C.danger}18`, display: "flex", alignItems: "center", gap: 7 }}>
            <Icon n="clock" size={14} color={C.danger} />
            <span style={{ fontSize: 12, color: C.danger }}>
              已在{STATUS[brand.status as StatusKey]?.label || "此階段"} <strong>{brand.stage_days}</strong> 天
              {(brand.stage_days || 0) > 14 ? " — 建議本週跟進" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 第三欄：時間軸 ───────────────────────────────────
function Col3({
  brand,
  logs,
  onAddLog,
}: {
  brand: BrandDetail;
  logs: LogItem[];
  onAddLog: (text: string) => void;
}) {
  const [nextDate, setNextDate] = useState("2026-06-18");
  const [nextNote, setNextNote] = useState("寄正式報價單，附帶採購建議方案");
  const [addOpen, setAddOpen] = useState(false);
  const [newLog, setNewLog] = useState("");

  return (
    <div>
      <div style={{ background: C.p50, borderRadius: 16, border: `1px solid ${C.primary}40`, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.primary, marginBottom: 10 }}>下次跟進</div>
        <input
          type="date"
          value={nextDate}
          onChange={(e) => setNextDate(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: "white", fontSize: 14, color: C.text, marginBottom: 8, outline: "none" }}
        />
        <input
          value={nextNote}
          onChange={(e) => setNextNote(e.target.value)}
          placeholder="跟進事項…"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: "white", fontSize: 14, color: C.text, outline: "none" }}
        />
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted, marginBottom: 12 }}>聯繫紀錄</div>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 14, top: 0, bottom: 0, width: 1, background: C.border }} />
        {logs.map((log) => (
          <div key={log.id} style={{ display: "flex", gap: 14, marginBottom: 18, position: "relative" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface, border: `2px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, fontSize: 13 }}>
              {LOG_EM[log.ch] || "•"}
            </div>
            <div style={{ flex: 1, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
                <strong style={{ color: C.text, fontSize: 12 }}>{log.date}</strong>
                <span style={{ padding: "1px 7px", borderRadius: 999, background: C.surf2, color: C.muted, fontSize: 10 }}>{log.ch}</span>
              </div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>{log.summary}</div>
              {log.next && <div style={{ fontSize: 12, color: C.primary, marginTop: 6, fontWeight: 500 }}>→ {log.next}</div>}
            </div>
          </div>
        ))}

        {addOpen ? (
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.p50, border: `2px solid ${C.primary}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, fontSize: 12 }}>
              ✏️
            </div>
            <div style={{ flex: 1, background: C.surface, borderRadius: 12, border: `1px solid ${C.primary}50`, padding: "12px 14px" }}>
              <textarea
                rows={2}
                value={newLog}
                onChange={(e) => setNewLog(e.target.value)}
                placeholder="記錄這次聯繫的重點…"
                style={{ width: "100%", border: "none", background: "transparent", fontSize: 14, color: C.text, lineHeight: 1.6, resize: "none", outline: "none" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    if (newLog.trim()) onAddLog(newLog.trim());
                    setAddOpen(false);
                    setNewLog("");
                  }}
                  style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  儲存
                </button>
                <button
                  onClick={() => setAddOpen(false)}
                  style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surf2, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
              <Icon n="plus" size={13} color={C.muted} />
            </div>
            <button
              onClick={() => setAddOpen(true)}
              style={{ flex: 1, padding: "9px 14px", borderRadius: 12, border: `1px dashed ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 14, color: C.muted, textAlign: "left" }}
            >
              新增聯繫紀錄…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 主頁面 ───────────────────────────────────────────
export default function BrandDetailPage() {
  const [brand, setBrand] = useState<BrandDetail>(BRAND_DEFAULT);
  const [contacts, setContacts] = useState<ContactItem[]>(CONTACTS_SEED);
  const [logs, setLogs] = useState<LogItem[]>(LOGS_SEED);
  const [tab, setTab] = useState<"info" | "contacts" | "logs">("info");

  // 從名單總覽帶入選取的品牌；若有 API id 則載入完整資料
  useEffect(() => {
    let picked: BrandDetail | null = null;
    try {
      const s = localStorage.getItem("heroherb_selected_brand");
      if (s) {
        const d = JSON.parse(s);
        const merged: BrandDetail = { ...BRAND_DEFAULT, ...d, channels: Array.isArray(d.channels) ? d.channels : BRAND_DEFAULT.channels };
        picked = merged;
        setBrand(merged);
      }
    } catch {}

    if (picked?.id && typeof picked.id === "string") {
      fetch(`/api/brands/${picked.id}`)
        .then((r) => r.json())
        .then((result) => {
          if (!result.success) return;
          const { brand: b, contacts: cs, outreach } = result.data;
          if (b) {
            setBrand((prev) => ({
              ...prev,
              name: b.name || prev.name,
              industry: b.industry || prev.industry,
              stores: b.store_count || prev.stores,
              status: b.status || prev.status,
              tax_id: b.tax_id || prev.tax_id,
              owner: b.owner_name || prev.owner,
              score: b.priority_score ?? prev.score,
            }));
          }
          if (Array.isArray(cs) && cs.length > 0) {
            setContacts(
              cs.map((c: Record<string, unknown>) => ({
                id: c.id as string,
                name: (c.name as string) || "未命名",
                title: c.title as string | undefined,
                role: "gatekeeper",
                mobile: c.mobile as string | undefined,
                line: c.line_id as string | undefined,
              }))
            );
          }
          if (Array.isArray(outreach) && outreach.length > 0) {
            setLogs(
              outreach.map((o: Record<string, unknown>) => {
                const d = new Date(o.created_at as string);
                return {
                  id: o.id as string,
                  date: `${d.getMonth() + 1}/${d.getDate()}`,
                  ch: (o.channel as string) || "phone",
                  summary: (o.summary as string) || "",
                };
              })
            );
          }
        })
        .catch(() => {});
    }
  }, []);

  const addLog = async (text: string) => {
    const now = new Date();
    setLogs((prev) => [{ id: `local-${Date.now()}`, date: `${now.getMonth() + 1}/${now.getDate()}`, ch: "visit", summary: text }, ...prev]);
    if (brand.id && typeof brand.id === "string") {
      fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brand.id, channel: "visit", summary: text }),
      }).catch(() => {});
    }
  };

  const exportContactsCSV = () => {
    const hdrs = ["姓名", "職稱", "角色", "手機", "備註"];
    const rows = contacts.map((c) => [c.name, c.title || "", c.role, c.mobile || "", c.note || ""]);
    const csv = [hdrs, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,﻿" + encodeURIComponent(csv);
    a.download = "HeroHerb_品牌詳情_窗口.csv";
    a.click();
  };

  const tabs = [
    { id: "info" as const, label: "資料" },
    { id: "contacts" as const, label: "窗口" },
    { id: "logs" as const, label: "紀錄" },
  ];

  return (
    <>
      {/* Mobile header */}
      <div className="m-only" style={{ background: C.sidebar, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/leads" style={{ color: "rgba(255,255,255,.7)", fontSize: 22, textDecoration: "none", lineHeight: 1 }}>
            ‹
          </Link>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "white" }}>{brand.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>
              {brand.industry} · {brand.stores}間
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="tel:+886" style={{ padding: "9px 14px", borderRadius: 10, background: "rgba(255,255,255,.15)", color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon n="phone" size={13} color="white" />
            撥號
          </a>
          <a href="https://line.me" target="_blank" rel="noopener" style={{ padding: "9px 14px", borderRadius: 10, background: "#06C755", color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            LINE
          </a>
        </div>
      </div>

      {/* Desktop breadcrumb */}
      <div className="d-only" style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Link href="/leads" style={{ color: C.muted, textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
          <Icon n="chL" size={14} color={C.muted} />
          名單總覽
        </Link>
        <span style={{ color: C.border }}>/</span>
        <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{brand.name}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={exportContactsCSV}
            className="pressable"
            style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ↓ CSV
          </button>
          <Badge status={brand.status} />
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="m-only" style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? C.primary : C.muted,
              borderBottom: `2px solid ${tab === t.id ? C.primary : "transparent"}`,
              transition: "all 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, paddingBottom: 80 }}>
        <div className="d-only" style={{ display: "flex", gap: 20, alignItems: "flex-start", maxWidth: 1100 }}>
          <div style={{ width: 260, flexShrink: 0 }}>
            <Col1 brand={brand} />
          </div>
          <div style={{ width: 280, flexShrink: 0 }}>
            <Col2 brand={brand} contacts={contacts} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Col3 brand={brand} logs={logs} onAddLog={addLog} />
          </div>
        </div>
        <div className="m-only">
          {tab === "info" && <Col1 brand={brand} />}
          {tab === "contacts" && <Col2 brand={brand} contacts={contacts} />}
          {tab === "logs" && <Col3 brand={brand} logs={logs} onAddLog={addLog} />}
        </div>
      </div>

      <MobileTabBar />
    </>
  );
}
