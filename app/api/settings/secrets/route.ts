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
    group: "公司資料（報價單顯示）",
    note: "顯示在報價單抬頭與頁尾。統一編號、地址留空則該欄不顯示。",
    fields: [
      { key: "COMPANY_NAME", label: "公司名稱", placeholder: "威斯邁國際有限公司" },
      { key: "COMPANY_BRAND", label: "品牌標語", placeholder: "HeroHerb 好漢草 — 漢方良品" },
      { key: "COMPANY_TAX_ID", label: "統一編號", placeholder: "8 碼統編" },
      { key: "COMPANY_PHONE", label: "電話", placeholder: "(02)2631-8499" },
      { key: "COMPANY_FAX", label: "傳真", placeholder: "(02)2631-9577" },
      { key: "COMPANY_EMAIL", label: "Email", placeholder: "service@wesmilegood.com" },
      { key: "COMPANY_WEBSITE", label: "網站", placeholder: "www.heroherb.co" },
      { key: "COMPANY_ADDRESS", label: "公司地址", placeholder: "請填入完整地址" },
      { key: "COMPANY_LOGO_URL", label: "公司 Logo 網址", placeholder: "可用下方上傳" },
      { key: "COMPANY_SALES_REPS", label: "團隊成員／業務（逗號分隔）", placeholder: "例：王小明, 陳大華" },
    ],
  },
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
  {
    group: "LINE 進度通知",
    note: "LINE Notify 已停止服務，改用 Messaging API 廣播。建一個 LINE 官方帳號(bot)、把自己加為好友，貼上長期 access token，再把「啟用」設為 true。",
    fields: [
      { key: "LINE_NOTIFY_ENABLED", label: "啟用 LINE 通知", type: "select", options: ["false", "true"] },
      { key: "LINE_CHANNEL_ACCESS_TOKEN", label: "LINE Channel Access Token", type: "password", secret: true },
    ],
  },
  {
    group: "寄送節流 / 暖機",
    note: "保護寄件信箱信譽：每日上限是一天最多寄幾封；每批上限是排程器每 5 分鐘最多寄幾封。超出當日上限會自動排隊，隔天再寄。",
    fields: [
      { key: "EMAIL_DAILY_CAP", label: "每日寄送上限", placeholder: "300" },
      { key: "EMAIL_PER_RUN", label: "每批（每 5 分鐘）上限", placeholder: "40" },
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
    const fieldResults: Record<string, { ok: boolean; error?: string }> = {};

    for (const [k, v] of Object.entries(incoming)) {
      if (!ALL_KEYS.includes(k)) continue;
      const field = GROUPS.flatMap((g) => g.fields).find((f) => f.key === k)!;
      const val = typeof v === "string" ? v.trim() : "";
      // 機密欄位留空 = 不變更；非機密欄位留空 = 清除
      if (field.secret && val === "") continue;
      // 非機密欄位留空也跳過（不送空值佔位）
      if (!field.secret && val === "") continue;
      toSave[k] = val;
    }

    // 逐筆儲存，回報每個欄位結果
    let savedCount = 0;
    let hasError = false;
    for (const [key, value] of Object.entries(toSave)) {
      const r = await saveSettings({ [key]: value });
      if (r.ok) {
        fieldResults[key] = { ok: true };
        savedCount++;
      } else {
        fieldResults[key] = { ok: false, error: r.error };
        hasError = true;
      }
    }

    return NextResponse.json({
      success: !hasError,
      saved: savedCount,
      fieldResults,
      ...(hasError ? { error: `${savedCount} 個成功，${Object.values(fieldResults).filter(r => !r.ok).length} 個失敗` } : {}),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "儲存失敗" }, { status: 500 });
  }
}
