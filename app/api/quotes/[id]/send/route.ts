import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchEmail } from "@/lib/outreach/dispatchEmail";

export const runtime = "nodejs";

const money = (n: number) => `NT$${(n || 0).toLocaleString()}`;
const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|wixpress|\.png$|\.jpg$/i;
const isValidEmail = (e: string | null | undefined) =>
  !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);

/**
 * POST /api/quotes/:id/send
 * 將報價單以 Email 寄給綁定的客戶（email 取自採集到的 brand_channels）。
 * 建立 outreach_message 後走 dispatchEmail（未設 RESEND_API_KEY 時為模擬寄出）。
 * 可帶 { override_email } 指定收件信箱。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, brands(name), quote_items(name, spec, unit, unit_price, qty, sort_order)")
      .eq("id", id)
      .single();
    if (error || !quote) {
      return NextResponse.json({ success: false, error: "報價單不存在" }, { status: 404 });
    }

    // 解析收件 email：優先指定 → brand_channels → brands.email
    let to: string | null = isValidEmail(body.override_email) ? body.override_email : null;
    if (!to && quote.brand_id) {
      const { data: chans } = await supabase
        .from("brand_channels")
        .select("channel, value")
        .eq("brand_id", quote.brand_id);
      to = (chans || []).find((c) => c.channel === "email" && isValidEmail(c.value))?.value || null;
      if (!to) {
        const { data: b } = await supabase.from("brands").select("email").eq("id", quote.brand_id).maybeSingle();
        if (isValidEmail(b?.email)) to = b!.email;
      }
    }
    if (!to) {
      return NextResponse.json({ success: false, error: "此客戶沒有可用的 Email，請用「複製內容」或先補齊管道" }, { status: 400 });
    }

    const customer = quote.customer_name || quote.brands?.name || "貴公司";
    const items = (quote.quote_items || []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const rows = items.map((it: any) =>
      `<tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:14px;color:#3a3a3a;">${it.name}${it.spec ? `<br/><span style="color:#999;font-size:12px;">${it.spec}</span>` : ""}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:14px;color:#3a3a3a;text-align:right;">${money(it.unit_price)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:14px;color:#3a3a3a;text-align:right;">${it.qty} ${it.unit || ""}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:14px;color:#2f3d2f;text-align:right;font-weight:600;">${money((it.unit_price || 0) * it.qty)}</td>
      </tr>`
    ).join("");

    const subject = `${quote.title || "產品報價單"}（${quote.quote_no || ""}）— HeroHerb 好漢草`;
    const bodyHtml = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#f3f0e7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#fffdf8;border-radius:14px;padding:32px;">
<tr><td style="font-family:'Noto Serif TC',serif;font-size:22px;font-weight:700;color:#2f3d2f;padding-bottom:6px;">${quote.title || "產品報價單"}</td></tr>
<tr><td style="font-family:sans-serif;font-size:13px;color:#9a9384;padding-bottom:16px;">${quote.quote_no || ""}　致：${customer}</td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr style="color:#9a9384;font-size:12px;text-align:left;">
  <th style="padding:6px;border-bottom:2px solid #e3ded3;">品項</th>
  <th style="padding:6px;border-bottom:2px solid #e3ded3;text-align:right;">單價</th>
  <th style="padding:6px;border-bottom:2px solid #e3ded3;text-align:right;">數量</th>
  <th style="padding:6px;border-bottom:2px solid #e3ded3;text-align:right;">金額</th>
</tr>
${rows}
</table>
</td></tr>
<tr><td style="padding-top:14px;text-align:right;font-family:sans-serif;font-size:13px;color:#6e7a6d;">小計：${money(quote.subtotal)}</td></tr>
${quote.discount_amt > 0 ? `<tr><td style="text-align:right;font-family:sans-serif;font-size:13px;color:#c98a6b;">折扣（${quote.discount_pct}%）：-${money(quote.discount_amt)}</td></tr>` : ""}
<tr><td style="padding-top:6px;text-align:right;font-family:'Noto Serif TC',serif;font-size:18px;font-weight:700;color:#2f3d2f;">總計：${money(quote.total)}</td></tr>
${quote.note ? `<tr><td style="padding-top:16px;font-family:sans-serif;font-size:13px;color:#3a3a3a;line-height:1.7;white-space:pre-wrap;background:#f4f1ea;border-radius:8px;padding:12px;">${String(quote.note).replace(/</g, "&lt;")}</td></tr>` : ""}
<tr><td style="padding-top:14px;font-family:sans-serif;font-size:12px;color:#9a9384;">報價有效 ${quote.valid_days} 天　·　HeroHerb 好漢草</td></tr>
</table>
</td></tr></table></body></html>`;

    const bodyText = items.map((it: any) => `${it.name}　${money(it.unit_price)} x ${it.qty} = ${money((it.unit_price || 0) * it.qty)}`).join("\n")
      + `\n總計：${money(quote.total)}`;

    // 建立外發訊息再寄送
    const { data: msg, error: mErr } = await supabaseAdmin
      .from("outreach_messages")
      .insert({
        brand_id: quote.brand_id || null,
        channel: "EM",
        direction: "out",
        status: "queued",
        subject,
        body: bodyText,
        body_html: bodyHtml,
        to_email: to,
      })
      .select("id")
      .single();
    if (mErr || !msg) {
      return NextResponse.json({ success: false, error: "建立寄送訊息失敗" }, { status: 500 });
    }

    const r = await dispatchEmail(msg.id);
    if (!r.ok) {
      return NextResponse.json({ success: false, error: r.error || "寄送失敗" }, { status: 502 });
    }

    await supabase.from("quotes").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", id);

    return NextResponse.json({ success: true, to });
  } catch {
    return NextResponse.json({ success: false, error: "寄送失敗" }, { status: 500 });
  }
}
