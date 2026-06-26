import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel,
  TableLayoutType, ShadingType,
} from "docx";

export const runtime = "nodejs";

/**
 * GET /api/quotes/:id/export?format=excel|word
 * 匯出報價單為 xlsx 或 docx
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const format = request.nextUrl.searchParams.get("format") || "excel";
    const supabase = getSupabaseServerClient();

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, brands(name, email), quote_items(id, name, spec, unit, unit_price, qty, amount, sort_order)")
      .eq("id", id)
      .single();

    if (error || !quote) {
      return NextResponse.json({ error: "報價單不存在" }, { status: 404 });
    }

    const items = (quote.quote_items || []).sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    );
    const customerName = quote.customer_name || (quote.brands as Record<string, string> | null)?.name || "";
    const money = (n: number) => `NT$${(n || 0).toLocaleString()}`;

    if (format === "excel") {
      return exportExcel(quote, items, customerName, money);
    } else if (format === "word") {
      return exportWord(quote, items, customerName, money);
    } else {
      return NextResponse.json({ error: "不支援的格式" }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "匯出失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Excel 匯出 ────────────────────────────────────────────────────────────
function exportExcel(
  quote: Record<string, unknown>,
  items: Record<string, unknown>[],
  customerName: string,
  money: (n: number) => string
): NextResponse {
  const wb = XLSX.utils.book_new();

  // 建立資料陣列
  const data: (string | number)[][] = [
    ["威斯邁國際有限公司", "", "", "", ""],
    ["HeroHerb 好漢草-漢方良品", "", "", "", ""],
    ["服務信箱: service@wesmilegood.com", "", "", "", ""],
    ["", "", "", "", ""],
    [`報價單編號：${quote.quote_no || ""}`, "", "", `日期：${new Date(quote.created_at as string).toLocaleDateString("zh-TW")}`, ""],
    [`客戶名稱：${customerName}`, "", "", `有效期限：${quote.valid_days} 天`, ""],
    ["", "", "", "", ""],
    ["品項名稱", "規格", "單價", "數量", "金額"],
    ...items.map((it) => [
      it.name as string,
      (it.spec as string) || "",
      it.unit_price as number,
      it.qty as number,
      (it.unit_price as number) * (it.qty as number),
    ]),
    ["", "", "", "", ""],
    ["", "", "小計", "", quote.subtotal as number],
    ...(quote.discount_amt as number) > 0
      ? [["", "", `折扣 ${quote.discount_pct}%`, "", -(quote.discount_amt as number)]]
      : [],
    ["", "", "總計", "", quote.total as number],
    ["", "", "", "", ""],
    [`備註：${quote.note || ""}`, "", "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // 欄位寬度
  ws["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];

  // 合併儲存格（標題）
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 2 } },
    { s: { r: data.length - 1, c: 0 }, e: { r: data.length - 1, c: 4 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "報價單");

  const raw = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const filename = `報價單_${quote.quote_no || "quote"}_${customerName}.xlsx`;

  return new Response(raw, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  }) as unknown as NextResponse;
}

// ── Word 匯出 ─────────────────────────────────────────────────────────────
async function exportWord(
  quote: Record<string, unknown>,
  items: Record<string, unknown>[],
  customerName: string,
  money: (n: number) => string
): Promise<NextResponse> {
  const primaryColor = "2E4535"; // 深綠
  const accentColor = "5A8266";  // 中綠
  const lightGray = "F5F3EE";

  const bold = (text: string, size = 22, color = "000000") =>
    new TextRun({ text, bold: true, size, color });
  const normal = (text: string, size = 20, color = "333333") =>
    new TextRun({ text, size, color });

  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cellBorder = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const headerRow = new TableRow({
    tableHeader: true,
    children: ["品項名稱", "規格", "單價", "數量", "金額"].map((h) =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: primaryColor },
        borders: cellBorder,
        width: h === "品項名稱" ? { size: 40, type: WidthType.PERCENTAGE } : undefined,
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 18, color: "FFFFFF" })],
          alignment: h === "品項名稱" ? AlignmentType.LEFT : AlignmentType.CENTER,
        })],
      })
    ),
  });

  const itemRows = items.map((it, idx) =>
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: idx % 2 === 0 ? "FFFFFF" : lightGray },
          borders: cellBorder,
          children: [new Paragraph({ children: [normal(it.name as string, 20)] })],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: idx % 2 === 0 ? "FFFFFF" : lightGray },
          borders: cellBorder,
          children: [new Paragraph({ children: [normal((it.spec as string) || "", 18, "666666")], alignment: AlignmentType.CENTER })],
        }),
        ...["unit_price", "qty"].map((k) =>
          new TableCell({
            shading: { type: ShadingType.SOLID, color: idx % 2 === 0 ? "FFFFFF" : lightGray },
            borders: cellBorder,
            children: [new Paragraph({ children: [normal(k === "unit_price" ? money(it[k] as number) : String(it[k]), 20)], alignment: AlignmentType.RIGHT })],
          })
        ),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: idx % 2 === 0 ? "FFFFFF" : lightGray },
          borders: cellBorder,
          children: [new Paragraph({ children: [bold(money((it.unit_price as number) * (it.qty as number)), 20, primaryColor)], alignment: AlignmentType.RIGHT })],
        }),
      ],
    })
  );

  // 小計/折扣/總計 rows
  const summaryRows: TableRow[] = [];
  const sumRow = (label: string, value: string, isTotal = false) =>
    new TableRow({
      children: [
        new TableCell({ borders: cellBorder, columnSpan: 4, children: [new Paragraph({ children: [isTotal ? bold(label, 22, primaryColor) : normal(label)], alignment: AlignmentType.RIGHT })] }),
        new TableCell({
          shading: isTotal ? { type: ShadingType.SOLID, color: primaryColor } : undefined,
          borders: cellBorder,
          children: [new Paragraph({ children: [isTotal ? new TextRun({ text: value, bold: true, size: 22, color: "FFFFFF" }) : normal(value)], alignment: AlignmentType.RIGHT })],
        }),
      ],
    });

  summaryRows.push(sumRow("小計", money(quote.subtotal as number)));
  if ((quote.discount_amt as number) > 0) {
    summaryRows.push(sumRow(`折扣 ${quote.discount_pct}%`, `-${money(quote.discount_amt as number)}`));
  }
  summaryRows.push(sumRow("總計", money(quote.total as number), true));

  const doc = new Document({
    styles: {
      paragraphStyles: [{
        id: "Normal", name: "Normal", run: { font: "Noto Sans TC", size: 20, color: "333333" },
      }],
    },
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
      },
      children: [
        // 公司標題
        new Paragraph({
          children: [new TextRun({ text: "威斯邁國際有限公司", bold: true, size: 36, color: primaryColor })],
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [new TextRun({ text: "HeroHerb 好漢草 — 漢方良品", size: 24, color: accentColor })],
        }),
        new Paragraph({
          children: [new TextRun({ text: "service@wesmilegood.com　|　www.heroherb.co", size: 18, color: "888888" })],
          spacing: { after: 300 },
        }),

        // 報價資訊
        new Paragraph({
          border: { bottom: { style: BorderStyle.THICK, size: 4, color: primaryColor } },
          spacing: { after: 200 },
          children: [
            bold("報 價 單", 36, primaryColor),
            new TextRun({ text: `　${quote.quote_no || ""}`, size: 22, color: "888888" }),
          ],
        }),
        new Paragraph({ children: [bold("客戶名稱：", 20), normal(customerName, 20)] }),
        new Paragraph({ children: [bold("報價日期：", 20), normal(new Date(quote.created_at as string).toLocaleDateString("zh-TW"), 20)] }),
        new Paragraph({
          children: [bold("報價有效期：", 20), normal(`${quote.valid_days} 天`, 20)],
          spacing: { after: 300 },
        }),

        // 品項表格
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [headerRow, ...itemRows, ...summaryRows],
        }),

        // 備註
        ...(quote.note ? [
          new Paragraph({ spacing: { before: 300 } }),
          new Paragraph({ children: [bold("備註", 20, primaryColor)] }),
          new Paragraph({ children: [normal(quote.note as string, 18, "555555")], spacing: { after: 200 } }),
        ] : []),

        // 頁尾
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
          spacing: { before: 400 },
          children: [normal("威斯邁國際有限公司　|　(02)2631-8499　|　www.heroherb.co", 16, "888888")],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const filename = `報價單_${quote.quote_no || "quote"}_${customerName}.docx`;

  return new Response(ab, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  }) as unknown as NextResponse;
}
