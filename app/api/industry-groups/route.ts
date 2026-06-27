import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET    /api/industry-groups        群組清單（含每群涵蓋品牌數）+ 可選產業清單(含各產業品牌數)
 * POST   /api/industry-groups        新增 { name, color, industries[] }
 * PATCH  /api/industry-groups        更新 { id, name?, color?, industries?, sort_order? } 或排序 { order:[{id,sort_order}] }
 * DELETE /api/industry-groups?id=    刪除
 */

async function industryCounts(supabase: ReturnType<typeof getSupabaseServerClient>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data } = await supabase.from("brands").select("industry").range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const b of data) {
      const ind = (b.industry as string) || "";
      if (ind) counts[ind] = (counts[ind] || 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return counts;
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const [{ data: groups }, counts] = await Promise.all([
      supabase.from("industry_groups").select("*").order("sort_order").order("created_at"),
      industryCounts(supabase),
    ]);
    const data = (groups || []).map((g) => {
      const inds = Array.isArray(g.industries) ? (g.industries as string[]) : [];
      const brandCount = inds.reduce((s, i) => s + (counts[i] || 0), 0);
      return { ...g, industries: inds, brandCount };
    });
    const availableIndustries = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return NextResponse.json({ success: true, data, availableIndustries });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ success: false, error: "群組名稱為必填" }, { status: 400 });
    const industries = Array.isArray(body.industries) ? body.industries.filter(Boolean) : [];
    const { count } = await supabase.from("industry_groups").select("id", { count: "exact", head: true });
    const { data, error } = await supabase
      .from("industry_groups")
      .insert([{ name, color: body.color || "#8FAAA4", industries, sort_order: count || 0 }])
      .select().single();
    if (error) {
      return NextResponse.json({ success: false, error: error.code === "23505" ? "群組名稱已存在" : error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "新增失敗" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    if (Array.isArray(body.order)) {
      for (const o of body.order) await supabase.from("industry_groups").update({ sort_order: o.sort_order }).eq("id", o.id);
      return NextResponse.json({ success: true });
    }
    const { id } = body;
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.color !== undefined) patch.color = body.color;
    if (body.industries !== undefined) patch.industries = Array.isArray(body.industries) ? body.industries.filter(Boolean) : [];
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    const { data, error } = await supabase.from("industry_groups").update(patch).eq("id", id).select().single();
    if (error) {
      return NextResponse.json({ success: false, error: error.code === "23505" ? "群組名稱已存在" : error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    const { error } = await supabase.from("industry_groups").delete().eq("id", id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "刪除失敗" }, { status: 500 });
  }
}
