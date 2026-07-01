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
    const country = searchParams.get("country");

    // 輕量模式：只回基本欄位（無嵌入），給只需要名稱/email 的下拉選單用，速度快很多
    if (searchParams.get("view") === "lite") {
      let lq = supabase.from("brands").select("id, name, email, status, industry").order("name");
      if (industry) lq = lq.eq("industry", industry);
      if (status) lq = lq.eq("status", status);
      if (search) lq = lq.ilike("name", `%${search}%`);
      if (country) lq = lq.eq("country", country); else lq = lq.eq("country", "TW");
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
        if (country) q = q.eq("country", country); else q = q.eq("country", "TW");
        return q;
      };
      // 先取總數，再並行抓所有分頁（取代原本逐頁等待）
      let countQ = supabase.from("brands").select("id", { count: "exact", head: true });
      if (industry) countQ = countQ.eq("industry", industry);
      if (status) countQ = countQ.eq("status", status);
      if (search) countQ = countQ.ilike("name", `%${search}%`);
      if (country) countQ = countQ.eq("country", country); else countQ = countQ.eq("country", "TW");
      const { count } = await countQ;
      const PAGE = 1000;
      // 名單量達數萬筆：一次抓全部的巢狀 join 會逾時。改為上限載入（預設最新 2000 筆，可用 limit 調整、上限 5000）。
      const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "2000", 10) || 2000, PAGE), 5000);
      const pages = Math.max(1, Math.min(Math.ceil((count ?? 0) / PAGE), Math.ceil(limit / PAGE)));
      const settled = await Promise.all(
        Array.from({ length: pages }, (_, i) => listQuery().order("created_at", { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1))
      );
      const rows: Record<string, unknown>[] = [];
      for (const r of settled) {
        if (r.error) return NextResponse.json({ success: false, error: r.error.message }, { status: 500 });
        if (r.data) rows.push(...(r.data as Record<string, unknown>[]));
      }
      return NextResponse.json({ success: true, data: rows, count: count ?? rows.length, limited: (count ?? 0) > rows.length });
    }

    // 只回 id 清單（給批次比對/補齊「完整選擇」用；分批處理避免逾時）。內部分頁抓齊。
    if (searchParams.get("view") === "ids") {
      const CAP = 30000;
      const PAGE = 1000;
      const ids: string[] = [];
      for (let off = 0; off < CAP; off += PAGE) {
        let q = supabase.from("brands").select("id").order("created_at", { ascending: false }).range(off, off + PAGE - 1);
        if (industry) q = q.ilike("industry", `%${industry}%`);
        if (status) q = q.eq("status", status);
        if (search) q = q.ilike("name", `%${search}%`);
        q = q.eq("country", country || "TW");
        const { data, error } = await q;
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        const rows = (data || []) as { id: string }[];
        ids.push(...rows.map((r) => r.id));
        if (rows.length < PAGE) break;
      }
      return NextResponse.json({ success: true, ids, count: ids.length });
    }

    // 統計層（第一層數據）：預設先讀這份完整統計，不用把全部名單抓進來；詳細資料再按需載入。
    if (searchParams.get("view") === "overview") {
      const { data, error } = await supabase
        .from("brands_overview").select("*")
        .eq("country", country || "TW")
        .order("total", { ascending: false });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      const rows = (data || []) as Record<string, number>[];
      const sum = (k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      const summary = {
        total: sum("total"),
        has_phone: sum("has_phone"), has_email: sum("has_email"), has_line: sum("has_line"),
        has_web: sum("has_web"), has_gov: sum("has_gov"),
        won: sum("won"), pipeline: sum("pipeline"), new_cnt: sum("new_cnt"),
        industries: rows.length,
      };
      return NextResponse.json({ success: true, summary, data: rows });
    }

    // 缺管道優先度：各產業缺多少管道（跨全部名單彙整），供比對中心排序/上色決定先採哪個
    if (searchParams.get("view") === "gaps") {
      const { data, error } = await supabase
        .from("industry_channel_gaps").select("*")
        .eq("country", country || "TW")
        .order("gap_score", { ascending: false });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: data || [] });
    }

    // 採集中心（比對中心）模式：清單輕量、有上限、可搜尋/篩選；詳情用 id 單筆補抓。
    // 名單量已達數萬筆，一次載全部含門市/評論的巢狀 join 會逾時 → 改成兩段式載入。
    if (searchParams.get("view") === "match") {
      const govLowFull = `*,
        brand_channels(channel, value),
        stores(id, name, address, city, phone, rating, review_count, gmaps_url, store_reviews(rating, text, author_name, relative_time)),
        gov_records(id, tax_id, name, owner_name, address, match_confidence),
        opportunities(stage, est_annual_value, probability, stage_entered_at, lost_reason),
        care_plans(tier, last_order_date, reorder_cycle_days)`;

      // 單筆完整詳情（詳情面板 lazy load）
      const id = searchParams.get("id");
      if (id) {
        const { data, error } = await supabase
          .from("brands").select(govLowFull)
          .eq("id", id).eq("gov_records.match_confidence", "low").single();
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data: [data] });
      }

      // 清單：只帶清單真正用到的欄位（無門市明細/評論），並限制筆數
      const lightSel = `id, name, industry, industry_sub, status, is_chain, chain_type, store_count,
        priority_score, tax_id, registered_name, owner_name, capital, setup_date, company_address,
        brand_channels(channel, value), stores(city, address),
        gov_records(id, tax_id, name, owner_name, match_confidence)`;
      const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "1000", 10) || 1000, 1), 5000);

      let mq = supabase.from("brands").select(lightSel).eq("gov_records.match_confidence", "low");
      if (industry) mq = mq.eq("industry", industry);
      if (status) mq = mq.eq("status", status);
      if (search) mq = mq.ilike("name", `%${search}%`);
      mq = mq.eq("country", country || "TW").order("created_at", { ascending: false }).range(0, limit - 1);

      let cQ2 = supabase.from("brands").select("id", { count: "exact", head: true });
      if (industry) cQ2 = cQ2.eq("industry", industry);
      if (status) cQ2 = cQ2.eq("status", status);
      if (search) cQ2 = cQ2.ilike("name", `%${search}%`);
      cQ2 = cQ2.eq("country", country || "TW");

      const [{ data, error }, { count }] = await Promise.all([mq, cQ2]);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: data || [], count: count ?? (data?.length ?? 0), limited: (count ?? 0) > (data?.length ?? 0) });
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
      if (country) q = q.eq("country", country); else q = q.eq("country", "TW");
      return q;
    };

    // 先取總數，再並行抓所有分頁（取代原本逐頁等待，減少往返時間）
    let cQ = supabase.from("brands").select("id", { count: "exact", head: true });
    if (industry) cQ = cQ.eq("industry", industry);
    if (status) cQ = cQ.eq("status", status);
    if (search) cQ = cQ.ilike("name", `%${search}%`);
    if (country) cQ = cQ.eq("country", country); else cQ = cQ.eq("country", "TW");
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
