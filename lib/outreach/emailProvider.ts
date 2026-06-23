import { cleanEnv } from "@/lib/env";

export type EmailProvider = "resend" | "gmail" | "smtp" | "sendgrid" | "none";

export interface ResolvedEmailProvider {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
}

/**
 * 決定使用哪家寄信服務：
 * 優先 EMAIL_PROVIDER 指定；否則依已設定的金鑰自動挑選
 * （Resend → SendGrid → Gmail/SMTP）。
 */
export function resolveEmailProvider(): ResolvedEmailProvider {
  const explicit = (cleanEnv("EMAIL_PROVIDER") || "").toLowerCase();
  const fromName = cleanEnv("OUTREACH_FROM_NAME") || "HeroHerb 好漢草";

  const hasResend = !!cleanEnv("RESEND_API_KEY");
  const hasSendgrid = !!cleanEnv("SENDGRID_API_KEY");
  const gmailUser = cleanEnv("GMAIL_USER");
  const hasGmail = !!gmailUser && !!cleanEnv("GMAIL_APP_PASSWORD");
  const hasSmtp = !!cleanEnv("SMTP_HOST") && !!cleanEnv("SMTP_USER") && !!cleanEnv("SMTP_PASS");

  const defaultFrom = (p: EmailProvider) =>
    cleanEnv("OUTREACH_FROM_EMAIL") ||
    (p === "gmail" ? gmailUser : undefined) ||
    cleanEnv("SMTP_USER") ||
    "noreply@heroherb.co";

  const pick = (p: EmailProvider): ResolvedEmailProvider | null => {
    if (p === "resend" && hasResend) return { provider: "resend", fromEmail: defaultFrom("resend")!, fromName };
    if (p === "sendgrid" && hasSendgrid) return { provider: "sendgrid", fromEmail: defaultFrom("sendgrid")!, fromName };
    if (p === "gmail" && hasGmail) return { provider: "gmail", fromEmail: defaultFrom("gmail")!, fromName };
    if (p === "smtp" && hasSmtp) return { provider: "smtp", fromEmail: defaultFrom("smtp")!, fromName };
    return null;
  };

  if (explicit) {
    const r = pick(explicit as EmailProvider);
    if (r) return r;
  }
  return (
    pick("resend") || pick("sendgrid") || pick("gmail") || pick("smtp") ||
    { provider: "none", fromEmail: defaultFrom("none")!, fromName }
  );
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  from: string;     // "Name <email>"
  fromEmail: string;
  fromName: string;
}
interface SendResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string;
}

export async function sendViaResend(a: SendArgs): Promise<SendResult> {
  const key = cleanEnv("RESEND_API_KEY")!;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: a.from, to: [a.to], subject: a.subject, html: a.html }),
  });
  if (!res.ok) return { ok: false, error: `Resend 錯誤 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}` };
  const data = await res.json().catch(() => ({}));
  return { ok: true, providerMessageId: data.id || null };
}

export async function sendViaSendgrid(a: SendArgs): Promise<SendResult> {
  const key = cleanEnv("SENDGRID_API_KEY")!;
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: a.to }] }],
      from: { email: a.fromEmail, name: a.fromName },
      subject: a.subject,
      content: [{ type: "text/html", value: a.html }],
    }),
  });
  if (res.status === 202) return { ok: true, providerMessageId: res.headers.get("x-message-id") };
  if (!res.ok) return { ok: false, error: `SendGrid 錯誤 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}` };
  return { ok: true };
}

export async function sendViaSmtp(a: SendArgs, provider: "gmail" | "smtp"): Promise<SendResult> {
  // 動態載入 nodemailer，避免在不需要時被打包進 edge 等環境
  const nodemailer = (await import("nodemailer")).default;
  const transport =
    provider === "gmail"
      ? nodemailer.createTransport({
          service: "gmail",
          auth: { user: cleanEnv("GMAIL_USER"), pass: cleanEnv("GMAIL_APP_PASSWORD") },
        })
      : nodemailer.createTransport({
          host: cleanEnv("SMTP_HOST"),
          port: Number(cleanEnv("SMTP_PORT") || 587),
          secure: cleanEnv("SMTP_SECURE") === "true",
          auth: { user: cleanEnv("SMTP_USER"), pass: cleanEnv("SMTP_PASS") },
        });
  try {
    const info = await transport.sendMail({ from: a.from, to: a.to, subject: a.subject, html: a.html });
    return { ok: true, providerMessageId: info.messageId || null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMTP 寄送失敗" };
  }
}
