import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * 低價值名單遮蔽（黑名單）
 * POST /api/brands/mask
 *   body:
 *     action: 'mask' | 'unmask'
 *     ids?: string[]                        指定品牌
 *     industry?: string                     整個產業
 *     onlyMissingContact?: boolean          僅套用在「無電話且無 Email」者（預設 true）
 * 回傳 { success, affected }
 *
 * 遮蔽(enrich_state='masked')的品牌：批次採集直接跳過、清單可隱藏，省讀取與採集速度。
 * 解除(action='unmask')會把 masked / exhausted 都改回 active。
 */
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action === "unmask" ? "unmask" : "mask";
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const industry = body.industry ? String(body.industry) : null;
    const onlyMissingContact = body.onlyMissingContact === undefined ? true : Boolean(body.onlyMissingContact);
    const country = body.country ? String(body.country) : "TW";

    if (ids.length === 0 && !industry) {
      return NextResponse.json({ success: false, error: "請提供 ids 或 industry" }, { status: 400 });
    }

    // 目標品牌 id 清單
    let targetIds: string[] = ids;
    if (industry && ids.length === 0) {
      // 分頁取整個產業的 id（避開 1000 筆上限）
      const all: string[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("brands").select("id").eq("country", country).ilike("industry", `%${industry}%`)
          .range(from, from + PAGE - 1);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        const rows = data || [];
        all.push(...rows.map((r) => r.id));
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      targetIds = all;
    }
    if (targetIds.length === 0) return NextResponse.json({ success: true, affected: 0 });

    // 遮蔽時若限定「無聯絡方式」→ 先濾掉已有電話或 Email 的品牌（分塊查 brand_channels）
    if (action === "mask" && onlyMissingContact) {
      const withContact = new Set<string>();
      for (let i = 0; i < targetIds.length; i += 300) {
        const chunk = targetIds.slice(i, i + 300);
        const { data } = await supabase
          .from("brand_channels").select("brand_id")
          .in("brand_id", chunk).in("channel", ["phone", "email"]);
        for (const r of data || []) withContact.add(r.brand_id);
      }
      // stores.phone 也算有電話
      for (let i = 0; i < targetIds.length; i += 300) {
        const chunk = targetIds.slice(i, i + 300);
        const { data } = await supabase
          .from("stores").select("brand_id, phone").in("brand_id", chunk).not("phone", "is", null);
        for (const r of data || []) if (r.phone && String(r.phone).trim()) withContact.add(r.brand_id);
      }
      targetIds = targetIds.filter((id) => !withContact.has(id));
    }
    if (targetIds.length === 0) return NextResponse.json({ success: true, affected: 0 });

    // 分塊更新 enrich_state
    const newState = action === "unmask" ? "active" : "masked";
    let affected = 0;
    for (let i = 0; i < targetIds.length; i += 300) {
      const chunk = targetIds.slice(i, i + 300);
      let q = supabase.from("brands").update({ enrich_state: newState }).in("id", chunk);
      if (action === "unmask") q = q.neq("enrich_state", "active"); // 只改被遮蔽的
      const { data, error } = await q.select("id");
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      affected += (data || []).length;
    }

    return NextResponse.json({ success: true, affected });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "遮蔽失敗" }, { status: 500 });
  }
}
