import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { resolveEmailProvider } from "@/lib/outreach/emailProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/integrations
 * 回報各項 API / 整合的設定狀態（不外洩任何金鑰值），讓「API 設定」頁可一覽。
 */
export async function GET() {
  const has = (k: string) => !!cleanEnv(k);

  // 寄信
  const email = resolveEmailProvider();

  // AI 供應商
  const aiProvider =
    has("ANTHROPIC_API_KEY") ? "Claude"
    : has("OPENAI_API_KEY") ? "OpenAI"
    : (has("GEMINI_API_KEY") || has("GOOGLE_AI_API_KEY")) ? "Gemini"
    : null;

  const groups = [
    {
      group: "寄信服務",
      items: [
        { key: "email", label: "電子報寄送", configured: email.provider !== "none", detail: email.provider !== "none" ? `使用 ${email.provider}` : "未設定（模擬寄出）", docs: "/guide" },
      ],
    },
    {
      group: "AI 生成",
      items: [
        { key: "ai", label: "AI 草稿生成", configured: !!aiProvider, detail: aiProvider ? `使用 ${aiProvider}` : "未設定", docs: "/guide" },
      ],
    },
    {
      group: "採集（Google）",
      items: [
        { key: "places", label: "Google Places", configured: has("GOOGLE_PLACES_API_KEY"), detail: has("GOOGLE_PLACES_API_KEY") ? "已設定" : "未設定", docs: "/guide" },
        { key: "cse", label: "Custom Search (CSE)", configured: has("GOOGLE_CSE_ID"), detail: has("GOOGLE_CSE_ID") ? "已設定" : "未設定", docs: "/guide" },
      ],
    },
    {
      group: "資料庫",
      items: [
        { key: "supabase_url", label: "Supabase 連線", configured: has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL"), detail: (has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL")) ? "已連線" : "未設定", docs: "/guide" },
        { key: "supabase_service", label: "Service Role（後端）", configured: has("SUPABASE_SERVICE_ROLE_KEY"), detail: has("SUPABASE_SERVICE_ROLE_KEY") ? "已設定" : "退回 anon key", docs: "/guide" },
      ],
    },
    {
      group: "選填整合",
      items: [
        { key: "resend_webhook", label: "Resend Webhook（退信/開信回拋）", configured: has("RESEND_WEBHOOK_SECRET"), detail: has("RESEND_WEBHOOK_SECRET") ? "已設定" : "未設定", docs: "/guide" },
        { key: "line", label: "LINE 入站 Webhook", configured: has("LINE_CHANNEL_SECRET"), detail: has("LINE_CHANNEL_SECRET") ? "已設定" : "未設定", docs: "/guide" },
        { key: "cron", label: "排程保護金鑰", configured: has("CRON_SECRET"), detail: has("CRON_SECRET") ? "已設定" : "未設定", docs: "/guide" },
      ],
    },
  ];

  return NextResponse.json({ groups });
}
