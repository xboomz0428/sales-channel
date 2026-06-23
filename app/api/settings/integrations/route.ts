import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { cleanEnv } from "@/lib/env";
import { resolveEmailProvider } from "@/lib/outreach/emailProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/integrations
 * 回報各項 API / 整合的設定狀態與「如何設定」（不外洩任何金鑰值）。
 */
export async function GET() {
  const settings = await getSettings();
  const has = (k: string) => !!(settings[k] || cleanEnv(k));
  const email = await resolveEmailProvider();
  const aiProvider =
    has("ANTHROPIC_API_KEY") ? "Claude"
    : has("OPENAI_API_KEY") ? "OpenAI"
    : (has("GEMINI_API_KEY") || has("GOOGLE_AI_API_KEY")) ? "Gemini"
    : null;

  const groups = [
    {
      group: "寄信服務",
      items: [
        {
          key: "email", label: "電子報寄送",
          configured: email.provider !== "none",
          detail: email.provider !== "none" ? `使用 ${email.provider}` : "未設定（模擬寄出）",
          where: "擇一：Gmail SMTP（最快，不需網域）、Resend、SendGrid 或自訂 SMTP。Gmail 需開兩步驟驗證並建立「應用程式密碼」。",
          vars: ["EMAIL_PROVIDER", "GMAIL_USER / GMAIL_APP_PASSWORD（或 RESEND_API_KEY / SENDGRID_API_KEY / SMTP_*）", "OUTREACH_FROM_EMAIL", "OUTREACH_FROM_NAME", "APP_BASE_URL"],
        },
      ],
    },
    {
      group: "AI 生成",
      items: [
        {
          key: "ai", label: "AI 草稿生成",
          configured: !!aiProvider,
          detail: aiProvider ? `使用 ${aiProvider}` : "未設定",
          where: "三選一：Anthropic（console.anthropic.com）、OpenAI（platform.openai.com）、Google Gemini（aistudio.google.com）建立 API Key。",
          vars: ["ANTHROPIC_API_KEY（或 OPENAI_API_KEY / GEMINI_API_KEY）", "AI_PROVIDER（選填，指定供應商）"],
        },
      ],
    },
    {
      group: "採集（Google）",
      items: [
        {
          key: "places", label: "Google Places",
          configured: has("GOOGLE_PLACES_API_KEY"),
          detail: has("GOOGLE_PLACES_API_KEY") ? "已設定" : "未設定",
          where: "Google Cloud Console 建專案 → 啟用 Places API → 建立 API Key。",
          vars: ["GOOGLE_PLACES_API_KEY"],
        },
        {
          key: "cse", label: "Custom Search (CSE)",
          configured: has("GOOGLE_CSE_ID"),
          detail: has("GOOGLE_CSE_ID") ? "已設定" : "未設定",
          where: "啟用 Custom Search API，到 programmablesearchengine.google.com 建立搜尋引擎取得 CSE ID。",
          vars: ["GOOGLE_CSE_ID"],
        },
      ],
    },
    {
      group: "資料庫",
      items: [
        {
          key: "supabase_url", label: "Supabase 連線",
          configured: has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL"),
          detail: (has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL")) ? "已連線" : "未設定",
          where: "Supabase 專案 → Settings → API 取得 Project URL 與 anon key。",
          vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        },
        {
          key: "supabase_service", label: "Service Role（後端）",
          configured: has("SUPABASE_SERVICE_ROLE_KEY"),
          detail: has("SUPABASE_SERVICE_ROLE_KEY") ? "已設定" : "退回 anon key（建議補上，後端讀寫更穩定）",
          where: "Supabase → Settings → API → service_role secret（只放後端環境變數，切勿放前端）。",
          vars: ["SUPABASE_SERVICE_ROLE_KEY"],
        },
      ],
    },
    {
      group: "選填整合",
      items: [
        {
          key: "resend_webhook", label: "Resend Webhook（退信/開信回拋）",
          configured: has("RESEND_WEBHOOK_SECRET"),
          detail: has("RESEND_WEBHOOK_SECRET") ? "已設定" : "未設定",
          where: "Resend → Webhooks 新增端點指向 /api/webhooks/resend，複製 Signing Secret。",
          vars: ["RESEND_WEBHOOK_SECRET"],
        },
        {
          key: "line", label: "LINE 入站 Webhook",
          configured: has("LINE_CHANNEL_SECRET"),
          detail: has("LINE_CHANNEL_SECRET") ? "已設定" : "未設定",
          where: "LINE Developers 建立 Messaging API 頻道，取得 Channel secret。",
          vars: ["LINE_CHANNEL_SECRET"],
        },
        {
          key: "cron", label: "排程保護金鑰",
          configured: has("CRON_SECRET"),
          detail: has("CRON_SECRET") ? "已設定" : "未設定",
          where: "自訂一組隨機字串，保護 /api/cron/* 排程端點（Vercel Cron 會帶此金鑰）。",
          vars: ["CRON_SECRET"],
        },
      ],
    },
  ];

  // 設定位置統一說明
  const howTo = "金鑰都填在環境變數：本機放 .env.local；線上放 Vercel 專案 → Settings → Environment Variables。填好存檔後重啟（本機）或重新部署（線上）才會生效。";

  return NextResponse.json({ groups, howTo });
}
