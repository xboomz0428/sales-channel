import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * 自動跟進序列規則
 * GET    取得所有規則（含模板名）
 * POST   新增（body: { name, triggerTemplateId, followupTemplateId, daysAfter, condition }）
 * PATCH  更新（body: { id, ...欄位 }）
 * DELETE 刪除（body: { id }）
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("followup_rules")
      .select("*")
      .order("created_at", { ascending: false });
    // 模板名稱另外查（template_id 無 FK，無法用 PostgREST 內嵌）
    const tplIds = [...new Set((data || []).flatMap((r: any) => [r.trigger_template_id, r.followup_template_id]).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (tplIds.length) {
      const { data: tpls } = await supabase.from("outreach_templates").select("id, name").in("id", tplIds);
      for (const t of tpls || []) nameMap.set(t.id, t.name);
    }
    const rows = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      triggerTemplateId: r.trigger_template_id,
      followupTemplateId: r.followup_template_id,
      triggerName: nameMap.get(r.trigger_template_id) || "(已刪)",
      followupName: nameMap.get(r.followup_template_id) || "(已刪)",
      daysAfter: r.days_after,
      condition: r.condition,
      active: r.active,
    }));
    return NextResponse.json({ success: true, data: rows });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const b = await req.json();
    if (!b.name || !b.triggerTemplateId || !b.followupTemplateId) {
      return NextResponse.json({ success: false, error: "缺少必填欄位" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("followup_rules")
      .insert({
        name: b.name,
        trigger_template_id: b.triggerTemplateId,
        followup_template_id: b.followupTemplateId,
        days_after: Math.max(1, parseInt(b.daysAfter, 10) || 3),
        condition: ["no_open", "no_reply", "always"].includes(b.condition) ? b.condition : "no_open",
        active: b.active !== false,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data?.id });
  } catch {
    return NextResponse.json({ success: false, error: "新增失敗" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const b = await req.json();
    if (!b.id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.triggerTemplateId !== undefined) patch.trigger_template_id = b.triggerTemplateId;
    if (b.followupTemplateId !== undefined) patch.followup_template_id = b.followupTemplateId;
    if (b.daysAfter !== undefined) patch.days_after = Math.max(1, parseInt(b.daysAfter, 10) || 3);
    if (b.condition !== undefined) patch.condition = b.condition;
    if (b.active !== undefined) patch.active = !!b.active;
    const { error } = await supabase.from("followup_rules").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    await supabase.from("followup_rules").delete().eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
