"use client";

import { useState, useEffect, ReactNode } from "react";
import { C } from "@/lib/design";
import Icon from "@/components/Icon";
import MobileTabBar from "@/components/MobileTabBar";

// ── Google API 定價 (USD / 1000 calls) ───────────────
const PRICING: Record<string, { label: string; unitCost: number; color: string; desc: string }> = {
  places_search: { label: "Places 搜尋", unitCost: 32, color: "#4285F4", desc: "Text Search · $32 / 1000 次" },
  places_detail: { label: "Places 詳情", unitCost: 17, color: "#34A853", desc: "Place Details · $17 / 1000 次" },
  cse:           { label: "Custom Search", unitCost: 5,  color: "#FBBC04", desc: "CSE · $5 / 1000 次（前 100 次/日免費）" },
};

const USD_TWD = 32;

interface UsageData {
  today: Record<string, number>;
  month: Record<string, number>;
  settings: {
    places_search_daily_limit: number;
    places_search_monthly_limit: number;
    places_detail_daily_limit: number;
    places_detail_monthly_limit: number;
    cse_daily_limit: number;
    cse_monthly_limit: number;
    alert_enabled: boolean;
  };
  trend: { date: string; places_search?: number; places_detail?: number; cse?: number }[];
}

function pct(val: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((val / limit) * 100));
}

function costNT(calls: number, apiType: string) {
  const free = apiType === "cse" ? 100 : 0;
  const billable = Math.max(0, calls - free);
  return ((billable / 1000) * (PRICING[apiType]?.unitCost ?? 0) * USD_TWD).toFixed(0);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: C.surface, borderRadius: 16, padding: "20px 22px", marginBottom: 18, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function UsageBar({ label, value, limit, color, desc }: { label: string; value: number; limit: number; color: string; desc?: string }) {
  const p = pct(value, limit);
  const warn = p >= 80;
  const over = p >= 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
        <span style={{ fontSize: 13, color: over ? C.danger : warn ? "#D97706" : C.muted, fontVariantNumeric: "tabular-nums" }}>
          {value.toLocaleString()} / {limit.toLocaleString()}
          {over && " ⚠ 超出"}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: C.surf2, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${p}%`,
          borderRadius: 4,
          background: over ? C.danger : warn ? "#D97706" : color,
          transition: "width 600ms ease",
        }} />
      </div>
      {desc && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{desc}</div>}
    </div>
  );
}

function LimitInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        style={{
          width: 100,
          padding: "7px 10px",
          borderRadius: 9,
          border: `1px solid ${C.border}`,
          background: C.surf2,
          fontSize: 14,
          color: C.text,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localSettings, setLocalSettings] = useState<UsageData["settings"] | null>(null);

  useEffect(() => {
    fetch("/api/settings/api-usage")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
          setLocalSettings({ ...res.data.settings });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setSetting = (key: keyof UsageData["settings"], val: number | boolean) => {
    setLocalSettings((prev) => prev ? { ...prev, [key]: val } : null);
  };

  const save = async () => {
    if (!localSettings) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings/api-usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localSettings),
      });
      setData((prev) => prev ? { ...prev, settings: localSettings } : null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const s = localSettings ?? data?.settings;

  // 計算本月預估費用
  const monthCost = Object.keys(PRICING).reduce((sum, k) => {
    const calls = data?.month[k] ?? 0;
    return sum + parseFloat(costNT(calls, k));
  }, 0);

  // 趨勢最大值（用於 bar chart 高度比例）
  const trendMax = Math.max(1, ...(data?.trend ?? []).map((d) =>
    (d.places_search ?? 0) + (d.places_detail ?? 0) + (d.cse ?? 0)
  ));

  const alerts: string[] = [];
  if (data && s) {
    for (const k of Object.keys(PRICING)) {
      const todayV = data.today[k] ?? 0;
      const monthV = data.month[k] ?? 0;
      const dl = s[`${k}_daily_limit` as keyof typeof s] as number;
      const ml = s[`${k}_monthly_limit` as keyof typeof s] as number;
      if (dl && pct(todayV, dl) >= 80) alerts.push(`${PRICING[k].label} 今日用量已達 ${pct(todayV, dl)}%`);
      if (ml && pct(monthV, ml) >= 80) alerts.push(`${PRICING[k].label} 本月用量已達 ${pct(monthV, ml)}%`);
    }
  }

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>API 使用設定</h1>
        <span style={{ fontSize: 13, color: C.muted }}>Google API 用量監控與提醒</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", paddingBottom: 100, maxWidth: 780, margin: "0 auto", width: "100%" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <div className="spin" style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%", margin: "0 auto 14px" }} />
            載入中…
          </div>
        ) : (
          <>
            {/* 提醒橫幅 */}
            {s?.alert_enabled && alerts.length > 0 && (
              <div style={{ background: "#FFF7ED", border: "1px solid #FBBF24", borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>⚠ 用量提醒</div>
                {alerts.map((a, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#92400E" }}>・{a}</div>
                ))}
              </div>
            )}

            {/* 本月費用摘要 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>本月預估費用</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: monthCost > 500 ? C.danger : C.text }}>
                  NT${monthCost.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>≈ USD ${(monthCost / USD_TWD).toFixed(1)}</div>
              </div>
              {Object.entries(PRICING).map(([k, p]) => {
                const todayV = data?.today[k] ?? 0;
                const monthV = data?.month[k] ?? 0;
                return (
                  <div key={k} style={{ flex: 1, minWidth: 140, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                      <div style={{ fontSize: 11, color: C.muted }}>{p.label}</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{monthV.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>今日 {todayV} 次・NT${costNT(monthV, k)}</div>
                  </div>
                );
              })}
            </div>

            {/* 今日用量 */}
            <Section title="今日用量">
              {Object.entries(PRICING).map(([k, p]) => {
                const v = data?.today[k] ?? 0;
                const dl = (s?.[`${k}_daily_limit` as keyof typeof s] as number) ?? 0;
                return (
                  <UsageBar
                    key={k}
                    label={p.label}
                    value={v}
                    limit={dl}
                    color={p.color}
                    desc={p.desc}
                  />
                );
              })}
            </Section>

            {/* 本月用量 */}
            <Section title="本月用量">
              {Object.entries(PRICING).map(([k, p]) => {
                const v = data?.month[k] ?? 0;
                const ml = (s?.[`${k}_monthly_limit` as keyof typeof s] as number) ?? 0;
                return (
                  <UsageBar
                    key={k}
                    label={p.label}
                    value={v}
                    limit={ml}
                    color={p.color}
                  />
                );
              })}
            </Section>

            {/* 30天趨勢 */}
            {data && data.trend.length > 0 && (
              <Section title="近 30 天呼叫趨勢">
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, overflowX: "auto", paddingBottom: 6 }}>
                  {data.trend.map((d) => {
                    const total = (d.places_search ?? 0) + (d.places_detail ?? 0) + (d.cse ?? 0);
                    const h = Math.round((total / trendMax) * 72);
                    const ps = d.places_search ?? 0;
                    const pd = d.places_detail ?? 0;
                    const cs = d.cse ?? 0;
                    return (
                      <div key={d.date} title={`${d.date}\nPlaces搜尋: ${ps}\nPlaces詳情: ${pd}\nCSE: ${cs}`}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 14, cursor: "default" }}>
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", height: h, borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                          {ps > 0 && <div style={{ flex: ps, background: "#4285F4", minHeight: 2 }} />}
                          {pd > 0 && <div style={{ flex: pd, background: "#34A853", minHeight: 2 }} />}
                          {cs > 0 && <div style={{ flex: cs, background: "#FBBC04", minHeight: 2 }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  {Object.entries(PRICING).map(([, p]) => (
                    <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                      {p.label}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 提醒設定 */}
            {s && (
              <Section title="提醒設定">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "10px 14px", borderRadius: 10, background: C.surf2 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>啟用用量提醒</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>達到每日或每月上限 80% 時顯示警告</div>
                  </div>
                  <button
                    onClick={() => setSetting("alert_enabled", !s.alert_enabled)}
                    style={{
                      width: 48, height: 28, borderRadius: 14, border: "none",
                      background: s.alert_enabled ? C.primary : C.border,
                      cursor: "pointer", position: "relative", transition: "background 200ms", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3, left: s.alert_enabled ? 23 : 3,
                      width: 22, height: 22, borderRadius: 11, background: "white",
                      transition: "left 200ms", boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                    }} />
                  </button>
                </div>

                {Object.entries(PRICING).map(([k, p]) => (
                  <div key={k} style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.label}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{p.desc}</span>
                    </div>
                    <div style={{ paddingLeft: 18 }}>
                      <LimitInput
                        label="每日上限（次）"
                        value={(s[`${k}_daily_limit` as keyof typeof s] as number) ?? 0}
                        onChange={(v) => setSetting(`${k}_daily_limit` as keyof typeof s, v)}
                      />
                      <LimitInput
                        label="每月上限（次）"
                        value={(s[`${k}_monthly_limit` as keyof typeof s] as number) ?? 0}
                        onChange={(v) => setSetting(`${k}_monthly_limit` as keyof typeof s, v)}
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={save}
                  disabled={saving}
                  className="pressable"
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    borderRadius: 12,
                    border: "none",
                    background: saved ? C.success : C.primary,
                    color: "white",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: saving ? "default" : "pointer",
                    transition: "background 300ms",
                  }}
                >
                  {saving ? "儲存中…" : saved ? "✓ 已儲存" : "儲存設定"}
                </button>
              </Section>
            )}

            {/* 定價說明 */}
            <div style={{ background: C.surf2, borderRadius: 12, padding: "14px 16px", fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.text }}>Google API 計費說明</div>
              <div>・Places Text Search：NT${(32 * USD_TWD / 1000).toFixed(1)} / 次（每次搜尋最多 20 筆結果）</div>
              <div>・Places Details：NT${(17 * USD_TWD / 1000).toFixed(1)} / 次（每間門市詳情更新）</div>
              <div>・Custom Search：NT${(5 * USD_TWD / 1000).toFixed(1)} / 次（每日前 100 次免費）</div>
              <div style={{ marginTop: 6 }}>匯率以 1 USD ≈ NT${USD_TWD} 計算，僅供參考。</div>
            </div>
          </>
        )}
      </div>

      <MobileTabBar />
    </>
  );
}
