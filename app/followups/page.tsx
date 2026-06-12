"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Phone, MessageCircle } from "lucide-react";

interface Task {
  id: string;
  brand: string;
  type: "reorder" | "stalled" | "festival" | "visit";
  title: string;
  daysLeft?: number;
  done: boolean;
}

const typeConfig = {
  reorder: { icon: "📦", label: "回購提醒", color: "bg-primary" },
  stalled: { icon: "⚠️", label: "停滯警示", color: "bg-danger" },
  festival: { icon: "🎁", label: "三節送禮", color: "bg-accent" },
  visit: { icon: "👥", label: "拜訪到期", color: "bg-sage" },
};

export default function FollowupsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 載入資料
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/followups");
        const result = await response.json();

        if (result.success) {
          setTasks(result.data);
        }
      } catch (error) {
        console.error("載入任務失敗:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  const completedCount = tasks.filter((t) => t.done).length;

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      const response = await fetch(`/api/followups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: !task.done }),
      });

      if (response.ok) {
        setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
      }
    } catch (error) {
      console.error("更新任務失敗:", error);
    }
  };

  const groupedTasks = {
    reorder: tasks.filter((t) => t.type === "reorder"),
    stalled: tasks.filter((t) => t.type === "stalled"),
    festival: tasks.filter((t) => t.type === "festival"),
    visit: tasks.filter((t) => t.type === "visit"),
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">今日待跟進</h1>
        <p className="text-muted">載入中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 頂部問候 */}
      <div className="card bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{new Date().toLocaleDateString("zh-TW")}</p>
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
      {tasks.length === completedCount && tasks.length > 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-2">✨</div>
          <p className="font-medium text-text">今日所有任務已完成！</p>
          <p className="text-sm text-muted mt-1">休息一下，明天繼續努力</p>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-muted">今日無待跟進任務</p>
        </div>
      )}
    </div>
  );
}
