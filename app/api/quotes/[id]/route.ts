import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET    /api/quotes/:id   報價單詳情
 * PATCH  /api/quotes/:id   更新狀態（draft/sent/accepted…）
 * DELETE /api/quotes/:id   刪除報價單（連帶明細）
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const { data, error } = await supabase
      .from("quotes")
      .select("*, brands(name, email), quote_items(id, name, spec, unit, unit_price, qty, amount, sort_order)")
      .eq("id", id)
      .single();
    if (error) {
      return NextResponse.json({ success: false, error: "報價單不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["status", "title", "customer_name", "note"]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }

    const { data, error } = await supabase
      .from("quotes")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
