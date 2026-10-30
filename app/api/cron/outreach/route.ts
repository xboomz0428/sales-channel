import { NextResponse } from "next/server";
import { requireCron, errorResponse } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchEmail } from "@/lib/outreach/dispatchEmail";
import { runSendBatch } from "@/lib/outreach/runSend";
import { getSendCaps, sentToday } from "@/lib/outreach/throttle";
import { claimAndSend, kickCampaignDrain } from "@/lib/outreach/drain";
import { notifyLine } from "@/lib/notify/line";
import { buildDailyReport } from "@/lib/notify/dailyMetrics";
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

      // runSendBatch 在「讀名單／去重／建立訊息」失敗時會丟錯（v3.6.4 起不再靜默）；
      // 一筆排程壞掉不能拖垮整天的排程：標 failed 留原因、繼續下一筆與後續的跟進／排空／日報。
      let r: Awaited<ReturnType<typeof runSendBatch>>;
      try {
        r = await runSendBatch({
          templateId: s.template_id,
          brandIds: Array.isArray(s.brand_ids) ? s.brand_ids : [],
          manualEmails: Array.isArray(s.manual_emails) ? s.manual_emails : [],
          skipDuplicates: s.skip_duplicates !== false,
          budget,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin.from("scheduled_sends").update({
          status: "failed",
          result: { sent: 0, failed: 0, queued: 0, skipped: 0, error: msg.slice(0, 300) },
        }).eq("id", s.id);
        notes.push(`⚠️ 排程「${schedNameMap.get(s.template_id) || "電子報"}」建立失敗：${msg.slice(0, 80)}`);
        continue;
      }
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

      // 取跟進模板（一次即可，勿在每位收件人迴圈內重查）
      const { data: fuTpl } = await supabaseAdmin
        .from("outreach_templates").select("subject, body, body_html").eq("id", rule.followup_template_id).single();
      if (!fuTpl || !fuTpl.body_html) continue;

      let ruleSent = 0;
      for (const o of origins) {
        if (budget <= 0) break;
        if (fuSet.has(o.id)) continue;
        // 條件判斷
        if (rule.condition === "no_open" && (o.open_count || 0) > 0) continue;
        if (rule.condition === "no_reply" && o.status === "replied") continue;
        if (!o.to_email) continue;
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

    // ── 自癒：卡在「寄送中」超過 15 分鐘（執行被平台中斷）→ 重設回佇列，讓下方補寄 ──
    try {
      const staleCut = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data: stale } = await supabaseAdmin
        .from("outreach_messages")
        .update({ status: "queued" })
        .eq("channel", "EM")
        .eq("status", "sending")
        .is("sent_at", null)
        // 以「認領時間」判斷（沒有認領時間的舊資料才退回 created_at）：一封信寄送只需約 10 秒，
        // 超過 15 分鐘仍 sending 才是真的被中斷；不會誤傷正在被另一棒寄送中的訊息
        .or("claimed_at.lt." + staleCut + ",and(claimed_at.is.null,created_at.lt." + staleCut + ")")
        .select("id");
      if (stale && stale.length > 0) notes.push(`♻️ 重設 ${stale.length} 封中斷的寄送回佇列`);
    } catch { /* 自癒失敗不影響其他工作 */ }

    // ── 活動續寄：舊路徑碎片併入活動；對還有排隊的活動觸發背景接力（受今日額度約束，額度用完自然停）──
    try {
      await supabaseAdmin.rpc("merge_legacy_email_batches");
      if (budget > 0) {
        const { data: camps } = await supabaseAdmin.rpc("email_campaigns", { p_limit: 50, p_id: null });
        const origin = new URL(req.url).origin;
        let kicked = 0;
        for (const c of (camps || []) as any[]) {
          if ((c.queued || 0) > 0 && (await kickCampaignDrain(origin, c.id, 0))) kicked++;
        }
        if (kicked > 0) notes.push("🚀 觸發 " + kicked + " 個活動背景續寄");
      }
    } catch { /* 續寄觸發失敗不影響下方佇列補寄 */ }

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
        const r = await claimAndSend(m.id); // 原子認領：與背景寄送並行也不重複
        if (r === "skipped") continue;
        budget--; drained++;
        if (r === "sent") totalSent++; else totalFailed++;
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

    // ── 序列推進（原 outreach-advance）────────────────
    try {
      const { data: dueEnroll } = await supabaseAdmin
        .from("outreach_enrollments")
        .select("id, brand_id, sequence_id, current_step")
        .eq("status", "active")
        .lte("next_action_at", nowIso)
        .limit(300);
      let advancedSeq = 0;
      for (const e of dueEnroll || []) {
        const nextStepOrder = e.current_step + 1;
        const { data: nextStep } = await supabaseAdmin
          .from("outreach_sequence_steps")
          .select("wait_days, channel, goal")
          .eq("sequence_id", e.sequence_id)
          .eq("step_order", nextStepOrder)
          .maybeSingle();
        if (!nextStep) {
          await supabaseAdmin.from("outreach_enrollments")
            .update({ status: "done", next_action_at: null })
            .eq("id", e.id).eq("status", "active");
          continue;
        }
        const at = new Date();
        at.setDate(at.getDate() + (nextStep.wait_days || 0));
        const { data: upd } = await supabaseAdmin.from("outreach_enrollments")
          .update({ current_step: nextStepOrder, next_action_at: at.toISOString() })
          .eq("id", e.id).eq("current_step", e.current_step).eq("status", "active").select("id");
        if (upd && upd.length) {
          advancedSeq++;
          await supabaseAdmin.from("followups").insert({
            brand_id: e.brand_id, due_date: at.toISOString(), done: false,
            note: `外聯序列第 ${nextStepOrder} 步(${nextStep.channel})${nextStep.goal ? `:${nextStep.goal}` : ""}`,
          });
        }
      }
      if (advancedSeq > 0) notes.push(`🔄 序列推進 ${advancedSeq} 筆`);
    } catch { /* 序列推進失敗不影響其他工作 */ }

    // ── LINE 早報（彙整：今日進度 + 平台數據 vs 昨日）──
    // 把本次排程實際執行的動作（寄信/退信/序列）一併納入彙整
    const execNotes = [...notes];
    if (totalSent + totalFailed > 0) execNotes.push(`自動化合計：成功 ${totalSent}、失敗 ${totalFailed}`);
    try {
      const message = await buildDailyReport(execNotes);
      await notifyLine(message);
    } catch {
      // 彙整失敗時退回簡易摘要，確保仍有通知
      if (notes.length > 0) {
        await notifyLine(`【電子報自動化】\n${notes.join("\n")}\n合計成功 ${totalSent}、失敗 ${totalFailed}。`);
      }
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
