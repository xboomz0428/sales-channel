import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * 工商登記比對差異的人工確認
 *
 * gov/lookup 低信心比對結果只寫 gov_records（match_confidence='low'），
 * 不自動回寫品牌；由採集中心「比對結果」分頁人工裁決：
 *
 * POST /api/gov/conflicts
 *   { record_id, accept: true }   → 採用：回寫品牌統編/登記名/負責人/資本額，記錄標為 accepted
 *   { record_id, accept: false }  → 忽略：記錄標為 rejected，之後不再出現
 *
 * GET /api/gov/conflicts → 所有待確認（low）紀錄
 */

export async function POST(request: NextRequest) {
  let body: { record_id?: string; accept?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "參數格式錯誤" }, { status: 400 });
  }
  if (!body.record_id || typeof body.accept !== "boolean") {
    return NextResponse.json({ success: false, error: "請提供 record_id 與 accept" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  try {
    const { data: rec, error } = await supabase
      .from("gov_records")
      .select("id, tax_id, name, owner_name, extra, matched_brand_id, match_confidence")
      .eq("id", body.record_id)
      .single();
    if (error || !rec) {
      return NextResponse.json({ success: false, error: "紀錄不存在" }, { status: 404 });
    }

    if (body.accept) {
      if (!rec.matched_brand_id) {
        return NextResponse.json({ success: false, error: "此紀錄未關聯品牌" }, { status: 400 });
      }
      const extra = (rec.extra || {}) as { Capital_Stock_Amount?: number };
      const patch: Record<string, unknown> = {
        registered_name: rec.name,
        updated_at: new Date().toISOString(),
      };
      if (rec.tax_id) patch.tax_id = rec.tax_id;
      if (rec.owner_name) patch.owner_name = rec.owner_name;
      if (extra.Capital_Stock_Amount) patch.capital = extra.Capital_Stock_Amount;

      const { error: upErr } = await supabase.from("brands").update(patch).eq("id", rec.matched_brand_id);
      if (upErr) {
        // brands.tax_id 有 unique 約束——統編已掛在別的品牌時會失敗
        const msg = upErr.message.includes("duplicate")
          ? "此統編已存在於其他品牌，請先處理重複品牌"
          : upErr.message;
        return NextResponse.json({ success: false, error: msg }, { status: 409 });
      }
    }

    await supabase
      .from("gov_records")
      .update({ match_confidence: body.accept ? "accepted" : "rejected" })
      .eq("id", rec.id);

    return NextResponse.json({ success: true, data: { record_id: rec.id, accepted: body.accept } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "處理失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("gov_records")
      .select("id, source, tax_id, name, address, owner_name, match_confidence, matched_brand_id, imported_at")
      .eq("match_confidence", "low")
      .order("imported_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}
