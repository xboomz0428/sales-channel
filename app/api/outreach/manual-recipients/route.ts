import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET  /api/outreach/manual-recipients  取得手動新增的收件人
 * POST /api/outreach/manual-recipients  新增一筆
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("manual_recipients")
      .select("id, name, email, note, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();
    const email = (body.email || "").trim();
    const name = (body.name || "").trim() || email;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      return NextResponse.json({ success: false, error: "Email 格式不正確" }, { status: 400 });
    }
    // 先查是否已存在（含停用的），有就更新啟用；無就新增
    const { data: existing } = await supabase
      .from("manual_recipients")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    let data;
    if (existing) {
      const { data: updated, error } = await supabase
        .from("manual_recipients")
        .update({ name, note: body.note || null, is_active: true })
        .eq("id", existing.id)
        .select("id, name, email")
        .single();
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      data = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("manual_recipients")
        .insert({ email, name, note: body.note || null, is_active: true })
        .select("id, name, email")
        .single();
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      data = inserted;
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "新增失敗" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    await supabase.from("manual_recipients").update({ is_active: false }).eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
