"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { C } from "@/lib/design";
import { NAV, NavItem, isActive } from "@/lib/nav";
import { APP_VERSION } from "@/lib/version";
import ChangelogModal from "@/components/ChangelogModal";

// 手機版完整導航抽屜（與桌機側欄功能一致），透過浮動選單鈕開啟
export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const linkItems = NAV.filter((item): item is Extract<NavItem, { id: string }> => item.kind !== "section");
  const activeIdx = linkItems.findIndex((item) => isActive(pathname, item.href));

  return (
    <div className="m-only">
      {/* 浮動選單鈕（位於底部分頁列上方） */}
      <button
        onClick={() => setOpen(true)}
        aria-label="開啟選單"
        style={{
          position: "fixed",
          right: 16,
          bottom: 74,
          zIndex: 40,
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "none",
          background: C.sidebar,
          color: "white",
          fontSize: 20,
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(58,92,87,.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ☰
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(46,69,53,.45)", backdropFilter: "blur(2px)" }} />
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: 248,
              maxWidth: "82vw",
              zIndex: 51,
              background: C.sidebar,
              display: "flex",
              flexDirection: "column",
              animation: "slideInLeft 200ms ease",
            }}
          >
            <div style={{ padding: "20px 18px 14px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "white", letterSpacing: 0.4 }}>WeSmile</div>
                <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,.62)", letterSpacing: 1.6, textTransform: "uppercase" }}>通路開發系統</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="關閉" style={{ border: "none", background: "none", color: "rgba(255,255,255,.7)", fontSize: 26, lineHeight: 1, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ flex: 1, padding: "10px 9px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
              {NAV.map((item, i) => {
                if (item.kind === "section") {
                  return (
                    <div key={`sec-${i}`} style={{ padding: "10px 13px 3px", fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(255,255,255,.38)" }}>
                      {item.label}
                    </div>
                  );
                }
                const on = linkItems.indexOf(item) === activeIdx;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "11px 13px",
                      borderRadius: 10,
                      textDecoration: "none",
                      background: on ? "rgba(255,255,255,.16)" : "transparent",
                      color: on ? "white" : "rgba(255,255,255,.82)",
                      fontSize: 14.5,
                      fontWeight: on ? 500 : 400,
                    }}
                  >
                    <span style={{ fontSize: 15, lineHeight: 1, width: 18, textAlign: "center", flexShrink: 0 }}>{item.sym}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <button
              onClick={() => { setShowLog(true); }}
              style={{ textAlign: "left", border: "none", background: "transparent", color: "rgba(255,255,255,.5)", fontSize: 11, cursor: "pointer", padding: "14px 18px 20px", borderTop: "1px solid rgba(255,255,255,.08)" }}
            >
              v{APP_VERSION} · 更新紀錄
            </button>
          </div>
        </>
      )}

      {showLog && <ChangelogModal onClose={() => setShowLog(false)} />}

      <style jsx>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
