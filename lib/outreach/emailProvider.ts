import { getCfgMany } from "@/lib/settings";

export type EmailProvider = "resend" | "gmail" | "smtp" | "sendgrid" | "none";

export interface ResolvedEmailProvider {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
}

const EMAIL_KEYS = [
  "EMAIL_PROVIDER", "OUTREACH_FROM_NAME", "OUTREACH_FROM_EMAIL",
  "RESEND_API_KEY", "SENDGRID_API_KEY",
  "GMAIL_USER", "GMAIL_APP_PASSWORD",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS",
];

/**
 * 決定使用哪家寄信服務（DB 設定優先，其次環境變數）：
 * 優先 EMAIL_PROVIDER 指定；否則依已設定的金鑰自動挑選（Resend → SendGrid → Gmail/SMTP）。
 */
export async function resolveEmailProvider(): Promise<ResolvedEmailProvider> {
  const c = await getCfgMany(EMAIL_KEYS);
  const explicit = (c.EMAIL_PROVIDER || "").toLowerCase();
  const fromName = c.OUTREACH_FROM_NAME || "HeroHerb 好漢草";

  const hasResend = !!c.RESEND_API_KEY;
  const hasSendgrid = !!c.SENDGRID_API_KEY;
  const hasGmail = !!c.GMAIL_USER && !!c.GMAIL_APP_PASSWORD;
  const hasSmtp = !!c.SMTP_HOST && !!c.SMTP_USER && !!c.SMTP_PASS;

  const defaultFrom = (p: EmailProvider) =>
    c.OUTREACH_FROM_EMAIL || (p === "gmail" ? c.GMAIL_USER : undefined) || c.SMTP_USER || "noreply@heroherb.co";

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
  from: string;
  fromEmail: string;
  fromName: string;
}
interface SendResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string;
}

export async function sendViaResend(a: SendArgs): Promise<SendResult> {
  const { RESEND_API_KEY } = await getCfgMany(["RESEND_API_KEY"]);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: a.from, to: [a.to], subject: a.subject, html: a.html }),
  });
  if (!res.ok) return { ok: false, error: `Resend 錯誤 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}` };
  const data = await res.json().catch(() => ({}));
  return { ok: true, providerMessageId: data.id || null };
}

export async function sendViaSendgrid(a: SendArgs): Promise<SendResult> {
  const { SENDGRID_API_KEY } = await getCfgMany(["SENDGRID_API_KEY"]);
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
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
  const c = await getCfgMany(["GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"]);
  const nodemailer = (await import("nodemailer")).default;
  const transport =
    provider === "gmail"
      ? nodemailer.createTransport({ service: "gmail", auth: { user: c.GMAIL_USER, pass: c.GMAIL_APP_PASSWORD } })
      : nodemailer.createTransport({
          host: c.SMTP_HOST,
          port: Number(c.SMTP_PORT || 587),
          secure: c.SMTP_SECURE === "true",
          auth: { user: c.SMTP_USER, pass: c.SMTP_PASS },
        });
  try {
    const info = await transport.sendMail({ from: a.from, to: a.to, subject: a.subject, html: a.html });
    return { ok: true, providerMessageId: info.messageId || null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMTP 寄送失敗" };
  }
}
