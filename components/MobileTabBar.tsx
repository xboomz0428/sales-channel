"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "@/lib/design";

const TABS = [
  { id: "brands", label: "名單", sym: "≡", href: "/leads" },
  { id: "care", label: "跟進", sym: "♡", href: "/followups" },
  { id: "pipeline", label: "進度", sym: "↗", href: "/opportunities" },
  { id: "dashboard", label: "我的", sym: "◈", href: "/" },
  { id: "settings", label: "設定", sym: "⚙", href: "/settings" },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <div
      className="m-only"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((t) => {
        const on = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.id}
            href={t.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "9px 0",
              textDecoration: "none",
              color: on ? C.primary : C.muted,
            }}
          >
            <span style={{ fontSize: 17, lineHeight: 1 }}>{t.sym}</span>
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 400 }}>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
