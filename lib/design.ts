// HeroHerb 通路開發系統 — 設計 tokens（莫蘭迪馬卡龍）
// 完整對照 reference/*.html 設計稿

export const C = {
  primary: "#8FAAA4", // 莫蘭迪霧青綠
  p50: "#EDF3F2",
  p100: "#D5E6E4",
  sage: "#B5CAC5",
  accent: "#D9B68C",
  accentDk: "#9E7048",
  danger: "#C98A6B",
  dangerBg: "#FAF0EB",
  success: "#5E8860",
  successBg: "#E8F2E8",
  warning: "#A68A3A",
  warningBg: "#FAF3DF",
  bg: "#FBFAF7",
  surface: "#FFFFFF",
  surf2: "#F4F1EA",
  text: "#3D4A3E",
  muted: "#6E7A6D",
  border: "#ECE8DF",
  sidebar: "#3A5C57", // 莫蘭迪深青苔
  done: "#6AAF8A",
} as const;

export type StatusKey =
  | "new"
  | "contacted"
  | "sampling"
  | "quoting"
  | "negotiating"
  | "won"
  | "lost";

export const STATUS: Record<StatusKey, { bg: string; fg: string; label: string }> = {
  new: { bg: "#F0EEE8", fg: "#8A8678", label: "新名單" },
  contacted: { bg: "#E3ECF2", fg: "#5B7C99", label: "已聯繫" },
  sampling: { bg: "#EAE5F0", fg: "#7B6E99", label: "打樣中" },
  quoting: { bg: "#F5EDDD", fg: "#A6824A", label: "報價中" },
  negotiating: { bg: "#E6EFE6", fg: "#5E7F64", label: "議約中" },
  won: { bg: "#DCE9DC", fg: "#4A6B50", label: "成交" },
  lost: { bg: "#F3E4DC", fg: "#A66A4F", label: "流失" },
};

export const STAGE_ORDER: StatusKey[] = [
  "new",
  "contacted",
  "sampling",
  "quoting",
  "negotiating",
  "won",
];

export const STAGES: StatusKey[] = [
  "new",
  "contacted",
  "sampling",
  "quoting",
  "negotiating",
  "won",
  "lost",
];

export const STAGE_CFG: Record<
  StatusKey,
  { label: string; color: string; bg: string; stale: number | null }
> = {
  new: { label: "新名單", color: "#8A8678", bg: "#F0EEE8", stale: null },
  contacted: { label: "已聯繫", color: "#5B7C99", bg: "#E3ECF2", stale: null },
  sampling: { label: "打樣中", color: "#7B6E99", bg: "#EAE5F0", stale: 14 },
  quoting: { label: "報價中", color: "#A6824A", bg: "#F5EDDD", stale: 30 },
  negotiating: { label: "議約中", color: "#5E7F64", bg: "#E6EFE6", stale: null },
  won: { label: "成交", color: "#4A6B50", bg: "#DCE9DC", stale: null },
  lost: { label: "流失", color: "#A66A4F", bg: "#F3E4DC", stale: null },
};

export const CHANNELS: Record<string, { label: string; bg: string; abbr: string }> = {
  line: { label: "LINE", bg: "#06C755", abbr: "LN" },
  fb: { label: "FB", bg: "#1877F2", abbr: "FB" },
  ig: { label: "IG", bg: "#C13584", abbr: "IG" },
  email: { label: "Mail", bg: "#6B8F71", abbr: "EM" },
  phone: { label: "Tel", bg: "#D9B68C", abbr: "TEL" },
  website: { label: "Web", bg: "#5B7C99", abbr: "WWW" },
  map: { label: "Map", bg: "#D97706", abbr: "MAP" },
  address: { label: "地址", bg: "#8A8678", abbr: "ADDR" },
};

export const CHANNEL_ORDER = ["line", "fb", "ig", "email", "phone", "website", "map"];

// 將管道值轉成可點擊連結
export function channelHref(channel: string, value: string): string {
  if (!value) return "#";
  if (channel === "email") return value.startsWith("mailto:") ? value : `mailto:${value}`;
  if (channel === "phone") return `tel:${value.replace(/[^+\d]/g, "")}`;
  if (channel === "line" && !value.startsWith("http")) return `https://line.me/R/ti/p/${value}`;
  if (!value.startsWith("http")) return `https://${value}`;
  return value;
}

export const INDUSTRIES = ["養生館", "越式洗髮", "宮廟", "長照", "禮儀"];

// CSV 匯出（含 BOM，Excel 友善）
export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,﻿" + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}
