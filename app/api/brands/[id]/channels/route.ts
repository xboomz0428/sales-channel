import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/brands/:id/channels
 * 手動新增或更新品牌聯絡管道
 * body: { channel: string, value: string }
 */
export async function POST(request: NextRequest, { params }: any) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const { channel, value } = await request.json();

    if (!channel || !value) {
      return NextResponse.json({ success: false, error: "channel 和 value 為必填" }, { status: 400 });
    }

    const { data: exist } = await supabase
      .from("brand_channels")
      .select("id")
      .eq("brand_id", id)
      .eq("channel", channel)
      .maybeSingle();

    if (exist) {
      await supabase
        .from("brand_channels")
        .update({ value, source_url: "manual", fetched_at: new Date().toISOString() })
        .eq("id", exist.id);
    } else {
      await supabase.from("brand_channels").insert({
        brand_id: id,
        channel,
        value,
        source_url: "manual",
        fetched_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "儲存失敗" }, { status: 500 });
  }
}

/**
 * DELETE /api/brands/:id/channels
 * 刪除品牌聯絡管道
 * body: { channel: string }
 */
export async function DELETE(request: NextRequest, { params }: any) {
  try {
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const { channel } = await request.json();

    if (!channel) {
      return NextResponse.json({ success: false, error: "channel 為必填" }, { status: 400 });
    }

    await supabase
      .from("brand_channels")
      .delete()
      .eq("brand_id", id)
      .eq("channel", channel);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
