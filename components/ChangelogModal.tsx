"use client";

import { C } from "@/lib/design";
import { CHANGELOG, APP_VERSION } from "@/lib/version";

export default function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 610, width: "92vw", maxWidth: 480, maxHeight: "85vh", background: C.surface, borderRadius: 18, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden", color: C.text }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>功能更新紀錄</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>目前版本 v{APP_VERSION}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "8px 22px 22px", overflowY: "auto" }}>
          {CHANGELOG.map((entry) => (
            <div key={entry.version} style={{ paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>v{entry.version}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.title}</span>
                <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>{entry.date}</span>
              </div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                {entry.items.map((it, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
