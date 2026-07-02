import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * 採集紀錄
 * GET  /api/collection-runs           最近 15 筆
 * POST /api/collection-runs           建立（回傳 id）
 * PATCH /api/collection-runs          更新成果/結束
 */
export async function GET() {
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb.from("collection_runs").select("*").order("created_at", { ascending: false }).limit(15);
    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const sb = getSupabaseServerClient();
    const { data, error } = await sb.from("collection_runs").insert({
      kind: String(b.kind || "gov"), label: b.label || null, scope: b.scope || null, total: Number(b.total) || 0,
    }).select("id").single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ success: false, error: "建立失敗" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    const sb = getSupabaseServerClient();
    const patch: Record<string, unknown> = {};
    for (const k of ["succeeded", "pending", "failed", "total"]) if (b[k] !== undefined) patch[k] = Number(b[k]) || 0;
    if (b.status) { patch.status = String(b.status); patch.finished_at = new Date().toISOString(); }
    if (b.detail) patch.detail = b.detail;
    await sb.from("collection_runs").update(patch).eq("id", String(b.id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "更新失敗" }, { status: 500 });
  }
}
