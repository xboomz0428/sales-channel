// 政府開放資料匯入 — Phase 1 來源設定
// 設計原則：政府開放資料的「下載網址」會變動（觀光署 V1.0 已於 2026/6/30 下架），
// 所以實際 URL 由使用者在匯入頁貼上/確認；這裡只定義「欄位對應」與來源中繼資料。
// 解析時以「表頭名稱」對應（順序變動也能對上），每個邏輯欄位給多個候選名稱。

export type SourceFormat = "csv" | "json" | "xml" | "zipjson";

export interface GovSource {
  id: string;            // data_source 值（gov:xxx）
  label: string;         // 顯示名稱
  industry: string;      // 寫入 brands.industry
  format: SourceFormat;  // 預設檔案格式
  hasPhone: boolean;     // 名冊本身是否含電話（決定匯進來能否直接外聯）
  datasetUrl: string;    // data.gov.tw 資料集頁（使用者由此取得實際下載連結）
  defaultUrl?: string;   // 已知可用的下載網址（自動帶入輸入框，仍可改）
  phase: 1 | 2 | 3 | 4;  // 規劃階段
  needsApplication?: boolean; // 需先申請才能串（例如 GCIS 需 IP 白名單）
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
    defaultUrl: "https://data.gcis.nat.gov.tw/od/file?oid=6EEC675F-3972-47AE-B157-B92CA5749773",
    phase: 1,
    note: "公司登記名冊（含統編/地址/公司狀態），無電話與負責人，需靠官網爬蟲補。",
    fields: {
      name:    ["公司名稱", "營業人名稱", "機構名稱", "名稱"],
      tax_id:  ["統一編號", "統編", "營利事業統一編號"],
      address: ["公司地址", "公司所在地", "營業地址", "地址", "地址全址"],
      owner:   ["負責人", "代表人姓名", "負責人姓名"],
      phone:   ["電話", "聯絡電話", "電話號碼"],
    },
  },
  {
    id: "gov:lodging",
    label: "旅館 / 民宿（觀光署旅宿）",
    industry: "旅館",
    format: "zipjson",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/7780",
    defaultUrl: "https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Hotel-json.zip",
    phase: 1,
    note: "觀光資料標準 V2.0（ZIP 內含 HotelList.json），含電話、星級、客房數；HotelClasses=4 自動歸民宿。",
    fields: {
      name: ["HotelName", "Name", "名稱"],
    },
  },
  {
    id: "gov:travel",
    label: "旅行社（旅行業基本資料）",
    industry: "旅行社",
    format: "xml",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/72074",
    defaultUrl: "https://travelagency.tad.gov.tw/Forms/XML/TravelAgent.aspx?key=DF8T1NkUg",
    phase: 1,
    note: "觀光署旅行業 XML，含地址、電話、負責人、註冊別（綜合/甲種/乙種 → 次分類）。",
    fields: {
      name:    ["TRACNAME", "公司名稱", "名稱"],
      address: ["TRAADD", "地址"],
      phone:   ["TRATEL", "電話"],
      owner:   ["TRAMANAGER", "負責人"],
      sub:     ["TRASIKEY_I", "註冊別", "種類"],
    },
  },
  {
    id: "gov:tcm",
    label: "中醫診所（健保特約醫事機構）",
    industry: "中醫診所",
    format: "csv",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/39283",
    defaultUrl: "https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D21004-009",
    phase: 1,
    note: "健保特約院所清單（全部診所），含電話/地址；自動只留『中醫』機構種類。",
    fields: {
      name:    ["醫事機構名稱", "機構名稱", "名稱"],
      tax_id:  ["醫事機構代碼", "機構代碼"],
      address: ["地址", "醫事機構地址", "院所地址"],
      phone:   ["電話", "聯絡電話", "電話號碼"],
      sub:     ["醫事機構種類", "型態別"],
    },
    rowFilter: { field: ["醫事機構種類", "醫事機構名稱"], includes: ["中醫"] },
  },
  {
    id: "gov:clinic",
    label: "全部診所（健保特約·各科別）",
    industry: "診所",
    format: "csv",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/39283",
    defaultUrl: "https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D21004-009",
    phase: 1,
    note: "健保特約全部診所（內科/小兒科/婦產科/皮膚科/中醫…），含電話/地址；科別存到次分類。tmip 等網站也是彙整此份官方資料，直接匯入更完整乾淨。",
    fields: {
      name:    ["醫事機構名稱", "機構名稱", "名稱"],
      tax_id:  ["醫事機構代碼", "機構代碼"],
      address: ["地址", "醫事機構地址", "院所地址"],
      phone:   ["電話", "聯絡電話", "電話號碼"],
      sub:     ["醫事機構種類", "型態別"],
    },
    rowFilter: { field: ["醫事機構種類", "醫事機構名稱"], includes: ["診所"] },
  },

  // ── Phase 3：人民團體（公會 / 協會 / 基金會 / 社福團體）──────────
  {
    id: "gov:civic",
    label: "人民團體（全國性社會團體）",
    industry: "人民團體",
    format: "csv",
    hasPhone: false,
    datasetUrl: "https://data.gov.tw/dataset/13603",
    defaultUrl: "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/DA99D92C-531A-40B2-AFF6-D5C1C7AEE022/resource/6CD84A67-522B-4811-96B8-3E7942AE3C1B/download",
    phase: 3,
    note: "全國性人民團體名冊（協會/學會），含理事長與地址；此名冊無電話，電話需另補。",
    fields: {
      name:    ["Name", "團體名稱", "人民團體名稱", "名稱"],
      address: ["address", "會所住址", "會址", "地址", "通訊地址"],
      owner:   ["Chairman", "理事長", "負責人", "代表人"],
    },
  },

  // ── Phase 4：宮廟（全國宗教資訊系統-寺廟）──────────────────────
  {
    id: "gov:temple",
    label: "宮廟 / 寺廟（全國宗教資訊系統）",
    industry: "宮廟",
    format: "xml",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/8203",
    defaultUrl: "https://religion.moi.gov.tw/Report/temple.xml",
    phase: 4,
    note: "全國寺廟 XML（中文標籤），含教別、地址、電話、負責人。部分寺廟無電話。",
    fields: {
      name:    ["寺廟名稱", "宮廟名稱", "名稱"],
      address: ["地址", "寺廟地址"],
      phone:   ["電話", "聯絡電話"],
      owner:   ["負責人", "管理人", "代表人"],
      sub:     ["教別", "宗教別", "主祀神祇"],
    },
  },

  // ── Phase 4：月子中心（全國開業護理機構清冊-產後護理之家）──────
  {
    id: "gov:postpartum",
    label: "產後護理之家（月子中心·官方）",
    industry: "產後護理之家",
    format: "csv",
    hasPhone: true,
    datasetUrl: "https://data.gov.tw/dataset/115950",
    defaultUrl: "https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html",
    phase: 4,
    note: "全國開業護理機構清冊，自動只留『產後護理之家』，含機構電話/地址。",
    fields: {
      name:    ["機構名稱", "護理機構名稱", "名稱"],
      address: ["地址", "機構地址", "院所地址"],
      phone:   ["機構電話", "電話", "聯絡電話"],
      sub:     ["機構類別", "類別", "型態"],
    },
    rowFilter: { field: ["機構類別", "類別", "型態", "機構名稱"], includes: ["產後護理", "月子"] },
  },

  // ── Phase 2：養生館（GCIS 商工登記，依營業項目）— 需先申請 ──────
  {
    id: "gov:gcis_wellness",
    label: "養生館 / 長照（GCIS 商工登記）",
    industry: "養生館",
    format: "json",
    hasPhone: false,
    needsApplication: true,
    datasetUrl: "https://data.gcis.nat.gov.tw/",
    phase: 2,
    note: "依營業項目代碼撈公司登記；GCIS 需先寄信 opendata.gcis@gmail.com 申請 IP 白名單才能串。",
    fields: {
      name:    ["Company_Name", "公司名稱", "名稱"],
      tax_id:  ["Business_Accounting_NO", "統一編號"],
      address: ["Company_Location", "公司所在地", "地址"],
      owner:   ["Responsible_Name", "負責人"],
    },
  },
];

export const getSource = (id: string) => GOV_SOURCES.find((s) => s.id === id);
