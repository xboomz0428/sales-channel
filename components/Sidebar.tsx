"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { C } from "@/lib/design";

const NAV = [
  { id: "dashboard", label: "儀表板", sym: "◈", href: "/" },
  { id: "brands", label: "名單總覽", sym: "≡", href: "/leads" },
  { id: "pipeline", label: "商機進度", sym: "↗", href: "/opportunities" },
  { id: "care", label: "今日跟進", sym: "♡", href: "/followups" },
  { id: "match", label: "比對中心", sym: "⟳", href: "/matching" },
  { id: "collect", label: "採集任務", sym: "⚡", href: "/matching?tab=collect" },
];

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(base + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const [logoError, setLogoError] = useState(false);
  // 比對中心 / 採集任務 共用頁面，只亮第一個符合項
  const activeIdx = NAV.findIndex((item) => isActive(pathname, item.href));

  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        background: C.sidebar,
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
      }}
    >
      <div style={{ padding: "22px 18px 16px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        {!logoError ? (
          <Image
            src="/wesmile-logo-white.png"
            alt="WeSmile"
            width={120}
            height={26}
            style={{ height: 26, width: "auto", opacity: 0.9, display: "block" }}
            onError={() => setLogoError(true)}
            priority
          />
        ) : (
          <span style={{ fontWeight: 800, fontSize: 15, color: "white", letterSpacing: 0.4 }}>
            WeSmile
          </span>
        )}
        <div
          style={{
            marginTop: 5,
            fontSize: 10,
            color: "rgba(255,255,255,.68)",
            letterSpacing: 1.8,
            textTransform: "uppercase",
          }}
        >
          通路開發系統
        </div>
      </div>

      <div style={{ flex: 1, padding: "10px 9px", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV.map((item, i) => {
          const on = i === activeIdx;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="nav-a"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 13px",
                borderRadius: 10,
                textDecoration: "none",
                background: on ? "rgba(255,255,255,.16)" : "transparent",
                color: on ? "white" : "rgba(255,255,255,.82)",
                fontSize: 14,
                fontWeight: on ? 500 : 400,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, width: 16, textAlign: "center", flexShrink: 0 }}>
                {item.sym}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div style={{ padding: "12px 14px 22px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: C.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "white", fontSize: 13, fontWeight: 700 }}>W</span>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,.88)", fontSize: 13, fontWeight: 500 }}>Wei</div>
            <div style={{ color: "rgba(255,255,255,.62)", fontSize: 11 }}>創辦人</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
