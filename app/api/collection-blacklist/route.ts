import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET  /api/collection-blacklist  取得採集黑名單
 * POST /api/collection-blacklist  新增關鍵字
 * DELETE /api/collection-blacklist  刪除關鍵字（body: { id })
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.from("collection_blacklist").select("*").order("created_at", { ascending: false });
    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();
    const keyword = (body.keyword || "").trim();
    if (!keyword) return NextResponse.json({ success: false, error: "關鍵字不能為空" }, { status: 400 });
    const { data, error } = await supabase
      .from("collection_blacklist")
      .insert({ keyword, reason: body.reason || null })
      .select("id, keyword, reason")
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message.includes("duplicate") ? "此關鍵字已存在" : error.message }, { status: 400 });
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
    await supabase.from("collection_blacklist").delete().eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
