"use client";

import { useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { C, STATUS, StatusKey, CHANNELS, CHANNEL_ORDER, channelHref } from "@/lib/design";
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
  registered_name?: string;
  owner?: string;
  capital?: number;
  setup_date?: string;
  company_address?: string;
  industry_code?: string;
  gmaps_url?: string;
  store_addresses?: string[];
  est_annual?: number;
  probability?: number;
  stage_days?: number;
  pitch?: string;
}

const BRAND_DEFAULT: BrandDetail = {
  name: "—",
  industry: "",
  stores: 0,
  cities: "—",
  channels: [],
  score: 50,
  status: "new",
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


interface LogItem {
  id: number | string;
  date: string;
  ch: string;
  summary: string;
  next?: string;
}


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

// 民國日期 "1051018" → "民國105年10月18日"
function fmtRocDate(s: string): string {
  const m = s.replace(/\D/g, "").match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!m) return s;
  return `民國${m[1]}年${parseInt(m[2])}月${parseInt(m[3])}日`;
}

function IRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, color: C.muted, minWidth: 68, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: C.text, fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

function isSameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/[台臺]/g, "台").replace(/[\s　]/g, "").replace(/[之\-－—–]/g, "");
  const na = norm(a), nb = norm(b);
  return na.includes(nb) || nb.includes(na);
}

// ── 第一欄：基本資料 ─────────────────────────────────
function Col1({ brand, channelLinks, onEditReg, onAddChannel, onEditChannel, onDeleteChannel }: {
  brand: BrandDetail;
  channelLinks: Record<string, string>;
  onEditReg: () => void;
  onAddChannel: () => void;
  onEditChannel: (ch: string, val: string) => void;
  onDeleteChannel: (ch: string) => void;
}) {
  const phoneVal = channelLinks.phone;
  const lineVal = channelLinks.line;

  const allChannels = Object.keys(channelLinks).length > 0
    ? CHANNEL_ORDER.filter((ch) => channelLinks[ch]).concat(
        Object.keys(channelLinks).filter((ch) => !CHANNEL_ORDER.includes(ch) && channelLinks[ch])
      )
    : brand.channels;

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
          href={phoneVal ? `tel:${phoneVal.replace(/[^+\d]/g, "")}` : "tel:+886"}
          className="pressable"
          style={{ flex: 1, padding: 11, borderRadius: 12, background: C.surf2, color: C.text, textDecoration: "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Icon n="phone" size={14} color={C.primary} />
          {phoneVal || "撥號"}
        </a>
        {lineVal && (
          <a
            href={channelHref("line", lineVal)}
            target="_blank"
            rel="noopener"
            className="pressable"
            style={{ flex: 1, padding: 11, borderRadius: 12, background: "#06C75515", color: "#06C755", textDecoration: "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            💬 LINE
          </a>
        )}
      </div>

      <Sec title="工商登記" action={
        <button onClick={onEditReg} className="pressable" style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 11, color: C.primary, fontWeight: 600 }}>
          <Icon n="edit" size={11} color={C.primary} />編輯
        </button>
      }>
        {brand.registered_name && <IRow label="公司名稱" value={brand.registered_name} />}
        <IRow label="統一編號" value={brand.tax_id || "—"} mono />
        <IRow label="負責人" value={brand.owner || "—"} />
        {phoneVal && <IRow label="電話" value={phoneVal} />}
        {brand.capital != null && <IRow label="資本額" value={`NT$${brand.capital.toLocaleString()}`} />}
        {brand.setup_date && <IRow label="成立時間" value={fmtRocDate(brand.setup_date)} />}
        {brand.company_address && <IRow label="登記地址" value={brand.company_address} />}
        {brand.industry_code && <IRow label="行業代號" value={brand.industry_code} />}
      </Sec>

      <Sec title="門市概況">
        <IRow label="分店數" value={`${brand.stores} 間`} />
        {brand.cities !== "—" && <IRow label="城市" value={brand.cities} />}
        {brand.store_addresses && brand.store_addresses
          .filter((a) => !isSameAddress(a, brand.company_address))
          .slice(0, 3)
          .map((addr, i) => <IRow key={i} label={i === 0 ? "門市地址" : ""} value={addr} />)}
        {brand.gmaps_url && (
          <IRow
            label="地圖連結"
            value={
              <a href={brand.gmaps_url} target="_blank" rel="noopener noreferrer"
                style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                ↗ Google 地圖
              </a>
            }
          />
        )}
      </Sec>

      <Sec title="聯絡管道" action={
        <button onClick={onAddChannel} className="pressable" style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 11, color: C.primary, fontWeight: 600 }}>
          <Icon n="plus" size={11} color={C.primary} />新增
        </button>
      }>
        {allChannels.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted }}>尚未採集聯絡管道</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allChannels.map((ch) => {
              const cfg = CHANNELS[ch] || { label: ch, bg: "#aaa", abbr: ch.slice(0, 3).toUpperCase() };
              const value = channelLinks[ch];
              const href = value ? channelHref(ch, value) : null;
              const displayVal = value
                ? ch === "email" ? value
                  : ch === "phone" ? value
                  : value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 40)
                : null;
              return (
                <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, background: C.surf2, border: `1px solid ${C.border}` }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "white", fontSize: 8, fontWeight: 700 }}>{cfg.abbr}</span>
                  </div>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 600, minWidth: 36 }}>{cfg.label}</span>
                  {displayVal && (
                    <span style={{ fontSize: 12, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.muted, textDecoration: "none" }}>{displayVal} ↗</a> : displayVal}
                    </span>
                  )}
                  <button onClick={() => onEditChannel(ch, value || "")} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 12, padding: "2px 4px", flexShrink: 0 }} title="編輯">✏️</button>
                  <button onClick={() => onDeleteChannel(ch)} style={{ border: "none", background: "none", cursor: "pointer", color: C.danger, fontSize: 12, padding: "2px 4px", flexShrink: 0 }} title="刪除">🗑</button>
                </div>
              );
            })}
          </div>
        )}
      </Sec>

      {brand.pitch && (
        <Sec title="建議切入點">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>{brand.pitch}</p>
        </Sec>
      )}
    </div>
  );
}

// ── 工商登記 編輯 Modal ──────────────────────────────
function EditRegistrationModal({
  brandId,
  initial,
  onClose,
  onSaved,
}: {
  brandId: string;
  initial: Partial<BrandDetail>;
  onClose: () => void;
  onSaved: (patch: Partial<BrandDetail>) => void;
}) {
  const [form, setForm] = useState({
    registered_name: initial.registered_name || "",
    tax_id: initial.tax_id || "",
    owner: initial.owner || "",
    capital: initial.capital != null ? String(initial.capital) : "",
    setup_date: initial.setup_date || "",
    company_address: initial.company_address || "",
    industry_code: initial.industry_code || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const patch: Record<string, unknown> = {};
      if (form.registered_name) patch.registered_name = form.registered_name;
      if (form.tax_id) patch.tax_id = form.tax_id;
      if (form.owner) patch.owner_name = form.owner;
      if (form.capital) patch.capital = Number(form.capital) || 0;
      if (form.setup_date) patch.setup_date = form.setup_date;
      if (form.company_address) patch.company_address = form.company_address;
      if (form.industry_code) patch.industry_code = form.industry_code;
      const res = await fetch(`/api/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) { setErr(json.error || "儲存失敗"); setSaving(false); return; }
      onSaved({
        registered_name: form.registered_name || undefined,
        tax_id: form.tax_id || undefined,
        owner: form.owner || undefined,
        capital: form.capital ? Number(form.capital) : undefined,
        setup_date: form.setup_date || undefined,
        company_address: form.company_address || undefined,
        industry_code: form.industry_code || undefined,
      });
      onClose();
    } catch { setErr("網路錯誤"); }
    setSaving(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.3)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 610, width: "92vw", maxWidth: 440, maxHeight: "86vh", overflowY: "auto", background: C.surface, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,.18)", padding: "22px 22px 18px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 18 }}>編輯工商登記</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>公司名稱</div>
            <input value={form.registered_name} onChange={(e) => set("registered_name", e.target.value)} placeholder="XX有限公司" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>統一編號</div>
              <input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="12345678" maxLength={8} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>負責人</div>
              <input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="王大明" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>資本額</div>
              <input value={form.capital} onChange={(e) => set("capital", e.target.value)} placeholder="1000000" type="number" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>行業代號</div>
              <input value={form.industry_code} onChange={(e) => set("industry_code", e.target.value)} placeholder="J610" style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>成立時間（民國，如 1051018）</div>
            <input value={form.setup_date} onChange={(e) => set("setup_date", e.target.value)} placeholder="1051018" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>登記地址</div>
            <input value={form.company_address} onChange={(e) => set("company_address", e.target.value)} placeholder="台北市大安區..." style={inputStyle} />
          </div>
        </div>
        {err && <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8, background: C.dangerBg, color: C.danger, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}>取消</button>
        </div>
      </div>
    </>
  );
}

// ── 聯絡管道 編輯 Modal ──────────────────────────────
const CHANNEL_TYPES = [
  { key: "phone", label: "電話", placeholder: "02-1234-5678" },
  { key: "email", label: "Email", placeholder: "info@example.com" },
  { key: "line", label: "LINE", placeholder: "https://line.me/... 或 @id" },
  { key: "fb", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "ig", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "website", label: "官網", placeholder: "https://..." },
  { key: "map", label: "地圖", placeholder: "https://maps.google.com/..." },
];

function EditChannelModal({
  brandId,
  initial,
  onClose,
  onSaved,
}: {
  brandId: string;
  initial?: { channel: string; value: string };
  onClose: () => void;
  onSaved: (ch: string, val: string) => void;
}) {
  const [channel, setChannel] = useState(initial?.channel || "phone");
  const [value, setValue] = useState(initial?.value || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box" as const };

  const save = async () => {
    if (!value.trim()) { setErr("請輸入內容"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, value: value.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setErr(json.error || "儲存失敗"); setSaving(false); return; }
      onSaved(channel, value.trim());
      onClose();
    } catch { setErr("網路錯誤"); }
    setSaving(false);
  };

  const placeholder = CHANNEL_TYPES.find((t) => t.key === channel)?.placeholder || "";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.3)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 610, width: "92vw", maxWidth: 400, background: C.surface, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,.18)", padding: "22px 22px 18px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 18 }}>{initial ? "編輯管道" : "新增管道"}</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>管道類型</div>
          {initial ? (
            <div style={{ padding: "9px 12px", borderRadius: 9, background: C.surf2, fontSize: 14, color: C.text }}>
              {CHANNEL_TYPES.find((t) => t.key === channel)?.label || channel}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CHANNEL_TYPES.map((t) => (
                <button key={t.key} onClick={() => setChannel(t.key)}
                  style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: channel === t.key ? 700 : 400, border: `1px solid ${channel === t.key ? C.primary : C.border}`, background: channel === t.key ? C.p50 : "transparent", color: channel === t.key ? C.primary : C.muted, cursor: "pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>內容</div>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus style={inputStyle} />
        </div>
        {err && <div style={{ marginBottom: 10, padding: "7px 10px", borderRadius: 8, background: C.dangerBg, color: C.danger, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}>取消</button>
        </div>
      </div>
    </>
  );
}

// ── 聯絡窗口 表單 Modal ──────────────────────────────
function ContactModal({
  brandId,
  initial,
  onClose,
  onSaved,
}: {
  brandId: string;
  initial?: ContactItem;
  onClose: () => void;
  onSaved: (c: ContactItem) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<Omit<ContactItem, "id">>({
    name: initial?.name ?? "",
    title: initial?.title ?? "",
    role: initial?.role ?? "gatekeeper",
    mobile: initial?.mobile ?? "",
    line: initial?.line ?? "",
    note: initial?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("姓名為必填"); return; }
    setSaving(true); setErr(null);
    try {
      const url = isEdit ? `/api/contacts/${initial!.id}` : "/api/contacts";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, name: form.name, title: form.title, role: form.role, mobile: form.mobile, email: undefined, line_id: form.line, note: form.note }),
      });
      const json = await res.json();
      if (!json.success) { setErr(json.error || "儲存失敗"); setSaving(false); return; }
      onSaved({ id: json.data?.id ?? initial?.id ?? Date.now(), ...form });
      onClose();
    } catch { setErr("網路錯誤"); }
    setSaving(false);
  };

  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surf2, fontSize: 14, color: C.text, outline: "none" };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,.3)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 610, width: "92vw", maxWidth: 420, background: C.surface, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,.18)", padding: "22px 22px 18px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 18 }}>{isEdit ? "編輯聯絡窗口" : "新增聯絡窗口"}</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>姓名 *</div>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="王大明" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>職稱</div>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="採購主管" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>角色</div>
          <div style={{ display: "flex", gap: 8 }}>
            {Object.entries(ROLE_CFG).map(([k, v]) => (
              <button key={k} onClick={() => set("role", k)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${form.role === k ? v.fg : C.border}`, background: form.role === k ? v.bg : "transparent", color: form.role === k ? v.fg : C.muted, fontSize: 13, fontWeight: form.role === k ? 700 : 400, cursor: "pointer" }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>手機</div>
            <input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="0912-345-678" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>LINE ID</div>
            <input value={form.line} onChange={(e) => set("line", e.target.value)} placeholder="@xxx" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>備註</div>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="例：月底開採購會" style={{ ...inputStyle, resize: "none" }} />
        </div>
        {err && <div style={{ marginBottom: 10, padding: "7px 10px", borderRadius: 8, background: C.dangerBg, color: C.danger, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}>取消</button>
        </div>
      </div>
    </>
  );
}

// ── 第二欄：聯絡窗口 + 商機概況 ───────────────────────
function Col2({
  brand,
  contacts,
  onAdd,
  onEdit,
  onDelete,
}: {
  brand: BrandDetail;
  contacts: ContactItem[];
  onAdd: () => void;
  onEdit: (c: ContactItem) => void;
  onDelete: (id: number | string) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted }}>聯絡窗口</span>
        <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 12, color: C.primary, fontWeight: 600 }}>
          <Icon n="plus" size={13} color={C.primary} />新增
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
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <span style={{ padding: "3px 9px", borderRadius: 999, background: role.bg, color: role.fg, fontSize: 11, fontWeight: 700 }}>{role.label}</span>
                <button onClick={() => onEdit(c)} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "2px 4px" }} title="編輯">✏️</button>
                <button onClick={() => onDelete(c.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.danger, fontSize: 14, padding: "2px 4px" }} title="刪除">🗑</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: c.note ? 8 : 0 }}>
              {c.mobile && <a href={`tel:${c.mobile}`} style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}>📞 {c.mobile}</a>}
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
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [channelLinks, setChannelLinks] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"info" | "contacts" | "logs">("info");
  const [contactModal, setContactModal] = useState<{ mode: "add" | "edit"; contact?: ContactItem } | null>(null);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [channelModal, setChannelModal] = useState<{ channel: string; value: string } | "add" | null>(null);

  // 從名單總覽帶入選取的品牌；若有 API id 則載入完整資料
  useEffect(() => {
    let picked: BrandDetail | null = null;
    try {
      const s = localStorage.getItem("heroherb_selected_brand");
      if (s) {
        const d = JSON.parse(s);
        const merged: BrandDetail = { ...BRAND_DEFAULT, ...d, channels: Array.isArray(d.channels) ? d.channels : [] };
        picked = merged;
        setBrand(merged);
        // channelLinks from leads page
        if (d.channelLinks && typeof d.channelLinks === "object") {
          setChannelLinks(d.channelLinks);
        }
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
              registered_name: b.registered_name || prev.registered_name,
              owner: b.owner_name || prev.owner,
              capital: b.capital ?? prev.capital,
              setup_date: b.setup_date || prev.setup_date,
              company_address: b.company_address || prev.company_address,
              industry_code: b.industry_code || prev.industry_code,
              pitch: b.pitch || prev.pitch,
              score: b.priority_score ?? prev.score,
            }));
          }
          // 從門市資料補齊 cities、gmaps_url、store_addresses
          if (Array.isArray(result.data.stores)) {
            type StoreRow = { city?: string | null; gmaps_url?: string | null; address?: string | null };
            const storeList = result.data.stores as StoreRow[];
            const citiesList = [...new Set(
              storeList.map((s) => (s.city || "").replace(/[市縣]$/, "")).filter(Boolean)
            )];
            const gmapsUrl = storeList.find((s) => s.gmaps_url)?.gmaps_url;
            const storeAddresses = [...new Set(storeList.map((s) => s.address).filter(Boolean))] as string[];
            setBrand((prev) => ({
              ...prev,
              cities: citiesList.length ? citiesList.slice(0, 3).join("/") : prev.cities,
              gmaps_url: gmapsUrl || prev.gmaps_url,
              store_addresses: storeAddresses.length ? storeAddresses : prev.store_addresses,
            }));
          }
          if (Array.isArray(cs)) {
            setContacts(
              cs.map((c: Record<string, unknown>) => ({
                id: c.id as string,
                name: (c.name as string) || "未命名",
                title: c.title as string | undefined,
                role: (c.role as string) || "gatekeeper",
                mobile: c.mobile as string | undefined,
                line: c.line_id as string | undefined,
                note: c.note as string | undefined,
              }))
            );
          }
          if (Array.isArray(outreach)) {
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
          if (Array.isArray(result.data.channels)) {
            const links: Record<string, string> = {};
            for (const c of result.data.channels as { channel: string; value: string }[]) {
              if (c.channel && c.value) links[c.channel] = c.value;
            }
            setChannelLinks(links);
            // 更新 brand.channels 列表
            setBrand((prev) => ({ ...prev, channels: Object.keys(links) }));
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

  const handleContactSaved = (c: ContactItem) => {
    setContacts((prev) => {
      const idx = prev.findIndex((x) => x.id === c.id);
      return idx >= 0 ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c];
    });
  };

  const handleDeleteContact = async (id: number | string) => {
    if (!confirm("確定刪除此聯絡窗口？")) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
    if (typeof id === "string") {
      await fetch(`/api/contacts/${id}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const handleRegSaved = (patch: Partial<BrandDetail>) => {
    setBrand((prev) => ({ ...prev, ...patch }));
  };

  const handleChannelSaved = (ch: string, val: string) => {
    setChannelLinks((prev) => ({ ...prev, [ch]: val }));
    setBrand((prev) => ({ ...prev, channels: [...new Set([...prev.channels, ch])] }));
  };

  const handleDeleteChannel = async (ch: string) => {
    if (!confirm(`確定刪除「${CHANNELS[ch]?.label || ch}」管道？`)) return;
    setChannelLinks((prev) => { const n = { ...prev }; delete n[ch]; return n; });
    setBrand((prev) => ({ ...prev, channels: prev.channels.filter((c) => c !== ch) }));
    if (brand.id && typeof brand.id === "string") {
      await fetch(`/api/brands/${brand.id}/channels`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch }),
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
          <div style={{ width: 280, flexShrink: 0 }}>
            <Col1 brand={brand} channelLinks={channelLinks} onEditReg={() => setRegModalOpen(true)} onAddChannel={() => setChannelModal("add")} onEditChannel={(ch, val) => setChannelModal({ channel: ch, value: val })} onDeleteChannel={handleDeleteChannel} />
          </div>
          <div style={{ width: 280, flexShrink: 0 }}>
            <Col2 brand={brand} contacts={contacts} onAdd={() => setContactModal({ mode: "add" })} onEdit={(c) => setContactModal({ mode: "edit", contact: c })} onDelete={handleDeleteContact} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Col3 brand={brand} logs={logs} onAddLog={addLog} />
          </div>
        </div>
        <div className="m-only">
          {tab === "info" && <Col1 brand={brand} channelLinks={channelLinks} onEditReg={() => setRegModalOpen(true)} onAddChannel={() => setChannelModal("add")} onEditChannel={(ch, val) => setChannelModal({ channel: ch, value: val })} onDeleteChannel={handleDeleteChannel} />}
          {tab === "contacts" && <Col2 brand={brand} contacts={contacts} onAdd={() => setContactModal({ mode: "add" })} onEdit={(c) => setContactModal({ mode: "edit", contact: c })} onDelete={handleDeleteContact} />}
          {tab === "logs" && <Col3 brand={brand} logs={logs} onAddLog={addLog} />}
        </div>
      </div>

      {contactModal && brand.id && typeof brand.id === "string" && (
        <ContactModal
          brandId={brand.id}
          initial={contactModal.mode === "edit" ? contactModal.contact : undefined}
          onClose={() => setContactModal(null)}
          onSaved={handleContactSaved}
        />
      )}

      {regModalOpen && brand.id && typeof brand.id === "string" && (
        <EditRegistrationModal
          brandId={brand.id}
          initial={brand}
          onClose={() => setRegModalOpen(false)}
          onSaved={handleRegSaved}
        />
      )}

      {channelModal && brand.id && typeof brand.id === "string" && (
        <EditChannelModal
          brandId={brand.id}
          initial={channelModal !== "add" ? channelModal : undefined}
          onClose={() => setChannelModal(null)}
          onSaved={handleChannelSaved}
        />
      )}
      <MobileTabBar />
    </>
  );
}
