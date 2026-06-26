import { NextResponse } from "next/server";
import { requireCron, errorResponse } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchEmail } from "@/lib/outreach/dispatchEmail";
import { runSendBatch } from "@/lib/outreach/runSend";
import { getSendCaps, sentToday } from "@/lib/outreach/throttle";
import { notifyLine } from "@/lib/notify/line";
import { scanBounces } from "@/lib/outreach/scanBounces";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 電子報自動化排程器（Vercel Cron）
 * Hobby 方案 cron 一天一次，因此這支整合所有自動化工作：
 *  ① 處理到期的排程寄送
 *  ⑦ 處理自動跟進序列（寄出 N 天未開信/未回覆者）
 *  ④ 掃描退信並分類清理
 *  ③ 全程套用每日上限與每批上限（節流/暖機）
 *  排空既有 queued 訊息（含手動寄送超出當日額度的部分）
 * 完成後用 LINE 廣播通知結果。
 * （升級 Pro 後可把 vercel.json 改回每 5 分鐘，排程會更即時）
 */
export async function GET(req: Request) {
  try {
    requireCron(req);

    const { dailyCap, perRun } = await getSendCaps();
    const used = await sentToday();
    let budget = Math.max(0, Math.min(dailyCap - used, perRun)); // 本次可送出的封數
    const notes: string[] = [];
    let totalSent = 0, totalFailed = 0;

    // ── ① 到期排程寄送 ───────────────────────────────
    const nowIso = new Date().toISOString();
    const { data: dueSchedules } = await supabaseAdmin
      .from("scheduled_sends")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(20);
    // 模板名稱（template_id 無 FK，需另查）
    const schedTplIds = [...new Set((dueSchedules || []).map((s: any) => s.template_id).filter(Boolean))];
    const schedNameMap = new Map<string, string>();
    if (schedTplIds.length) {
      const { data: tn } = await supabaseAdmin.from("outreach_templates").select("id, name").in("id", schedTplIds);
      for (const t of tn || []) schedNameMap.set(t.id, t.name);
    }

    for (const s of dueSchedules || []) {
      if (budget <= 0) break;
      // 標記 sending（冪等：條件帶 status=pending）
      const { data: claimed } = await supabaseAdmin
        .from("scheduled_sends").update({ status: "sending" }).eq("id", s.id).eq("status", "pending").select("id");
      if (!claimed || claimed.length === 0) continue; // 已被別的執行處理

      const r = await runSendBatch({
        templateId: s.template_id,
        brandIds: Array.isArray(s.brand_ids) ? s.brand_ids : [],
        manualEmails: Array.isArray(s.manual_emails) ? s.manual_emails : [],
        skipDuplicates: s.skip_duplicates !== false,
        budget,
      });
      budget -= r.dispatched;
      totalSent += r.sent; totalFailed += r.failed;
      const leftover = r.queued;
      await supabaseAdmin.from("scheduled_sends").update({
        status: leftover > 0 ? "sending" : "done",
        result: { sent: r.sent, failed: r.failed, queued: leftover, skipped: r.skipped },
      }).eq("id", s.id);
      const tplName = schedNameMap.get(s.template_id) || "電子報";
      notes.push(`📧 排程「${tplName}」寄出 ${r.sent} 封${r.failed ? `，失敗 ${r.failed}` : ""}${leftover ? `，排隊 ${leftover}` : ""}${r.skipped ? `，略過重複 ${r.skipped}` : ""}`);
    }

    // ── ⑦ 自動跟進序列 ──────────────────────────────
    const { data: rules } = await supabaseAdmin.from("followup_rules").select("*").eq("active", true);
    for (const rule of rules || []) {
      if (budget <= 0) break;
      const cutoff = new Date(Date.now() - (rule.days_after || 3) * 86400_000).toISOString();
      // 找符合觸發模板、已寄出、超過 N 天的原始信
      const { data: origins } = await supabaseAdmin
        .from("outreach_messages")
        .select("id, brand_id, to_email, open_count, status")
        .eq("template_id", rule.trigger_template_id)
        .eq("status", "sent")
        .lte("sent_at", cutoff)
        .limit(200);
      if (!origins || origins.length === 0) continue;

      // 已跟進過的原始信（避免重複）
      const originIds = origins.map((o: any) => o.id);
      const { data: alreadyFu } = await supabaseAdmin
        .from("outreach_messages").select("parent_message_id").eq("followup_rule_id", rule.id).in("parent_message_id", originIds);
      const fuSet = new Set((alreadyFu || []).map((x: any) => x.parent_message_id));

      let ruleSent = 0;
      for (const o of origins) {
        if (budget <= 0) break;
        if (fuSet.has(o.id)) continue;
        // 條件判斷
        if (rule.condition === "no_open" && (o.open_count || 0) > 0) continue;
        if (rule.condition === "no_reply" && o.status === "replied") continue;
        if (!o.to_email) continue;
        // 取跟進模板
        const { data: fuTpl } = await supabaseAdmin
          .from("outreach_templates").select("subject, body, body_html").eq("id", rule.followup_template_id).single();
        if (!fuTpl || !fuTpl.body_html) break;
        const { data: msg } = await supabaseAdmin.from("outreach_messages").insert({
          brand_id: o.brand_id,
          channel: "EM", direction: "out", status: "queued",
          subject: fuTpl.subject, body: fuTpl.body || "", body_html: fuTpl.body_html,
          template_id: rule.followup_template_id, to_email: o.to_email,
          parent_message_id: o.id, followup_rule_id: rule.id,
        }).select("id").single();
        if (!msg) continue;
        const r = await dispatchEmail(msg.id);
        budget--;
        if (r.ok) { ruleSent++; totalSent++; } else { totalFailed++; }
      }
      if (ruleSent > 0) notes.push(`🔁 跟進「${rule.name}」寄出 ${ruleSent} 封`);
    }

    // ── 排空既有 queued（手動超量、排程剩餘等）────────
    let drained = 0;
    if (budget > 0) {
      const { data: q } = await supabaseAdmin
        .from("outreach_messages")
        .select("id")
        .eq("channel", "EM")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(budget);
      for (const m of q || []) {
        if (budget <= 0) break;
        const r = await dispatchEmail(m.id);
        budget--; drained++;
        if (r.ok) totalSent++; else totalFailed++;
      }
      if (drained > 0) notes.push(`📤 佇列補寄 ${drained} 封`);
    }

    // ── ④ 退信掃描清理 ───────────────────────────────
    let bounce = { scanned: 0, hard: 0, soft: 0, ignored: 0 };
    try {
      bounce = await scanBounces();
      if (bounce.hard + bounce.soft > 0) {
        notes.push(`📥 退信清理：硬退信 ${bounce.hard}、軟退信 ${bounce.soft}`);
      }
    } catch { /* 退信掃描失敗不影響其他工作 */ }

    // ── LINE 通知 ────────────────────────────────────
    if (notes.length > 0) {
      const summary = `【電子報自動化】\n${notes.join("\n")}\n合計成功 ${totalSent}、失敗 ${totalFailed}。`;
      await notifyLine(summary);
    }

    return NextResponse.json({
      ok: true,
      sent: totalSent, failed: totalFailed,
      schedules: dueSchedules?.length || 0,
      bounce,
      notes,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
