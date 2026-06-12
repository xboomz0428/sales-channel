"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Phone, MessageCircle } from "lucide-react";

interface Task {
  id: number;
  brand: string;
  type: "reorder" | "stalled" | "festival" | "visit";
  title: string;
  daysLeft?: number;
  done: boolean;
}

const mockTasks: Task[] = [
  {
    id: 1,
    brand: "青松健康",
    type: "reorder",
    title: "預估補貨日剩 6 天",
    daysLeft: 6,
    done: false,
  },
  {
    id: 2,
    brand: "6星集",
    type: "festival",
    title: "端午送禮(去年:足浴禮盒×3)",
    done: false,
  },
  {
    id: 3,
    brand: "滋和堂",
    type: "visit",
    title: "A級季拜訪到期",
    daysLeft: 12,
    done: false,
  },
  {
    id: 4,
    brand: "悅禾莊園",
    type: "stalled",
    title: "樣品寄出已 18 天，待追蹤",
    daysLeft: 18,
    done: false,
  },
];

const typeConfig = {
  reorder: { icon: "📦", label: "回購提醒", color: "bg-primary" },
  stalled: { icon: "⚠️", label: "停滯警示", color: "bg-danger" },
  festival: { icon: "🎁", label: "三節送禮", color: "bg-accent" },
  visit: { icon: "👥", label: "拜訪到期", color: "bg-sage" },
};

export default function FollowupsPage() {
  const [tasks, setTasks] = useState(mockTasks);
  const completedCount = tasks.filter((t) => t.done).length;

  const toggleTask = (id: number) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const groupedTasks = {
    reorder: tasks.filter((t) => t.type === "reorder"),
    stalled: tasks.filter((t) => t.type === "stalled"),
    festival: tasks.filter((t) => t.type === "festival"),
    visit: tasks.filter((t) => t.type === "visit"),
  };

  return (
    <div className="space-y-6">
      {/* 頂部問候 */}
      <div className="card bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">2026年6月12日</p>
            <h1 className="page-title mt-1">今日待跟進</h1>
            <p className="text-sm text-muted mt-1">
              {completedCount}/{tasks.length} 完成
            </p>
          </div>
          <div className="text-4xl font-bold text-primary">
            {tasks.length - completedCount}
          </div>
        </div>
      </div>

      {/* 進度條 */}
      <div className="card">
        <div className="w-full h-3 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted mt-2 text-center">
          {completedCount}/{tasks.length} 完成
        </p>
      </div>

      {/* 任務分組 */}
      {Object.entries(groupedTasks).map(([type, typeTasks]) => {
        if (typeTasks.length === 0) return null;
        const config = typeConfig[type as keyof typeof typeConfig];

        return (
          <div key={type}>
            <h3 className="section-title px-4 mb-3 flex items-center gap-2">
              <span className="text-xl">{config.icon}</span>
              {config.label}
            </h3>

            <div className="space-y-2">
              {typeTasks.map((task) => (
                <div
                  key={task.id}
                  className={`card p-4 transition-all ${task.done ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {/* 勾選框 */}
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 transition-all ${
                        task.done
                          ? "bg-primary border-primary"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      {task.done && <CheckCircle2 size={18} className="text-white" />}
                    </button>

                    {/* 任務內容 */}
                    <div className="flex-1">
                      <p className={`font-medium ${task.done ? "line-through text-muted" : ""}`}>
                        {task.brand}
                      </p>
                      <p className={`text-sm mt-1 ${task.done ? "line-through text-muted" : "text-text"}`}>
                        {task.title}
                      </p>
                      {task.daysLeft && (
                        <p className="text-xs text-danger mt-1 font-medium">
                          ⏰ {task.daysLeft} 天內
                        </p>
                      )}
                    </div>

                    {/* 快速按鈕 */}
                    {!task.done && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          className="p-2 hover:bg-primary/10 rounded-lg transition-all"
                          title="撨號"
                        >
                          <Phone size={18} className="text-primary" />
                        </button>
                        <button
                          className="p-2 hover:bg-primary/10 rounded-lg transition-all"
                          title="LINE"
                        >
                          <MessageCircle size={18} className="text-primary" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* 空狀態 */}
      {tasks.length === completedCount && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-2">✨</div>
          <p className="font-medium text-text">今日所有任務已完成！</p>
          <p className="text-sm text-muted mt-1">休息一下，明天繼續努力</p>
        </div>
      )}
    </div>
  );
}
