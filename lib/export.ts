/**
 * Excel 匯出工具函數
 */

interface ExportData {
  brands: any[];
  filename?: string;
}

export function exportToExcel(data: ExportData) {
  const { brands, filename = "leads_export.csv" } = data;

  // 轉換為 CSV 格式（簡化版，實際應用可用 xlsx 庫）
  const headers = [
    "品牌名稱",
    "產業",
    "分店數",
    "城市",
    "統編",
    "負責人",
    "優先分數",
    "狀態",
    "聯繫管道",
  ];

  const rows = brands.map((brand) => [
    brand.name,
    brand.industry,
    brand.stores,
    brand.cities,
    brand.tax_id || "",
    brand.owner || "",
    brand.score,
    brand.status,
    brand.channels.join(";"),
  ]);

  // CSV 內容
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  // 建立下載鏈接
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 生成 Excel 檔案名稱（含日期）
 */
export function generateExcelFilename(prefix = "leads") {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0");
  return `${prefix}_${date}_${time}.csv`;
}
