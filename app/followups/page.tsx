"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { C, downloadCSV } from "@/lib/design";
import Icon from "@/components/Icon";
import MobileTabBar from "@/components/MobileTabBar";

// ── 任務分類 ─────────────────────────────────────────
type SectionKey = "reorder" | "stagnant" | "festival" | "visit";

const SEC: Record<SectionKey, { label: string; emoji: string; color: string; light: string }> = {
  reorder: { label: "回購提醒", emoji: "🔁", color: "#5E8880", light: "#EDF4F2" },
  stagnant: { label: "停滯商機", emoji: "⏳", color: "#A66A4F", light: "#FFF0E8" },
  festival: { label: "三節任務", emoji: "🎁", color: "#9E7048", light: "#FFF8ED" },
  visit: { label: "拜訪到期", emoji: "📍", color: "#5B7C99", light: "#EEF2F8" },
};

interface Task {
  id: string | number;
  section: SectionKey;
  brand: string;
  tier?: string;
  title: string;
  desc: string;
  channels: string[];
}

// 種子任務（API 無資料時顯示）
const SEED_TASKS: Task[] = [
  { id: 1, section: "reorder", brand: "青松健康(長照)", tier: "A", title: "預估補貨日剩 6 天", desc: "上次出貨 5月5日 · 預估月用量 20包", channels: ["email", "fb"] },
  { id: 2, section: "stagnant", brand: "悅禾莊園SPA", title: "打樣中 — 停留 18 天", desc: "已超過建議跟進時限（14天），建議本週追蹤", channels: ["line", "fb"] },
  { id: 3, section: "festival", brand: "6星集足體養生會館", title: "端午節送禮任務", desc: "去年：足浴禮盒×3 · 本週最後機會", channels: ["line", "fb"] },
  { id: 4, section: "visit", brand: "滋和堂中醫養生", tier: "A", title: "A 級客戶季拜訪到期", desc: "上次拜訪 3月12日 · 間隔已 91 天", channels: ["line", "phone"] },
];

// API type → section 對映
const TYPE_TO_SECTION: Record<string, SectionKey> = {
  reorder: "reorder",
  stalled: "stagnant",
  stagnant: "stagnant",
  festival: "festival",
  visit: "visit",
};

// ── 問候列 ───────────────────────────────────────────
function GreetingBar({ taskCount }: { taskCount: number }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const hour = now?.getHours() ?? 9;
  const greet = hour < 12 ? "早安" : hour < 18 ? "午安" : "晚安";
  const emoji = hour < 12 ? "☀️" : hour < 18 ? "🌿" : "🌙";
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const dateStr = now ? `${now.getMonth() + 1}月${now.getDate()}日 星期${days[now.getDay()]}` : "";

  return (
    <div style={{ background: C.sidebar, padding: "22px 20px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "white", lineHeight: 1.2 }}>
            {greet}，Wei {emoji}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 5 }}>{dateStr}</div>
        </div>
        {taskCount > 0 ? (
          <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "white", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{taskCount}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 2 }}>項待辦</div>
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,.12)", borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 2 }}>全完成</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 任務卡片 ─────────────────────────────────────────
function TaskCard({ task, onComplete }: { task: Task; onComplete: (id: Task["id"]) => void }) {
  const [done, setDone] = useState(false);
  const sec = SEC[task.section];

  const handleDone = () => {
    setDone(true);
    setTimeout(() => onComplete(task.id), 700);
  };

  return (
    <div
      style={{
        background: done ? "#F8F8F6" : C.surface,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        marginBottom: 10,
        boxShadow: done ? "none" : "0 2px 10px rgba(58,92,87,.06)",
        opacity: done ? 0.5 : 1,
        transition: "all 600ms cubic-bezier(.2,.8,.2,1)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 3, background: done ? C.border : sec.color, borderRadius: "16px 16px 0 0" }} />

      <div style={{ padding: "14px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: done ? C.surf2 : sec.light,
              color: done ? C.muted : sec.color,
            }}
          >
            {sec.emoji} {sec.label}
          </span>

          <button
            onClick={handleDone}
            disabled={done}
            className="pressable"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              cursor: done ? "default" : "pointer",
              background: done ? C.done : "transparent",
              border: done ? "none" : `2px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: done ? "checkPop 300ms ease-out" : "none",
            }}
          >
            <Icon n="check" size={15} color={done ? "white" : C.muted} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: done ? C.surf2 : C.p50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 15, color: done ? C.muted : C.primary, fontWeight: 700 }}>{task.brand[0]}</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: done ? C.muted : C.text, textDecoration: done ? "line-through" : "none" }}>{task.brand}</span>
              {task.tier && (
                <span style={{ padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "#FFF3CC", color: "#A6824A" }}>{task.tier}級</span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: done ? C.muted : sec.color, marginTop: 1 }}>{task.title}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, marginBottom: 12, paddingLeft: 47 }}>{task.desc}</div>

        {!done && (
          <div style={{ display: "flex", gap: 8, paddingLeft: 47 }}>
            {task.channels.includes("line") && (
              <a
                href="https://line.me"
                target="_blank"
                rel="noopener"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, textDecoration: "none", background: "#06C75518", color: "#06C755", fontSize: 13, fontWeight: 600 }}
              >
                <span style={{ fontSize: 15 }}>💬</span> LINE
              </a>
            )}
            {task.channels.includes("phone") && (
              <a
                href="tel:+886-2-2631-8499"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, textDecoration: "none", background: `${C.primary}18`, color: C.primary, fontSize: 13, fontWeight: 600 }}
              >
                <Icon n="phone" size={14} color={C.primary} /> 撥號
              </a>
            )}
            {task.channels.includes("email") && (
              <a
                href="mailto:service@heroherb.co"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, textDecoration: "none", background: `${C.primary}18`, color: C.primary, fontSize: 13, fontWeight: 600 }}
              >
                ✉️ Email
              </a>
            )}
            {task.channels.includes("fb") && (
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, textDecoration: "none", background: "#1877F218", color: "#1877F2", fontSize: 13, fontWeight: 600 }}
              >
                📘 FB
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 任務分組 ─────────────────────────────────────────
function TaskSection({ sectionKey, tasks, onComplete }: { sectionKey: SectionKey; tasks: Task[]; onComplete: (id: Task["id"]) => void }) {
  const sec = SEC[sectionKey];
  if (!tasks.length) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 20px 8px",
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "rgba(251,250,247,.95)",
          backdropFilter: "blur(6px)",
        }}
      >
        <span style={{ fontSize: 15 }}>{sec.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sec.label}</span>
        <span style={{ padding: "2px 8px", borderRadius: 999, background: sec.light, color: sec.color, fontSize: 11, fontWeight: 700 }}>{tasks.length}</span>
      </div>
      <div style={{ padding: "0 16px" }}>
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onComplete={onComplete} />
        ))}
      </div>
    </div>
  );
}

function AllDone() {
  return (
    <div style={{ textAlign: "center", padding: "60px 32px", color: C.muted }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🌿</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8 }}>今日任務全完成！</div>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>好好休息，明天繼續加油</div>
    </div>
  );
}

// ── 主頁面 ───────────────────────────────────────────
export default function FollowupsPage() {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [usingApi, setUsingApi] = useState(false);

  useEffect(() => {
    fetch("/api/followups")
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          setTasks(
            result.data
              .filter((t: Record<string, unknown>) => !t.done)
              .map((t: Record<string, unknown>) => ({
                id: t.id as string,
                section: TYPE_TO_SECTION[(t.type as string) || "visit"] || "visit",
                brand: (t.brand as string) || "未命名",
                title: (t.title as string) || "",
                desc: (t.desc as string) || (t.daysLeft != null ? `剩 ${t.daysLeft} 天` : ""),
                channels: Array.isArray(t.channels) ? (t.channels as string[]) : ["phone"],
              }))
          );
          setUsingApi(true);
        }
      })
      .catch(() => {});
  }, []);

  const complete = (id: Task["id"]) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (usingApi) {
      fetch("/api/followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: true }),
      }).catch(() => {});
    }
  };

  const exportCSV = () => {
    const hdrs = ["品牌", "類型", "標題", "描述"];
    const rows = tasks.map((t) => [t.brand, SEC[t.section].label, t.title, t.desc]);
    downloadCSV("HeroHerb_今日跟進.csv", hdrs, rows);
  };

  return (
    <>
      <GreetingBar taskCount={tasks.length} />

      {/* CSV export bar */}
      <div className="d-only" style={{ display: "flex", justifyContent: "flex-end", padding: "8px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <button
          onClick={exportCSV}
          className="pressable"
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          ↓ CSV 匯出
        </button>
      </div>

      {/* Scroll area */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>
        {tasks.length === 0 ? (
          <AllDone />
        ) : (
          (["reorder", "stagnant", "festival", "visit"] as SectionKey[]).map((s) => (
            <TaskSection key={s} sectionKey={s} tasks={tasks.filter((t) => t.section === s)} onComplete={complete} />
          ))
        )}

        <div className="d-only" style={{ textAlign: "center", padding: "24px 20px", color: C.muted, fontSize: 13 }}>
          <Link href="/leads" style={{ color: C.primary, textDecoration: "none", fontWeight: 500 }}>
            ← 返回名單總覽
          </Link>
        </div>
      </div>

      <MobileTabBar />
    </>
  );
}
