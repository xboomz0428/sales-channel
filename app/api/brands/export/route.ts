import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/brands/export
 * 匯出完整品牌清單 XLS（含管道連結、工商資料）
 */
export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data: brands } = await supabase
    .from("brands")
    .select(`
      id, name, industry, store_count, status, tax_id, owner_name,
      priority_score, pitch, created_at,
      brand_channels(channel, value),
      opportunities(est_annual_value, probability)
    `)
    .order("priority_score", { ascending: false });

  const rows = (brands ?? []).map((b) => {
    const ch: Record<string, string> = {};
    for (const c of (b.brand_channels as { channel: string; value: string }[] ?? [])) {
      ch[c.channel] = c.value;
    }
    const opp = (b.opportunities as { est_annual_value: number | null; probability: number | null }[] ?? [])[0];

    return {
      "品牌名稱":       b.name,
      "產業別":         b.industry ?? "",
      "分店數":         b.store_count ?? "",
      "狀態":           b.status ?? "",
      "評分":           b.priority_score ?? "",
      "統一編號":       b.tax_id ?? "",
      "負責人":         b.owner_name ?? "",
      "官網":           ch["website"] ?? "",
      "電話":           ch["phone"] ?? "",
      "LINE":           ch["line"] ?? ch["line_id"] ?? "",
      "Facebook":       ch["fb"] ?? "",
      "Instagram":      ch["ig"] ?? "",
      "StyleMap":       ch["stylemap"] ?? "",
      "預訂平台":       ch["booking"] ?? "",
      "Linktree":       ch["linktree"] ?? "",
      "Email":          ch["email"] ?? "",
      "預估年營收(NT$)": opp?.est_annual_value ?? "",
      "成交機率(%)":    opp?.probability ?? "",
      "備註":           b.pitch ?? "",
      "建立時間":       b.created_at ? new Date(b.created_at).toLocaleDateString("zh-TW") : "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // 欄寬
  ws["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 10 }, { wch: 32 }, { wch: 16 }, { wch: 16 },
    { wch: 32 }, { wch: 24 }, { wch: 32 }, { wch: 24 }, { wch: 24 },
    { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "品牌清單");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="HeroHerb_品牌清單_${date}.xlsx"`,
    },
  });
}
