import { NextResponse } from "next/server";
import { requireCron, errorResponse } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyLine } from "@/lib/notify/line";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 每日 9PM 台灣時間（13:00 UTC）進度摘要通知
 * vercel.json: { "path": "/api/cron/daily-report", "schedule": "0 13 * * *" }
 */
export async function GET(req: Request) {
  try {
    requireCron(req);

    // 今日台灣時間 0:00 = UTC 前一天 16:00
    const tzOffset = 8 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const todayTwStart = new Date(Math.floor((nowUtc + tzOffset) / 86400000) * 86400000 - tzOffset).toISOString();

    const [brandsRes, emailsRes, logsRes, quotesRes] = await Promise.all([
      // 今日新增品牌
      supabaseAdmin.from("brands").select("id", { count: "exact", head: true }).gte("created_at", todayTwStart),
      // 今日寄出 email
      supabaseAdmin.from("outreach_messages").select("id", { count: "exact", head: true })
        .eq("channel", "EM").eq("status", "sent").gte("sent_at", todayTwStart),
      // 今日聯繫紀錄
      supabaseAdmin.from("outreach_logs").select("id", { count: "exact", head: true }).gte("created_at", todayTwStart),
      // 今日新報價
      supabaseAdmin.from("quotes").select("id", { count: "exact", head: true }).gte("created_at", todayTwStart),
    ]);

    // 管道狀態概覽
    const { data: pipeline } = await supabaseAdmin
      .from("brands")
      .select("status")
      .neq("status", null);
    const statusCount: Record<string, number> = {};
    for (const b of pipeline || []) {
      if (b.status) statusCount[b.status] = (statusCount[b.status] || 0) + 1;
    }

    const lines: string[] = [
      "【HeroHerb 通路開發 — 每日晚報】",
      `📅 ${new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric" })}`,
      "",
      "📊 今日活動",
      `・新增品牌：${brandsRes.count ?? 0} 個`,
      `・寄出郵件：${emailsRes.count ?? 0} 封`,
      `・聯繫紀錄：${logsRes.count ?? 0} 筆`,
      `・新增報價：${quotesRes.count ?? 0} 張`,
      "",
      "📈 管道現況",
    ];

    const statusLabel: Record<string, string> = {
      new: "🆕 新進",
      contacted: "📬 已接觸",
      interested: "🌟 有興趣",
      negotiating: "🤝 洽談中",
      cooperating: "✅ 合作中",
      declined: "❌ 婉拒",
      blacklisted: "🚫 黑名單",
    };
    for (const [st, cnt] of Object.entries(statusCount).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      lines.push(`・${statusLabel[st] || st}：${cnt} 個`);
    }

    lines.push("", "cc.wesmilegood.com");
    await notifyLine(lines.join("\n"));

    return NextResponse.json({ ok: true, sent: lines.length });
  } catch (err) {
    return errorResponse(err);
  }
}
