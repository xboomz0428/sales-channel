import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCompany } from "@/lib/companyServer";
import type { CompanyInfo } from "@/lib/company";
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
      .select("*, brands(name, email), quote_items(id, name, sku, spec, unit, unit_price, list_price, qty, amount, sort_order)")
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
    const company = await getCompany();

    if (format === "excel") {
      return exportExcel(quote, items, customerName, money, company);
    } else if (format === "word") {
      return exportWord(quote, items, customerName, money, company);
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
  money: (n: number) => string,
  COMPANY: CompanyInfo
): NextResponse {
  const wb = XLSX.utils.book_new();
  const showList = !!quote.show_list_price;
  const NC = showList ? 7 : 6; // 欄數
  const pad = (arr: (string | number)[]): (string | number)[] => { while (arr.length < NC) arr.push(""); return arr; };
  // 合計列：標籤放倒數第二欄、數值放最後一欄
  const totalRow = (label: string, value: number, nc: number): (string | number)[] => {
    const r: (string | number)[] = new Array(nc).fill("");
    r[nc - 2] = label; r[nc - 1] = value;
    return r;
  };

  // 表頭欄位
  const header = showList
    ? ["品項名稱", "型號", "規格", "通路價格", "進貨價格", "數量", "總價"]
    : ["品項名稱", "型號", "規格", "進貨價格", "數量", "總價"];

  const sellerLine = [COMPANY.name, COMPANY.taxId ? `統編 ${COMPANY.taxId}` : "", `電話 ${COMPANY.phone}`, quote.sales_rep ? `業務 ${quote.sales_rep}` : ""].filter(Boolean).join("　");
  const buyerParts = [`客戶：${customerName}`];
  if (quote.buyer_tax_id) buyerParts.push(`統編 ${quote.buyer_tax_id}`);
  if (quote.buyer_contact) buyerParts.push(`窗口 ${quote.buyer_contact}`);
  if (quote.buyer_phone) buyerParts.push(`電話 ${quote.buyer_phone}`);

  // 建立資料陣列
  const data: (string | number)[][] = [
    pad([COMPANY.name]),
    pad([COMPANY.brand]),
    pad([sellerLine]),
    pad([]),
    pad([`報價單編號：${quote.quote_no || ""}`, "", "", `日期：${new Date(quote.created_at as string).toLocaleDateString("zh-TW")}`]),
    pad([buyerParts.join("　")]),
    pad([`有效期限：${quote.valid_days} 天`]),
    pad([]),
    header,
    ...items.map((it) => {
      const row: (string | number)[] = [
        it.name as string,
        (it.sku as string) || "",
        (it.spec as string) || "",
      ];
      if (showList) row.push(it.list_price != null ? (it.list_price as number) : "");
      row.push(it.unit_price as number, it.qty as number, (it.unit_price as number) * (it.qty as number));
      return row;
    }),
    pad([]),
    totalRow("總計", quote.total as number, NC),
    pad([]),
    pad([`備註：${quote.note || ""}`]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // 欄位寬度
  ws["!cols"] = showList
    ? [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }]
    : [{ wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];

  // 合併儲存格（公司抬頭橫跨整列）
  const last = NC - 1;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: last } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: last } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: last } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: last } },
    { s: { r: 6, c: 0 }, e: { r: 6, c: last } },
    { s: { r: data.length - 1, c: 0 }, e: { r: data.length - 1, c: last } },
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
  money: (n: number) => string,
  COMPANY: CompanyInfo
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

  const showList = !!quote.show_list_price;
  const headers = showList
    ? ["品項名稱", "型號", "規格", "通路價格", "進貨價格", "數量", "總價"]
    : ["品項名稱", "型號", "規格", "進貨價格", "數量", "總價"];
  const NC = headers.length;

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: primaryColor },
        borders: cellBorder,
        width: h === "品項名稱" ? { size: 30, type: WidthType.PERCENTAGE } : undefined,
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 18, color: "FFFFFF" })],
          alignment: h === "品項名稱" ? AlignmentType.LEFT : AlignmentType.CENTER,
        })],
      })
    ),
  });

  const cell = (idx: number, children: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) =>
    new TableCell({
      shading: { type: ShadingType.SOLID, color: idx % 2 === 0 ? "FFFFFF" : lightGray },
      borders: cellBorder,
      children: [new Paragraph({ children, alignment: align })],
    });

  const itemRows = items.map((it, idx) => {
    const cells = [
      cell(idx, [normal(it.name as string, 20)]),
      cell(idx, [normal((it.sku as string) || "—", 18, "666666")], AlignmentType.CENTER),
      cell(idx, [normal((it.spec as string) || "—", 18, "666666")], AlignmentType.CENTER),
    ];
    if (showList) cells.push(cell(idx, [normal(it.list_price != null ? money(it.list_price as number) : "—", 18, "999999")], AlignmentType.RIGHT));
    cells.push(cell(idx, [normal(money(it.unit_price as number), 20)], AlignmentType.RIGHT));
    cells.push(cell(idx, [normal(String(it.qty), 20)], AlignmentType.RIGHT));
    cells.push(cell(idx, [bold(money((it.unit_price as number) * (it.qty as number)), 20, primaryColor)], AlignmentType.RIGHT));
    return new TableRow({ children: cells });
  });

  // 小計/折扣/總計 rows
  const summaryRows: TableRow[] = [];
  const sumRow = (label: string, value: string, isTotal = false) =>
    new TableRow({
      children: [
        new TableCell({ borders: cellBorder, columnSpan: NC - 1, children: [new Paragraph({ children: [isTotal ? bold(label, 22, primaryColor) : normal(label)], alignment: AlignmentType.RIGHT })] }),
        new TableCell({
          shading: isTotal ? { type: ShadingType.SOLID, color: primaryColor } : undefined,
          borders: cellBorder,
          children: [new Paragraph({ children: [isTotal ? new TextRun({ text: value, bold: true, size: 22, color: "FFFFFF" }) : normal(value)], alignment: AlignmentType.RIGHT })],
        }),
      ],
    });

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
          children: [new TextRun({ text: COMPANY.name, bold: true, size: 36, color: primaryColor })],
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [new TextRun({ text: COMPANY.brand, size: 24, color: accentColor })],
        }),
        new Paragraph({
          children: [new TextRun({ text: [COMPANY.taxId ? `統一編號 ${COMPANY.taxId}` : "", `電話 ${COMPANY.phone}`, COMPANY.email, COMPANY.website].filter(Boolean).join("　|　"), size: 18, color: "888888" })],
        }),
        ...(quote.sales_rep ? [new Paragraph({ children: [normal(`報價業務：${quote.sales_rep as string}`, 18, "666666")], spacing: { after: 300 } })] : [new Paragraph({ spacing: { after: 300 } })]),

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
        ...(quote.buyer_tax_id ? [new Paragraph({ children: [bold("客戶統編：", 20), normal(quote.buyer_tax_id as string, 20)] })] : []),
        ...(quote.buyer_contact || quote.buyer_phone ? [new Paragraph({ children: [bold("聯絡窗口：", 20), normal([quote.buyer_contact, quote.buyer_phone].filter(Boolean).join("　"), 20)] })] : []),
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
          children: [normal([COMPANY.name, COMPANY.phone, COMPANY.website].join("　|　"), 16, "888888")],
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
