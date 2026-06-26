import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET    /api/outreach/schedule   列出排程（含模板名稱）
 * POST   /api/outreach/schedule   新增排程寄送
 *   body: { templateId, brandIds?, manualEmails?, scheduledAt, skipDuplicates?, note? }
 * DELETE /api/outreach/schedule   取消排程（body: { id }）
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("scheduled_sends")
      .select("id, template_id, brand_ids, manual_emails, scheduled_at, skip_duplicates, status, result, note, created_at")
      .order("scheduled_at", { ascending: true });
    const tplIds = [...new Set((data || []).map((r: any) => r.template_id).filter(Boolean))];
    const nameMap = new Map<string, { name: string; subject: string | null }>();
    if (tplIds.length) {
      const { data: tpls } = await supabase.from("outreach_templates").select("id, name, subject").in("id", tplIds);
      for (const t of tpls || []) nameMap.set(t.id, { name: t.name, subject: t.subject });
    }
    const rows = (data || []).map((r: any) => ({
      id: r.id,
      templateName: nameMap.get(r.template_id)?.name || "(模板已刪)",
      subject: nameMap.get(r.template_id)?.subject || null,
      count: (Array.isArray(r.brand_ids) ? r.brand_ids.length : 0) + (Array.isArray(r.manual_emails) ? r.manual_emails.length : 0),
      scheduledAt: r.scheduled_at,
      status: r.status,
      result: r.result,
      note: r.note,
    }));
    return NextResponse.json({ success: true, data: rows });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();
    const templateId = body.templateId as string;
    const brandIds: string[] = Array.isArray(body.brandIds) ? body.brandIds : [];
    const manualEmails = Array.isArray(body.manualEmails) ? body.manualEmails : [];
    const scheduledAt = body.scheduledAt as string;
    if (!templateId || !scheduledAt) {
      return NextResponse.json({ success: false, error: "缺少模板或排程時間" }, { status: 400 });
    }
    if (brandIds.length === 0 && manualEmails.length === 0) {
      return NextResponse.json({ success: false, error: "至少選一位收件人" }, { status: 400 });
    }
    const when = new Date(scheduledAt);
    if (isNaN(when.getTime())) {
      return NextResponse.json({ success: false, error: "排程時間格式錯誤" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("scheduled_sends")
      .insert({
        template_id: templateId,
        brand_ids: brandIds,
        manual_emails: manualEmails,
        scheduled_at: when.toISOString(),
        skip_duplicates: body.skipDuplicates !== false,
        note: body.note || null,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data?.id });
  } catch {
    return NextResponse.json({ success: false, error: "排程建立失敗" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    // 只能取消尚未送出的
    await supabase.from("scheduled_sends").update({ status: "canceled" }).eq("id", id).eq("status", "pending");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "取消失敗" }, { status: 500 });
  }
}
