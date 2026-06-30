// 政府開放資料匯入 — Phase 1 來源設定
// 設計原則：政府開放資料的「下載網址」會變動（觀光署 V1.0 已於 2026/6/30 下架），
// 所以實際 URL 由使用者在匯入頁貼上/確認；這裡只定義「欄位對應」與來源中繼資料。
// 解析時以「表頭名稱」對應（順序變動也能對上），每個邏輯欄位給多個候選名稱。

export type SourceFormat = "csv" | "json";

export interface GovSource {
  id: string;            // data_source 值（gov:xxx）
  label: string;         // 顯示名稱
  industry: string;      // 寫入 brands.industry
  format: SourceFormat;  // 預設檔案格式
  hasPhone: boolean;     // 名冊本身是否含電話（決定匯進來能否直接外聯）
  datasetUrl: string;    // data.gov.tw 資料集頁（使用者由此取得實際下載連結）
  note?: string;
  // 邏輯欄位 → 候選表頭/JSON key（大小寫不敏感，取第一個非空）
  fields: {
    name:     string[];
    tax_id?:  string[];
    address?: string[];
    phone?:   string[];
    owner?:   string[];
    sub?:     string[];   // 次分類 → industry_sub
    website?: string[];
    // 旅宿專屬
    stars?:   string[];
    rooms?:   string[];
    htype?:   string[];
  };
  // 列過濾：某些名冊一個檔含多類，需依欄位值篩選（例如健保院所只留中醫）
  rowFilter?: { field: string[]; includes: string[] };
}

export const GOV_SOURCES: GovSource[] = [
  {
    id: "gov:funeral",
    label: "禮儀公司（殯葬禮儀服務業）",
    industry: "禮儀公司",
    format: "csv",
    hasPhone: false,
    datasetUrl: "https://data.gov.tw/dataset/32679",
    note: "公司登記名冊，有統編/負責人/地址；電話多半要靠官網爬蟲補。",
    fields: {
      name:    ["公司名稱", "營業人名稱", "機構名稱", "名稱"],
      tax_id:  ["統一編號", "統編", "營利事業統一編號"],
      address: ["公司所在地", "營業地址", "地址", "地址全址"],
      owner:   ["負責人", "代表人姓名", "負責人姓名"],
      phone:   ["電話", "聯絡電話", "電話號碼"],
    },
  },
  {
    id: "gov:lodging",
    label: "旅館 / 民宿（觀光署旅宿）",
    industry: "旅館",
    format: "json",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/7780",
    note: "觀光資料標準 V2.1 JSON，含電話、星級、客房數。Class 會自動分旅館/民宿。",
    fields: {
      name:    ["Name", "ChineseName", "名稱", "中文名稱"],
      address: ["Add", "Address", "地址", "AddressTW"],
      phone:   ["Tel", "Phone", "電話", "TelephoneNumber"],
      website: ["WebsiteUrl", "Website", "網址"],
      htype:   ["Class", "類型", "Category"],
      stars:   ["HotelStars", "Stars", "星級"],
      rooms:   ["TotalRooms", "RoomNum", "客房數", "Rooms"],
    },
  },
  {
    id: "gov:travel",
    label: "旅行社（旅行業基本資料）",
    industry: "旅行社",
    format: "csv",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/72074",
    note: "含統編、地址、電話、負責人、註冊別（綜合/甲種/乙種 → 次分類）。",
    fields: {
      name:    ["公司名稱", "中文名稱", "名稱", "旅行社名稱"],
      tax_id:  ["統一編號", "統編"],
      address: ["地址", "營業地址", "公司地址"],
      phone:   ["電話", "聯絡電話", "電話號碼"],
      owner:   ["負責人", "代表人", "負責人姓名"],
      sub:     ["註冊別", "種類", "旅行業別", "類別"],
    },
  },
  {
    id: "gov:tcm",
    label: "中醫診所（健保特約醫事機構）",
    industry: "中醫診所",
    format: "csv",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/39283",
    note: "健保特約院所清單，含電話/地址。自動只留『中醫』類別。",
    fields: {
      name:    ["醫事機構名稱", "機構名稱", "名稱"],
      tax_id:  ["醫事機構代碼", "機構代碼"],
      address: ["地址", "醫事機構地址", "院所地址"],
      phone:   ["電話", "聯絡電話", "電話號碼"],
      sub:     ["型態別", "特約類別", "服務項目", "型態"],
    },
    rowFilter: { field: ["型態別", "特約類別", "服務項目", "型態", "醫事機構名稱"], includes: ["中醫"] },
  },
];

export const getSource = (id: string) => GOV_SOURCES.find((s) => s.id === id);
