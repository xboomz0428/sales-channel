// 共用導航結構（Sidebar 桌機側欄 + MobileNav 手機抽屜共用）

export type NavItem =
  | { kind?: undefined; id: string; label: string; sym: string; href: string }
  | { kind: "section"; label: string };

export const NAV: NavItem[] = [
  { id: "dashboard", label: "儀表板", sym: "◈", href: "/" },
  { id: "brands", label: "名單總覽", sym: "≡", href: "/leads" },
  { id: "pipeline", label: "商機進度", sym: "↗", href: "/opportunities" },
  { id: "analytics", label: "漏斗分析", sym: "⊿", href: "/analytics" },
  { id: "care", label: "今日跟進", sym: "♡", href: "/followups" },
  { id: "match", label: "比對中心", sym: "⟳", href: "/matching" },
  { id: "collect", label: "採集任務", sym: "⚡", href: "/matching?tab=collect" },
  { id: "gov-import", label: "政府資料匯入", sym: "⬇", href: "/import" },
  { id: "industry-groups", label: "產業群組", sym: "◳", href: "/outreach/industry-groups" },
  { kind: "section", label: "業務工具" },
  { id: "products", label: "產品報價", sym: "▦", href: "/products" },
  { kind: "section", label: "外發管道" },
  { id: "email-dashboard", label: "郵件儀表板", sym: "✉", href: "/outreach/email-dashboard" },
  { id: "newsletter", label: "電子報發送", sym: "◎", href: "/outreach/newsletter" },
  { id: "email-editor", label: "郵件編輯器", sym: "✏", href: "/outreach/email-editor" },
  { kind: "section", label: "系統" },
  { id: "settings", label: "設定", sym: "⚙", href: "/settings" },
  { id: "guide", label: "使用說明", sym: "?", href: "/guide" },
];

export function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(base + "/");
}
