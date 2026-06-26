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

    // gov_records 只帶待人工確認的低信心比對（採集中心「比對結果」分頁用）
    // store_reviews 只帶最新 5 筆（在 JS 層截取，Supabase JS 不支援 nested limit）
    let query = supabase
      .from("brands")
      .select(`*,
        brand_channels(channel, value),
        stores(id, name, address, city, phone, rating, review_count, gmaps_url, store_reviews(rating, text, author_name, relative_time)),
        gov_records(id, tax_id, name, owner_name, address, match_confidence),
        opportunities(stage, est_annual_value, probability, stage_entered_at, lost_reason),
        care_plans(tier, last_order_date, reorder_cycle_days)
      `)
      .eq("gov_records.match_confidence", "low");

    // 篩選條件
    if (industry) {
      query = query.eq("industry", industry);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    // Supabase PostgREST max-rows 預設 1000，需分頁取回全部
    const PAGE = 1000;
    let all: Record<string, unknown>[] = [];
    let offset = 0;
    while (true) {
      const { data: page, error: pageErr } = await query.range(offset, offset + PAGE - 1);
      if (pageErr) {
        return NextResponse.json(
          { success: false, error: pageErr.message },
          { status: 500 }
        );
      }
      if (!page || page.length === 0) break;
      all = all.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
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
