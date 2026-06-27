"use client";

import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/design";
import MobileTabBar from "@/components/MobileTabBar";

interface IndustryGroup {
  id: string;
  name: string;
  color: string;
  industries: string[];
  sort_order: number;
  brandCount?: number;
}
interface IndustryOpt { name: string; count: number }

const GROUP_COLORS = ["#8FAAA4", "#5E8880", "#A66A4F", "#5B7C99", "#B8860B", "#7A4FB0", "#C0392B", "#4A6B50", "#D97706", "#06808A"];

export default function IndustryGroupsPage() {
  const [groups, setGroups] = useState<IndustryGroup[]>([]);
  const [available, setAvailable] = useState<IndustryOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"card" | "list">("card");
  const [editing, setEditing] = useState<Partial<IndustryGroup> | null>(null);

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("ig_view") : null;
    if (v === "card" || v === "list") setView(v);
  }, []);
  const changeView = (v: "card" | "list") => { setView(v); try { window.localStorage.setItem("ig_view", v); } catch {} };

  const load = () => {
    fetch("/api/industry-groups")
      .then((r) => r.json())
      .then((d) => { if (d.success) { setGroups(d.data); setAvailable(d.availableIndustries || []); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const deleteGroup = async (g: IndustryGroup) => {
    if (!confirm(`刪除群組「${g.name}」？（不影響名單資料，僅刪除此群組設定）`)) return;
    const res = await fetch(`/api/industry-groups?id=${g.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { alert(d.error || "刪除失敗"); return; }
    load();
  };

  return (
    <>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>產業群組</h1>
        <span className="d-only" style={{ fontSize: 13, color: C.muted }}>— 把多個產業歸成命名群組，群發訊息時一鍵鎖定</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2, padding: 2, background: C.surf2, borderRadius: 9 }}>
            {([["card", "▦ 卡片"], ["list", "☰ 列表"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => changeView(v)}
                style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: view === v ? 700 : 400, border: "none", background: view === v ? C.surface : "transparent", color: view === v ? C.primary : C.muted, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setEditing({ name: "", color: GROUP_COLORS[groups.length % GROUP_COLORS.length], industries: [] })} className="pressable"
            style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ＋ 新增群組
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 90px", background: C.bg }}>
        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>載入中…</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: "center", color: C.muted, padding: 50 }}>
            尚無產業群組。點右上「＋ 新增群組」，例如建立「產後護理」包含 月子中心／產後護理之家／孕婦。
          </div>
        ) : view === "card" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
            {groups.map((g) => (
              <div key={g.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${g.color}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: g.color }} />
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{g.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.primary, fontWeight: 700 }}>{g.brandCount ?? 0} 個品牌</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, minHeight: 26 }}>
                  {g.industries.length === 0 ? <span style={{ fontSize: 12, color: C.muted }}>（尚未選產業）</span> :
                    g.industries.map((ind) => (
                      <span key={ind} style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 999, background: `${g.color}1c`, color: g.color, fontWeight: 600 }}>{ind}</span>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <button onClick={() => setEditing(g)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12.5, cursor: "pointer" }}>編輯</button>
                  <button onClick={() => deleteGroup(g)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.danger, fontSize: 12.5, cursor: "pointer" }}>刪除</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ fontSize: 13, color: C.muted, textAlign: "left", background: C.surf2 }}>
                  <th style={{ padding: "10px 12px" }}>群組</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>產業數</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>涵蓋品牌</th>
                  <th style={{ padding: "10px 12px" }}>包含產業</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} style={{ fontSize: 14, color: C.text }}>
                    <td style={{ padding: "11px 12px", borderTop: `1px solid ${C.border}` }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color }} />
                        <span style={{ fontWeight: 700 }}>{g.name}</span>
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px", borderTop: `1px solid ${C.border}`, textAlign: "center", color: C.muted }}>{g.industries.length}</td>
                    <td style={{ padding: "11px 12px", borderTop: `1px solid ${C.border}`, textAlign: "center", fontWeight: 700, color: C.primary }}>{g.brandCount ?? 0}</td>
                    <td style={{ padding: "11px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted }}>{g.industries.join("、") || "—"}</td>
                    <td style={{ padding: "11px 12px", borderTop: `1px solid ${C.border}`, textAlign: "center", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(g)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, cursor: "pointer", marginRight: 6 }}>編輯</button>
                      <button onClick={() => deleteGroup(g)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.danger, fontSize: 13, cursor: "pointer" }}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <GroupEditor group={editing} available={available} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      <MobileTabBar />
    </>
  );
}

function GroupEditor({ group, available, onClose, onSaved }: {
  group: Partial<IndustryGroup>; available: IndustryOpt[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!group.id;
  const [name, setName] = useState(group.name || "");
  const [color, setColor] = useState(group.color || GROUP_COLORS[0]);
  const [selected, setSelected] = useState<string[]>(group.industries || []);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (ind: string) => setSelected((s) => s.includes(ind) ? s.filter((x) => x !== ind) : [...s, ind]);

  const filtered = useMemo(() => {
    const list = search ? available.filter((a) => a.name.includes(search)) : available;
    return list;
  }, [available, search]);
  const selectedCount = useMemo(() => selected.reduce((s, i) => s + (available.find((a) => a.name === i)?.count || 0), 0), [selected, available]);

  const save = async () => {
    if (!name.trim()) { setErr("請輸入群組名稱"); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/industry-groups", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { id: group.id, name, color, industries: selected } : { name, color, industries: selected }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !d.success) { setErr(d.error || "儲存失敗"); return; }
    onSaved();
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box", background: C.surf2, color: C.text };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 510, width: "94vw", maxWidth: 560, maxHeight: "90vh", background: C.surface, borderRadius: 18, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 16, fontWeight: 700, color: C.text }}>{isEdit ? "編輯產業群組" : "新增產業群組"}</div>
        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 5 }}>群組名稱 *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例：產後護理" style={inputStyle} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 6 }}>群組顏色</label>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {GROUP_COLORS.map((col) => (
                <button key={col} onClick={() => setColor(col)} style={{ width: 26, height: 26, borderRadius: 8, background: col, border: color === col ? "3px solid #2f3d2f" : "1px solid rgba(0,0,0,.15)", cursor: "pointer" }} />
              ))}
              <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer", background: C.surf2 }}>
                🎨<input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
              </label>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>選擇產業（已選 {selected.length} 個 · 約 {selectedCount} 個品牌）</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋產業…" style={{ padding: "5px 9px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, background: C.surf2, color: C.text, width: 130 }} />
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {filtered.length === 0 ? <div style={{ fontSize: 12, color: C.muted, padding: 12, textAlign: "center" }}>無符合產業</div> :
                filtered.map((a) => {
                  const on = selected.includes(a.name);
                  return (
                    <label key={a.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 8, cursor: "pointer", background: on ? `${color}14` : "transparent" }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(a.name)} style={{ width: 15, height: 15, accentColor: color, cursor: "pointer" }} />
                      <span style={{ fontSize: 13.5, color: C.text, flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{a.count}</span>
                    </label>
                  );
                })}
            </div>
          </div>
          {err && <div style={{ fontSize: 13, color: C.danger }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, cursor: "pointer" }}>取消</button>
          <button onClick={save} disabled={saving || !name.trim()} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: name.trim() ? C.primary : C.surf2, color: name.trim() ? "white" : C.muted, fontSize: 13, fontWeight: 700, cursor: name.trim() ? "pointer" : "default" }}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </>
  );
}
