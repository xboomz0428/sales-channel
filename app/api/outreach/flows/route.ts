import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

interface StepInput { subject?: string; bodyHtml?: string; body?: string; daysAfter?: number; condition?: string }

// 把內嵌編輯器的 HTML 包成可寄送的 email（dispatchEmail 會再注入追蹤與退訂）
function wrapEmailHtml(subject: string, inner: string): string {
  const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f3f0e7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#fffdf8;border-radius:14px;padding:32px;font-family:'Noto Sans TC',sans-serif;font-size:15px;line-height:1.75;color:#3a3a3a;">
<tr><td>${inner || ""}</td></tr>
<tr><td style="padding-top:20px;font-size:11px;color:#9a9384;">HeroHerb 好漢草 · 若不想再收到信件，請<a href="{{unsubscribe}}" style="color:#9a9384;">點此退訂</a></td></tr>
</table></td></tr></table></body></html>`;
}
const stripTags = (s = "") => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const COND = ["no_open", "no_reply", "always"];

/** GET：列出所有自訂流程（含各步驟模板與串接條件） */
export async function GET() {
  try {
    const sb = getSupabaseServerClient();
    const { data: flows } = await sb.from("outreach_flows").select("*").order("created_at", { ascending: false });
    const ids = (flows || []).map((f) => f.id);
    const stepsByFlow = new Map<string, any[]>();
    const rulesByFlow = new Map<string, any[]>();
    if (ids.length) {
      const { data: tpls } = await sb.from("outreach_templates").select("id, subject, body_html, blocks_json, flow_id, flow_step").in("flow_id", ids).order("flow_step", { ascending: true });
      for (const t of tpls || []) { const a = stepsByFlow.get(t.flow_id) || []; a.push(t); stepsByFlow.set(t.flow_id, a); }
      const { data: rules } = await sb.from("followup_rules").select("followup_template_id, days_after, condition").in("flow_id", ids);
      for (const r of rules || []) { const a = rulesByFlow.get(r.followup_template_id) || []; a.push(r); rulesByFlow.set(r.followup_template_id, a); }
    }
    const data = (flows || []).map((f) => ({
      id: f.id, name: f.name, active: f.active,
      steps: (stepsByFlow.get(f.id) || []).map((t, i) => {
        const rule = (rulesByFlow.get(t.id) || [])[0];
        // blocks_json 存的是「編輯器內的原始內容」（body_html 是包好可寄的完整版）
        return { templateId: t.id, subject: t.subject || "", bodyHtml: t.blocks_json || "", daysAfter: i === 0 ? 0 : (rule?.days_after ?? 3), condition: i === 0 ? "always" : (rule?.condition ?? "no_open") };
      }),
    }));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "查詢失敗" }, { status: 500 });
  }
}

/** POST：新建/重建流程。body: { id?, name, active?, steps: StepInput[] } */
export async function POST(req: Request) {
  try {
    const sb = getSupabaseServerClient();
    const b = await req.json().catch(() => ({}));
    const name = String(b.name || "").trim();
    const steps: StepInput[] = Array.isArray(b.steps) ? b.steps : [];
    const active = b.active === undefined ? true : Boolean(b.active);
    if (!name) return NextResponse.json({ success: false, error: "請輸入流程名稱" }, { status: 400 });
    if (steps.length === 0) return NextResponse.json({ success: false, error: "至少要有一封 email" }, { status: 400 });

    // 建立或取用流程
    let flowId: string = b.id ? String(b.id) : "";
    if (flowId) {
      await sb.from("outreach_flows").update({ name, active, updated_at: new Date().toISOString() }).eq("id", flowId);
      // 重建：先清掉舊步驟的規則與模板（模板軟刪除）
      await sb.from("followup_rules").delete().eq("flow_id", flowId);
      await sb.from("outreach_templates").update({ is_active: false, flow_id: null }).eq("flow_id", flowId);
    } else {
      const { data: f, error } = await sb.from("outreach_flows").insert({ name, active }).select("id").single();
      if (error || !f) return NextResponse.json({ success: false, error: error?.message || "建立流程失敗" }, { status: 500 });
      flowId = f.id;
    }

    // 每步驟建一個模板
    const tplIds: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const subject = String(s.subject || `${name} 第 ${i + 1} 封`).slice(0, 200);
      const inner = String(s.bodyHtml || "");
      const { data: t, error } = await sb.from("outreach_templates").insert({
        name: `${name} · 第 ${i + 1} 封`, channel: "EM", language: "zh",
        subject, body: stripTags(inner) || "(內容)", body_html: wrapEmailHtml(subject, inner),
        blocks_json: inner, // 保存編輯器原始內容供回填編輯（不含 email 外框）
        flow_id: flowId, flow_step: i, is_active: true,
      }).select("id").single();
      if (error || !t) return NextResponse.json({ success: false, error: error?.message || "建立模板失敗" }, { status: 500 });
      tplIds.push(t.id);
    }

    // 相鄰步驟串成 followup_rules（第 2 封起）
    for (let i = 1; i < steps.length; i++) {
      const s = steps[i];
      await sb.from("followup_rules").insert({
        name: `${name} · 第 ${i } → ${i + 1} 封`,
        trigger_template_id: tplIds[i - 1], followup_template_id: tplIds[i],
        days_after: Math.max(1, parseInt(String(s.daysAfter), 10) || 3),
        condition: COND.includes(String(s.condition)) ? s.condition : "no_open",
        active, flow_id: flowId,
      });
    }

    return NextResponse.json({ success: true, id: flowId, firstTemplateId: tplIds[0], steps: tplIds.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "儲存失敗" }, { status: 500 });
  }
}

/** PATCH：啟用/停用流程（連動其規則） */
export async function PATCH(req: Request) {
  try {
    const sb = getSupabaseServerClient();
    const { id, active } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    await sb.from("outreach_flows").update({ active: !!active, updated_at: new Date().toISOString() }).eq("id", id);
    await sb.from("followup_rules").update({ active: !!active }).eq("flow_id", id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "更新失敗" }, { status: 500 });
  }
}

/** DELETE：刪除整個流程（規則刪除、模板軟刪除） */
export async function DELETE(req: Request) {
  try {
    const sb = getSupabaseServerClient();
    const { id } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    await sb.from("followup_rules").delete().eq("flow_id", id);
    await sb.from("outreach_templates").update({ is_active: false, flow_id: null }).eq("flow_id", id);
    await sb.from("outreach_flows").delete().eq("id", id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "刪除失敗" }, { status: 500 });
  }
}
