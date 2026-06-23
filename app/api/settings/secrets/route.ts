import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { cleanEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Field = {
  key: string;
  label: string;
  type?: "text" | "password" | "select";
  placeholder?: string;
  options?: string[];
  secret?: boolean; // 機密欄位：不回傳值、留空不覆寫
};

const GROUPS: { group: string; note?: string; fields: Field[] }[] = [
  {
    group: "寄信服務（擇一即可）",
    note: "Gmail SMTP 最快（不需網域）；Resend / SendGrid 送達率較好。",
    fields: [
      { key: "EMAIL_PROVIDER", label: "使用哪家（留空=自動）", type: "select", options: ["", "gmail", "resend", "sendgrid", "smtp"] },
      { key: "OUTREACH_FROM_NAME", label: "寄件人名稱", placeholder: "HeroHerb 好漢草" },
      { key: "OUTREACH_FROM_EMAIL", label: "寄件人 Email", placeholder: "hello@yourdomain.com" },
      { key: "APP_BASE_URL", label: "網站網址（追蹤用）", placeholder: "https://你的網址" },
      { key: "GMAIL_USER", label: "Gmail 帳號", placeholder: "you@gmail.com" },
      { key: "GMAIL_APP_PASSWORD", label: "Gmail 應用程式密碼", type: "password", secret: true },
      { key: "RESEND_API_KEY", label: "Resend API Key", type: "password", secret: true },
      { key: "SENDGRID_API_KEY", label: "SendGrid API Key", type: "password", secret: true },
      { key: "SMTP_HOST", label: "自訂 SMTP 主機", placeholder: "smtp.example.com" },
      { key: "SMTP_PORT", label: "SMTP 連接埠", placeholder: "587" },
      { key: "SMTP_USER", label: "SMTP 帳號" },
      { key: "SMTP_PASS", label: "SMTP 密碼", type: "password", secret: true },
    ],
  },
  {
    group: "AI 生成（三選一）",
    fields: [
      { key: "AI_PROVIDER", label: "使用哪家（留空=自動）", type: "select", options: ["", "claude", "openai", "gemini"] },
      { key: "ANTHROPIC_API_KEY", label: "Anthropic Claude Key", type: "password", secret: true },
      { key: "OPENAI_API_KEY", label: "OpenAI Key", type: "password", secret: true },
      { key: "GEMINI_API_KEY", label: "Google Gemini Key", type: "password", secret: true },
    ],
  },
  {
    group: "採集（Google）",
    fields: [
      { key: "GOOGLE_PLACES_API_KEY", label: "Google Places API Key", type: "password", secret: true },
      { key: "GOOGLE_CSE_ID", label: "Custom Search 引擎 ID（CSE ID）", type: "password", secret: true },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));
const mask = (v: string) => (v.length <= 4 ? "••••" : `${"•".repeat(Math.max(4, v.length - 4))}${v.slice(-4)}`);

export async function GET() {
  const settings = await getSettings(true);
  const groups = GROUPS.map((g) => ({
    group: g.group,
    note: g.note,
    fields: g.fields.map((f) => {
      const dbVal = settings[f.key];
      const envVal = cleanEnv(f.key);
      const set = !!(dbVal || envVal);
      return {
        ...f,
        set,
        source: dbVal ? "db" : envVal ? "env" : null,
        // 機密欄位：只回遮罩；非機密回實際值方便編輯
        value: f.secret ? "" : (dbVal ?? envVal ?? ""),
        masked: set && f.secret ? mask(dbVal || envVal || "") : "",
      };
    }),
  }));
  return NextResponse.json({ groups });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const incoming: Record<string, string> = body.values || {};
    const toSave: Record<string, string> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (!ALL_KEYS.includes(k)) continue;
      const field = GROUPS.flatMap((g) => g.fields).find((f) => f.key === k)!;
      const val = typeof v === "string" ? v : "";
      // 機密欄位留空 = 不變更（避免清掉既有金鑰）；非機密可寫入空值
      if (field.secret && val.trim() === "") continue;
      toSave[k] = val.trim();
    }
    const r = await saveSettings(toSave);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 500 });
    return NextResponse.json({ success: true, saved: Object.keys(toSave).length });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "儲存失敗" }, { status: 500 });
  }
}
