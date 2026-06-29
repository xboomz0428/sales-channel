import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "node:crypto";
import { getCfg } from "@/lib/settings";
import { getCompany } from "@/lib/companyServer";
import { resolveEmailProvider, sendViaResend, sendViaSendgrid, sendViaSmtp } from "@/lib/outreach/emailProvider";
import { addToBlacklist, classifyBounce } from "@/lib/outreach/blacklist";

interface DispatchResult {
  ok: boolean;
  error?: string;
}

export async function dispatchEmail(messageId: string): Promise<DispatchResult> {
  const { data: msg } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, to_email, subject, body, body_html, brand_id")
    .eq("id", messageId)
    .single();

  if (!msg || !msg.to_email) {
    return { ok: false, error: "訊息不存在或無收件人 email" };
  }

  // 檢查黑名單：只有「已封鎖（blocked）」的信箱才跳過（軟退信未達門檻不擋）
  const { data: blocked } = await supabaseAdmin
    .from("email_blacklist")
    .select("email, reason, fail_count, blocked")
    .eq("email", msg.to_email.toLowerCase())
    .eq("blocked", true)
    .maybeSingle();
  if (blocked) {
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "failed", error_detail: `此信箱已被標記為黑名單（${blocked.reason}，累計 ${blocked.fail_count} 次失敗）` })
      .eq("id", messageId);
    return { ok: false, error: `${msg.to_email} 已被標記為無效信箱，跳過寄送` };
  }

  const { provider, fromEmail, fromName } = await resolveEmailProvider();
  const appBase = (await getCfg("APP_BASE_URL")) || "https://localhost:3000";

  // 取品牌資料用於變數替換
  let brandData: Record<string, string> = {};
  if (msg.brand_id) {
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("name, industry, registered_name, owner_name, tax_id")
      .eq("id", msg.brand_id)
      .maybeSingle();
    if (brand) {
      brandData = {
        品牌名: brand.name || "",
        公司名稱: brand.registered_name || "",
        產業: brand.industry || "",
        負責人: brand.owner_name || "",
        統編: brand.tax_id || "",
      };
    }
  }

  // 我方公司資料（來自「設定→全域」），供模板 Logo／簽名／退訂讀取
  const company = await getCompany();
  const logoBlock = company.logo
    ? `<img src="${company.logo}" alt="${company.name}" style="height:42px;max-width:220px;display:block;border:0;"/>`
    : `<div style="font-size:18px;font-weight:800;color:#fff;font-family:'Noto Serif TC',serif;">${company.name || "好漢草 HeroHerb"}</div><div style="font-size:12px;color:#9DC4A8;margin-top:3px;">${company.brand || "漢方良品 · 草本的溫度，暖身也暖心"}</div>`;
  const signature = [company.name, company.taxId ? `統編 ${company.taxId}` : "", company.phone, company.email, company.website]
    .filter(Boolean).join("｜");
  const unsubscribe = `mailto:${company.email || "service@wesmilegood.com"}?subject=${encodeURIComponent("取消訂閱")}`;

  // 變數替換：{{變數名}} → 實際值，沒有資料就替換為空字串（不顯示變數名）
  const now = new Date();
  const vars: Record<string, string> = {
    ...brandData,
    收件人Email: msg.to_email || "",
    寄件人: fromName || "",
    今天日期: `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`,
    // 我方公司（與品牌的「公司名稱」區隔）
    公司Logo區塊: logoBlock,
    公司簽名: signature,
    寄件公司: company.name || "",
    公司電話: company.phone || "",
    公司Email: company.email || "",
    公司網站: company.website || "",
    公司地址: company.address || "",
    公司統編: company.taxId || "",
    unsubscribe,
  };
  const replaceVars = (text: string) =>
    text.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? "");

  // 產生追蹤 ID + 注入開信追蹤像素
  const trackingId = crypto.randomUUID();
  let html = replaceVars(msg.body_html || msg.body?.replace(/\n/g, "<br/>") || "");
  const subject = replaceVars(msg.subject || "");

  // 連結追蹤改寫：把 HTML 內的 <a href="https://..."> 換成追蹤連結
  // 每個連結建一筆 email_links，點擊時走 /api/track/click/[lid] → 302 轉原網址
  const linkRe = /href="(https?:\/\/[^"]+)"/gi;
  const linkMatches = [...html.matchAll(linkRe)];
  for (const m of linkMatches) {
    const origUrl = m[1];
    // 跳過追蹤像素本身與退訂連結
    if (origUrl.includes("/api/track/") || origUrl.includes("{{unsubscribe}}")) continue;
    try {
      const { data: link } = await supabaseAdmin
        .from("email_links")
        .insert({ message_id: messageId, url: origUrl })
        .select("id")
        .single();
      if (link) {
        html = html.replace(origUrl, `${appBase}/api/track/click/${link.id}`);
      }
    } catch { /* 建立連結失敗不影響寄信 */ }
  }

  html += `<img src="${appBase}/api/track/open/${trackingId}" width="1" height="1" style="display:none" />`;

  // 更新訊息的替換後主旨
  await supabaseAdmin
    .from("outreach_messages")
    .update({ subject })
    .eq("id", messageId);

  await supabaseAdmin
    .from("outreach_messages")
    .update({ tracking_id: trackingId, status: "sending" })
    .eq("id", messageId);

  // 未設定任何寄信供應商 → 模擬寄出（開發/測試）
  if (provider === "none") {
    console.log(`[dispatchEmail] 模擬寄出 → ${msg.to_email}，主旨：${msg.subject}`);
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", messageId);
    return { ok: true };
  }

  const args = {
    to: msg.to_email,
    subject: subject || "HeroHerb 好漢草",
    html,
    from: `${fromName} <${fromEmail}>`,
    fromEmail,
    fromName,
  };

  try {
    const r =
      provider === "resend" ? await sendViaResend(args)
      : provider === "sendgrid" ? await sendViaSendgrid(args)
      : await sendViaSmtp(args, provider); // gmail | smtp

    if (!r.ok) {
      await supabaseAdmin
        .from("outreach_messages")
        .update({ status: "failed", error_detail: (r.error || "寄送失敗").slice(0, 500) })
        .eq("id", messageId);
      // 自動加入黑名單：依錯誤訊息判斷硬/軟退信（軟退信未達門檻不立即封鎖）
      const cls = classifyBounce(r.error || "");
      await addToBlacklist(msg.to_email, cls === "soft" ? "soft" : "failed", (r.error || "寄送失敗").slice(0, 200));
      return { ok: false, error: r.error || "寄送失敗" };
    }

    const sentAt = new Date().toISOString();
    await supabaseAdmin
      .from("outreach_messages")
      .update({
        status: "sent",
        sent_at: sentAt,
        provider_message_id: r.providerMessageId || null,
      })
      .eq("id", messageId);

    // 更新品牌狀態 + 寫入聯繫紀錄
    if (msg.brand_id) {
      // 狀態推進：新名單 → 已聯繫
      await supabaseAdmin
        .from("brands")
        .update({ status: "contacted", updated_at: sentAt })
        .eq("id", msg.brand_id)
        .eq("status", "new");
      // 寫入聯繫紀錄（outreach_logs）
      await supabaseAdmin
        .from("outreach_logs")
        .insert({
          brand_id: msg.brand_id,
          channel: "email",
          summary: `📧 寄送電子報「${subject || "（無主旨）"}」至 ${msg.to_email}`,
          created_at: sentAt,
        });
      // 更新照護計畫的最後聯繫日
      await supabaseAdmin
        .from("care_plans")
        .update({ last_contact_date: sentAt.slice(0, 10) })
        .eq("brand_id", msg.brand_id);
    }

    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "寄送失敗";
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "failed", error_detail: errMsg.slice(0, 500) })
      .eq("id", messageId);
    await addToBlacklist(msg.to_email, "failed", errMsg.slice(0, 200));
    return { ok: false, error: errMsg };
  }
}
