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
    <aside className="w-64 bg-white border-r border-gray-200 p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">HeroHerb</h1>
        <p className="text-sm text-gray-600 mt-1">銷售通路開發系統</p>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">v0.1.0</p>
      </div>
    </aside>
  );
}
