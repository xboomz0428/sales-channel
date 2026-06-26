import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

/**
 * POST /api/products/import
 * 接受 multipart/form-data，欄位 "file" 為 .xlsx 檔案
 * 自動對應好漢草產品清單格式（第 6 列為標題，第 7 列起為資料）
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "請上傳 xlsx 檔案" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 讀出全部 rows
    const allRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];

    // 找標題列（含「產品名稱」）
    let headerRow = 5; // 預設第 6 列（0-indexed = 5）
    for (let i = 0; i < Math.min(15, allRows.length); i++) {
      if (allRows[i].some((c) => String(c).includes("產品名稱"))) { headerRow = i; break; }
    }

    const headers = (allRows[headerRow] || []).map((h) => String(h).trim());
    const col = (name: string) => headers.findIndex((h) => h.includes(name));

    const colSku      = col("型號");
    const colBarcode  = col("條碼");
    const colName     = col("產品名稱");
    const colNameEn   = col("英文");
    const colSpec     = col("重量") !== -1 ? col("重量") : col("數量");
    const colShelf    = col("效期");
    const colIngr     = col("成分");
    const colTarget   = col("對象") !== -1 ? col("對象") : col("用途");
    const colListP    = col("牌價") !== -1 ? col("牌價") : col("訂價");
    const colChanP    = col("售價");
    const colBox      = col("箱入");
    const colMinOrd   = col("最低");

    const parsePrice = (raw: string): number => {
      if (!raw) return 0;
      const cleaned = String(raw).replace(/[^\d.]/g, "");
      return parseFloat(cleaned) || 0;
    };

    const rows = allRows.slice(headerRow + 1);
    const products: Record<string, unknown>[] = [];

    for (const row of rows) {
      const name = colName >= 0 ? String(row[colName] || "").trim() : "";
      if (!name || name.startsWith("合計") || name.startsWith("小計")) continue;
      // 跳過重複出現的標題列 / 範例列（避免把欄位名稱當成產品匯入）
      if (name === "產品名稱" || name === "品名" || name === "商品名稱") continue;

      const sku       = colSku >= 0 ? String(row[colSku] || "").trim() : null;
      if (sku === "型號" || sku === "貨號") continue;
      const barcode   = colBarcode >= 0 ? String(row[colBarcode] || "").trim() : null;
      const nameEn    = colNameEn >= 0 ? String(row[colNameEn] || "").trim() : null;
      const spec      = colSpec >= 0 ? String(row[colSpec] || "").trim() : null;
      const shelf     = colShelf >= 0 ? String(row[colShelf] || "").trim() : null;
      const ingr      = colIngr >= 0 ? String(row[colIngr] || "").trim() : null;
      const target    = colTarget >= 0 ? String(row[colTarget] || "").trim() : null;
      const listPrice = colListP >= 0 ? parsePrice(String(row[colListP] || "")) : 0;
      const chanPrice = colChanP >= 0 ? parsePrice(String(row[colChanP] || "")) : 0;
      const minOrd    = colMinOrd >= 0 ? parseInt(String(row[colMinOrd] || "0")) || 1 : 1;

      // 效期、條碼為獨立欄位；說明欄只放英文名稱/成分/適用
      const descParts: string[] = [];
      if (nameEn) descParts.push(`英文名稱：${nameEn}`);
      if (ingr)   descParts.push(`成分：${ingr}`);
      if (target) descParts.push(`適用：${target}`);

      products.push({
        name,
        sku: sku || null,
        barcode: barcode || null,
        shelf_life: shelf || null,
        category: null,
        spec: spec || null,
        unit: "個",
        list_price: listPrice,
        channel_price: chanPrice,
        cost_price: 0,
        min_order: minOrd > 0 ? minOrd : 1,
        lead_days: 7,
        description: descParts.length ? descParts.join("　") : null,
        sort_order: products.length,
      });
    }

    if (products.length === 0) {
      return NextResponse.json({ success: false, error: "未找到有效產品資料，請確認 xlsx 格式" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    let inserted = 0, updated = 0, failed = 0;

    for (const p of products) {
      const sku = p.sku as string | null;
      if (sku) {
        // 有型號：upsert by sku
        const { data: exist } = await supabase.from("products").select("id").eq("sku", sku).single();
        if (exist) {
          const { error } = await supabase.from("products").update(p).eq("sku", sku);
          error ? failed++ : updated++;
        } else {
          const { error } = await supabase.from("products").insert([p]);
          error ? failed++ : inserted++;
        }
      } else {
        // 無型號：upsert by name
        const { data: exist } = await supabase.from("products").select("id").eq("name", p.name as string).single();
        if (exist) {
          const { error } = await supabase.from("products").update(p).eq("name", p.name as string);
          error ? failed++ : updated++;
        } else {
          const { error } = await supabase.from("products").insert([p]);
          error ? failed++ : inserted++;
        }
      }
    }

    return NextResponse.json({ success: true, total: products.length, inserted, updated, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "匯入失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
