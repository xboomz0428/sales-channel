import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/brands
 * 查詢品牌列表（支援篩選）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const searchParams = request.nextUrl.searchParams;

    const industry = searchParams.get("industry");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // 輕量模式：只回基本欄位（無嵌入），給只需要名稱/email 的下拉選單用，速度快很多
    if (searchParams.get("view") === "lite") {
      let lq = supabase.from("brands").select("id, name, email, status, industry").order("name");
      if (industry) lq = lq.eq("industry", industry);
      if (status) lq = lq.eq("status", status);
      if (search) lq = lq.ilike("name", `%${search}%`);
      const PAGE = 1000;
      let rows: Record<string, unknown>[] = [];
      let off = 0;
      while (true) {
        const { data: pg, error: e } = await lq.range(off, off + PAGE - 1);
        if (e) return NextResponse.json({ success: false, error: e.message }, { status: 500 });
        if (!pg || pg.length === 0) break;
        rows = rows.concat(pg);
        if (pg.length < PAGE) break;
        off += PAGE;
      }
      return NextResponse.json({ success: true, data: rows, count: rows.length });
    }

    // 名單列表模式：只帶列表真正用到的欄位（管道、城市、商機、護理），
    // 不帶門市明細/評論/工商，payload 大幅縮小，並改用並行分頁加速。
    if (searchParams.get("view") === "list") {
      const sel = `*,
        brand_channels(channel, value),
        stores(city),
        opportunities(stage, est_annual_value, probability, stage_entered_at, lost_reason),
        care_plans(tier, last_order_date, reorder_cycle_days)`;
      const listQuery = () => {
        let q = supabase.from("brands").select(sel);
        if (industry) q = q.eq("industry", industry);
        if (status) q = q.eq("status", status);
        if (search) q = q.ilike("name", `%${search}%`);
        return q;
      };
      // 先取總數，再並行抓所有分頁（取代原本逐頁等待）
      let countQ = supabase.from("brands").select("id", { count: "exact", head: true });
      if (industry) countQ = countQ.eq("industry", industry);
      if (status) countQ = countQ.eq("status", status);
      if (search) countQ = countQ.ilike("name", `%${search}%`);
      const { count } = await countQ;
      const PAGE = 1000;
      const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
      const settled = await Promise.all(
        Array.from({ length: pages }, (_, i) => listQuery().range(i * PAGE, i * PAGE + PAGE - 1))
      );
      const rows: Record<string, unknown>[] = [];
      for (const r of settled) {
        if (r.error) return NextResponse.json({ success: false, error: r.error.message }, { status: 500 });
        if (r.data) rows.push(...(r.data as Record<string, unknown>[]));
      }
      return NextResponse.json({ success: true, data: rows, count: rows.length });
    }

    // gov_records 只帶待人工確認的低信心比對（採集中心「比對結果」分頁用）
    // store_reviews 只帶最新 5 筆（在 JS 層截取，Supabase JS 不支援 nested limit）
    const fullSelect = `*,
        brand_channels(channel, value),
        stores(id, name, address, city, phone, rating, review_count, gmaps_url, store_reviews(rating, text, author_name, relative_time)),
        gov_records(id, tax_id, name, owner_name, address, match_confidence),
        opportunities(stage, est_annual_value, probability, stage_entered_at, lost_reason),
        care_plans(tier, last_order_date, reorder_cycle_days)
      `;
    const fullQuery = () => {
      let q = supabase.from("brands").select(fullSelect).eq("gov_records.match_confidence", "low");
      if (industry) q = q.eq("industry", industry);
      if (status) q = q.eq("status", status);
      if (search) q = q.ilike("name", `%${search}%`);
      return q;
    };

    // 先取總數，再並行抓所有分頁（取代原本逐頁等待，減少往返時間）
    let cQ = supabase.from("brands").select("id", { count: "exact", head: true });
    if (industry) cQ = cQ.eq("industry", industry);
    if (status) cQ = cQ.eq("status", status);
    if (search) cQ = cQ.ilike("name", `%${search}%`);
    const { count: fullCount } = await cQ;
    const PAGE = 1000;
    const fullPages = Math.max(1, Math.ceil((fullCount ?? 0) / PAGE));
    const fullSettled = await Promise.all(
      Array.from({ length: fullPages }, (_, i) => fullQuery().range(i * PAGE, i * PAGE + PAGE - 1))
    );
    const all: Record<string, unknown>[] = [];
    for (const r of fullSettled) {
      if (r.error) return NextResponse.json({ success: false, error: r.error.message }, { status: 500 });
      if (r.data) all.push(...(r.data as Record<string, unknown>[]));
    }

    return NextResponse.json({
      success: true,
      data: all,
      count: all.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/brands
 * 新增品牌
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = getSupabaseServerClient();

    // 驗證必填欄位
    if (!body.name || !body.industry) {
      return NextResponse.json(
        { success: false, error: "品牌名稱和產業為必填" },
        { status: 400 }
      );
    }

    // 新增到 Supabase
    const { data, error } = await supabase
      .from("brands")
      .insert([
        {
          name: body.name,
          industry: body.industry,
          registered_name: body.registered_name,
          tax_id: body.tax_id,
          owner_name: body.owner_name,
          store_count: body.store_count || 1,
          status: "new",
          priority_score: body.priority_score,
        },
      ])
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data?.[0],
      message: "品牌新增成功",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "新增失敗" },
      { status: 500 }
    );
  }
}
