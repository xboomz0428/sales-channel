import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET  /api/quotes      報價單列表（含品牌名）
 * POST /api/quotes      建立報價單（含明細）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const brandId = request.nextUrl.searchParams.get("brand_id");

    let query = supabase
      .from("quotes")
      .select("*, brands(name), quote_items(id, name, spec, unit, unit_price, qty, amount, sort_order)")
      .order("created_at", { ascending: false });

    if (brandId) query = query.eq("brand_id", brandId);

    const { data, error } = await query.limit(100000);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [], count: data?.length || 0 });
  } catch {
    return NextResponse.json({ success: false, error: "查詢失敗" }, { status: 500 });
  }
}

interface QuoteItemInput {
  product_id?: string | null;
  name: string;
  spec?: string;
  unit?: string;
  unit_price: number;
  qty: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const items: QuoteItemInput[] = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "報價單至少需要一個品項" }, { status: 400 });
    }

    // 計算金額
    const computed = items.map((it, i) => {
      const unit_price = Number(it.unit_price) || 0;
      const qty = Number(it.qty) || 0;
      return {
        product_id: it.product_id || null,
        name: it.name,
        spec: it.spec || null,
        unit: it.unit || "組",
        unit_price,
        qty,
        amount: unit_price * qty,
        sort_order: i,
      };
    });
    const subtotal = computed.reduce((s, it) => s + it.amount, 0);
    const discountPct = Number(body.discount_pct) || 0;
    const discountAmt = body.discount_amt !== undefined
      ? Number(body.discount_amt) || 0
      : Math.round((subtotal * discountPct) / 100);
    const total = subtotal - discountAmt;

    // 產生報價單號 Q-YYYYMMDD-NNN
    const today = new Date();
    const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const { count } = await supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${today.toISOString().slice(0, 10)}T00:00:00Z`);
    const quoteNo = `Q-${datePart}-${String((count || 0) + 1).padStart(3, "0")}`;

    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .insert([{
        quote_no: quoteNo,
        brand_id: body.brand_id || null,
        customer_name: body.customer_name || null,
        title: body.title || "產品報價單",
        status: body.status || "draft",
        valid_days: Number(body.valid_days) || 30,
        subtotal,
        discount_pct: discountPct,
        discount_amt: discountAmt,
        total,
        note: body.note || null,
      }])
      .select()
      .single();
    if (qErr || !quote) {
      return NextResponse.json({ success: false, error: qErr?.message || "建立失敗" }, { status: 400 });
    }

    const itemRows = computed.map((it) => ({ ...it, quote_id: quote.id }));
    const { error: iErr } = await supabase.from("quote_items").insert(itemRows);
    if (iErr) {
      await supabase.from("quotes").delete().eq("id", quote.id);
      return NextResponse.json({ success: false, error: iErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { ...quote, quote_items: itemRows } });
  } catch {
    return NextResponse.json({ success: false, error: "建立失敗" }, { status: 500 });
  }
}
