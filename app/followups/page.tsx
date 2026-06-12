"use client";

import { useState } from "react";
import { Phone, MessageCircle, CheckCircle2, Clock, Gift, MapPin } from "lucide-react";

interface Task {
  id: number;
  brand: string;
  type: "reorder" | "festival" | "visit" | "stopped";
  title: string;
  daysLeft?: number;
  completed: boolean;
}

const mockTasks: Task[] = [
  {
    id: 1,
    brand: "青松健康",
    type: "reorder",
    title: "預估補貨日剩 6 天",
    daysLeft: 6,
    completed: false,
  },
  {
    id: 2,
    brand: "6星集",
    type: "festival",
    title: "端午送禮(去年:足浴禮盒×3)",
    completed: false,
  },
  {
    id: 3,
    brand: "滋和堂",
    type: "visit",
    title: "A級季拜訪到期",
    daysLeft: 0,
    completed: false,
  },
  {
    id: 4,
    brand: "悅禾莊園",
    type: "stopped",
    title: "停滯商機超過 14 天",
    daysLeft: 14,
    completed: false,
  },
];

const now = new Date();
const greeting =
  now.getHours() < 12
    ? "早安"
    : now.getHours() < 18
      ? "午安"
      : "晚安";

export default function FollowupsPage() {
  const [tasks, setTasks] = useState(mockTasks);

  const toggleTask = (id: number) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;

  const dateStr = new Date().toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div className="min-h-screen space-y-4 pb-24">
      {/* Header Greeting */}
      <div className="card sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">
              {greeting}，Wei
            </h1>
            <p className="text-sm text-muted mt-1">
              {dateStr} • {totalTasks} 項任務・{completedCount} 項完成
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-medium text-[color:var(--primary)]">
              {completedCount}/{totalTasks}
            </div>
            <p className="text-xs text-muted">完成度</p>
          </div>
        </div>
      </div>

      {/* Task Sections */}
      <div className="space-y-6">
        {/* Reorder Tasks */}
        {tasks.filter((t) => t.type === "reorder").length > 0 && (
          <div>
            <h2 className="section-title px-4 mb-3 flex items-center gap-2">
              <span>🎁</span> 回購提醒
            </h2>
            <div className="space-y-2">
              {tasks
                .filter((t) => t.type === "reorder")
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Festival Tasks */}
        {tasks.filter((t) => t.type === "festival").length > 0 && (
          <div>
            <h2 className="section-title px-4 mb-3 flex items-center gap-2">
              <span>🎉</span> 三節送禮
            </h2>
            <div className="space-y-2">
              {tasks
                .filter((t) => t.type === "festival")
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Visit Tasks */}
        {tasks.filter((t) => t.type === "visit").length > 0 && (
          <div>
            <h2 className="section-title px-4 mb-3 flex items-center gap-2">
              <span>📍</span> 季度拜訪
            </h2>
            <div className="space-y-2">
              {tasks
                .filter((t) => t.type === "visit")
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Stopped Tasks */}
        {tasks.filter((t) => t.type === "stopped").length > 0 && (
          <div>
            <h2 className="section-title px-4 mb-3 flex items-center gap-2 text-[color:var(--danger)]">
              <span>⚠️</span> 停滯商機
            </h2>
            <div className="space-y-2">
              {tasks
                .filter((t) => t.type === "stopped")
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) {
  return (
    <div
      className={`card p-4 flex items-start gap-4 cursor-pointer transition-all ${
        task.completed ? "opacity-60" : ""
      } hover:shadow-md active:scale-95`}
    >
      <button
        className="flex-shrink-0 mt-1 w-6 h-6 rounded-full border-2 border-[color:var(--primary)] flex items-center justify-center hover:bg-[color:var(--primary)] transition-all"
        onClick={() => onToggle()}
      >
        {task.completed && (
          <CheckCircle2 size={20} className="text-[color:var(--primary)]" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-[color:var(--text)]">{task.brand}</p>
        <p className="text-sm text-muted mt-1">{task.title}</p>
        {task.daysLeft !== undefined && task.daysLeft > 0 && (
          <p className="text-xs text-[color:var(--danger)] mt-2 font-medium">
            剩 {task.daysLeft} 天
          </p>
        )}
      </div>

      <div className="flex-shrink-0 flex gap-2">
        <button
          className="p-2 rounded-[10px] bg-[color:var(--primary-50)] text-[color:var(--primary)] hover:opacity-80 transition-all active:scale-90"
          onClick={(e) => {
            e.stopPropagation();
          }}
          title="撥號"
        >
          <Phone size={18} />
        </button>
        <button
          className="p-2 rounded-[10px] bg-[color:var(--primary-50)] text-[color:var(--primary)] hover:opacity-80 transition-all active:scale-90"
          onClick={(e) => {
            e.stopPropagation();
          }}
          title="LINE"
        >
          <MessageCircle size={18} />
        </button>
      </div>
    </div>
  );
}
