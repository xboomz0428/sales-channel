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
  Heart,
  Settings,
} from "lucide-react";

const navItems = [
  { name: "儀表板", href: "/", icon: BarChart3 },
  { name: "名單總覽", href: "/leads", icon: Users },
  { name: "品牌詳情", href: "/brands", icon: Building2 },
  { name: "進度看板", href: "/opportunities", icon: Target },
  { name: "採集比對", href: "/matching", icon: FileText },
  { name: "今日跟進", href: "/followups", icon: CheckCircle },
  { name: "客情維護", href: "/care", icon: Heart },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="nav-sidebar">
      <div className="mb-8">
        <div className="nav-brand">HeroHerb</div>
        <p className="nav-subtitle">銷售通路開發系統</p>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="nav-footer">
        <p className="nav-version">v0.3.0</p>
      </div>
    </aside>
  );
}
