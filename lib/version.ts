// 版本編號與功能更新紀錄
// 每次發佈新功能時，更新 APP_VERSION 並在 CHANGELOG 最上方新增一筆。

export const APP_VERSION = "1.4.0";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.4.0",
    date: "2026-06-22",
    title: "AI 草稿、報價寄送、使用說明",
    items: [
      "郵件編輯器新增「✨ AI 生成」：輸入目的即用 Claude 生成草稿並帶入編輯區",
      "報價單可「✉ 寄給客戶」：用採集到的 Email 直接寄出並更新狀態",
      "新增「使用說明」頁：頁面流程、API 申請與設定、常見問題",
      "新增 SETUP.md 開發者設定指南（環境變數、金鑰、遷移）",
      "電子報實際寄送、AI 生成需分別設定 RESEND_API_KEY、ANTHROPIC_API_KEY",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-06-21",
    title: "產品報價模組 + 外發資料串接",
    items: [
      "新增「產品報價」模組：產品資料維護（售價/通路價/成本/毛利）與客製化報價單建立",
      "報價單支援多品項、折扣、自動單號、狀態追蹤與一鍵複製內容",
      "電子報收件名單改由採集到的聯絡管道（brand_channels）取得 Email，串接客戶資料",
      "郵件編輯器新增 11 組情境範本：初次/二次開發、產品介紹/提案、討論、節慶、報價、收款等",
      "手機版加入完整導航抽屜，功能與桌機側欄一致",
      "新增版本編號與功能更新紀錄",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-06-20",
    title: "AI 外發引擎",
    items: [
      "新增外發管道：郵件儀表板、電子報發送、郵件編輯器",
      "Email 開信/點擊追蹤、退信掃描、Resend 寄送整合",
      "工商登記比對新增 Google→mygov.tw 查詢路徑",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-19",
    title: "採集與比對中心",
    items: [
      "品牌數量上限突破 1000 筆（分頁取回全部資料）",
      "批次作業新增縣市、地區篩選",
      "管道補齊同時以品牌名與公司登記名搜尋",
      "客戶照護計畫（拜訪/回購週期）與今日跟進任務",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-15",
    title: "通路開發系統上線",
    items: [
      "名單總覽、商機進度、今日跟進、儀表板",
      "Google Places 採集、工商登記比對",
    ],
  },
];
