import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

/**
 * GET /api/brands/template
 * 下載品牌批次匯入樣板 XLS
 */
export async function GET() {
  const wb = XLSX.utils.book_new();

  // ── 主資料工作表 ────────────────────────────────────
  const headers = [
    "品牌名稱*",
    "產業別",
    "分店數",
    "城市（逗號分隔）",
    "統一編號",
    "負責人",
    "官網",
    "電話",
    "LINE",
    "Facebook",
    "Instagram",
    "預估年營收(NT$)",
    "成交機率(%)",
    "狀態",
    "備註",
  ];

  const examples = [
    ["Rosa越式洗髮", "越式洗髮", 5, "台北市,新北市", "", "阮○○", "https://rosa-viet.com.tw", "02-2345-6789", "@rosa_viet", "https://facebook.com/rosaviet", "", 600000, 40, "contacted", "連鎖品牌，建議從旗艦店切入"],
    ["青松養生館", "養生館", 3, "台中市", "12345678", "李○○", "", "04-2234-5678", "", "", "", 360000, 30, "new", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);

  // 欄寬
  ws["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 20 },
    { wch: 12 }, { wch: 10 }, { wch: 32 }, { wch: 16 },
    { wch: 16 }, { wch: 32 }, { wch: 24 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "品牌清單");

  // ── 說明工作表 ──────────────────────────────────────
  const infoData = [
    ["欄位說明"],
    [""],
    ["欄位名稱", "必填", "說明", "範例"],
    ["品牌名稱*", "是", "品牌或店名", "Rosa越式洗髮"],
    ["產業別", "否", "自由填寫或參考：養生館/越式洗髮/宮廟/長照/禮儀", "越式洗髮"],
    ["分店數", "否", "整數", "5"],
    ["城市（逗號分隔）", "否", "多城市用逗號", "台北市,新北市"],
    ["統一編號", "否", "8位數字（有限公司/股份有限公司）", "12345678"],
    ["負責人", "否", "姓名", "王○○"],
    ["官網", "否", "完整 URL，含 https://", "https://example.com"],
    ["電話", "否", "市話或手機", "02-2345-6789"],
    ["LINE", "否", "LINE ID 或 line.me 連結", "@example"],
    ["Facebook", "否", "粉絲專頁完整 URL", "https://facebook.com/xxx"],
    ["Instagram", "否", "帳號頁完整 URL", "https://instagram.com/xxx"],
    ["預估年營收(NT$)", "否", "整數，新台幣", "600000"],
    ["成交機率(%)", "否", "0~100 整數", "40"],
    ["狀態", "否", "new / contacted / sampling / quoting / negotiating / won / lost（預設 new）", "contacted"],
    ["備註", "否", "任意文字", "連鎖品牌"],
    [""],
    ["注意事項"],
    ["・標有 * 的欄位為必填"],
    ["・第一列為欄位名稱請勿刪除"],
    ["・第二列起為資料，範例列可刪除"],
    ["・重複的品牌名稱將自動略過（不覆蓋）"],
  ];

  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo["!cols"] = [{ wch: 20 }, { wch: 6 }, { wch: 52 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "欄位說明");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="HeroHerb_品牌匯入樣板.xlsx"',
    },
  });
}
