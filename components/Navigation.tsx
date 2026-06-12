"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Users,
  Building2,
  Target,
  FileText,
  CheckCircle,
} from "lucide-react";

const navItems = [
  {
    name: "儀表板",
    href: "/",
    icon: BarChart3,
  },
  {
    name: "名單總覽",
    href: "/leads",
    icon: Users,
  },
  {
    name: "品牌詳情",
    href: "/brands",
    icon: Building2,
  },
  {
    name: "商機看板",
    href: "/opportunities",
    icon: Target,
  },
  {
    name: "採集比對",
    href: "/matching",
    icon: FileText,
  },
  {
    name: "今日跟進",
    href: "/followups",
    icon: CheckCircle,
  },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="w-64 p-6" style={{ backgroundColor: "var(--surface)", borderRight: "1px solid var(--border)" }}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>HeroHerb</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>銷售通路開發系統</p>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-[10px] transition-colors"
              style={{
                backgroundColor: isActive ? "var(--primary-50)" : "transparent",
                color: isActive ? "var(--primary)" : "var(--text)",
                fontWeight: isActive ? "500" : "400",
              }}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>v0.1.0</p>
      </div>
    </aside>
  );
}
