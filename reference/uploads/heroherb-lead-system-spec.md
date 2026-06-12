# HeroHerb B2B 名單開發系統 — 架構與功能說明

> 版本:v0.3
> 更新:新增前端設計規範(桌機×手機)、業務開發進度表(商機看板)、客情維護模組(分級/回購/三節提醒);Schema 增加 opportunities、care_plans、care_tasks
> 用途:將現有 Python 腳本(heroherb_lead_finder.py)升級為 Web App,
> 支援自訂產業關鍵字、聯絡窗口資料擴充、政府名冊比對、連鎖品牌歸戶與開發進度管理。

---

## 1. 專案目標

| 目標 | 說明 |
|------|------|
| 名單採集 | 任意產業關鍵字 × 城市,自動抓取店家基本資料 |
| 政府名冊比對 | 以統編串接財政部/經濟部/各部會資料,補齊負責人、行業代號、執照資訊 |
| 資料擴充 | 自動補齊 Email、LINE、FB、IG |
| 連鎖歸戶 | 同品牌/同法人分店自動合併,鎖定連鎖總部為開發對象 |
| 開發管理 | 輕量 CRM:窗口、聯繫紀錄、狀態追蹤、跟進提醒 |

---

## 2. 重要前提:聯絡資料的可取得性(務必先理解)

各欄位的資料來源與「自動化程度」不同,系統設計分三層:

### 第一層:全自動(程式直接抓)

| 欄位 | 來源 |
|------|------|
| 店名 / 地址 / 市話 | Google Places API |
| 官網網址 / 評分 / 評論數 | Google Places API |
| **統一編號 / 行業代號 / 資本額** | 財政部 全國營業(稅籍)登記資料集 |
| **負責人姓名 / 分公司清單** | 經濟部商工登記公示資料 API |
| 執照/評鑑/主祀神祇等加值欄位 | 各部會專屬名冊(見第 9 節) |

### 第二層:半自動(爬官網/粉專頁面解析)

| 欄位 | 抓法 | 命中率(估) |
|------|------|------------|
| Email | 官網頁面掃 `mailto:` 與 email 正則 | 40–60% |
| LINE 官方帳號 | 掃 `line.me`、`lin.ee`、`@LINE ID` 連結 | 50–70% |
| Facebook 粉專 | 掃 `facebook.com` 連結 | 60–80% |
| Instagram | 掃 `instagram.com` 連結 | 50–70% |

### 第三層:人工補登(系統提供欄位,無法自動)

| 欄位 | 說明 |
|------|------|
| **實際採購窗口姓名** | 負責人 ≠ 採購窗口。連鎖品牌的窗口(店長/採購/總部行政)幾乎不會公開在網路上,需透過 LINE 官方帳號、電話初訪、BNI 引薦後手動填入 |
| 窗口手機 / 個人 Email | 同上,首次接觸後補登 |
| 窗口職稱 / 決策角色 | 同上 |

> **個資法提醒**:第一、二層皆為公開的「商業聯絡資訊」與政府公示資料,
> B2B 開發用途屬合理利用;第三層的個人手機/Email 屬個資,僅限業務聯繫
> 用途、不可轉售或匯出給第三方,系統應記錄資料來源以備說明。

---

## 3. 統編串接與資料比對策略(核心設計)

### 3.1 為什麼以統編為主鍵

統一編號是台灣所有政府資料的共同鍵。財政部「全國營業(稅籍)登記資料集」
收錄**全台所有營業人**(含未辦公司登記的小行號、工作室),欄位包含
統一編號、營業人名稱、營業地址、資本額、行業代號、設立日期、是否使用
統一發票,整批可下載、每月更新。拿到統編後即可串接其他所有名冊。

### 3.2 比對管線

```
Google Places(店名 + 地址)
        │  模糊比對(店名正規化 + 地址標準化)
        ▼
財政部 稅籍登記資料集 ──► 取得【統編 + 行業代號 + 資本額】
        │  統編 join
        ▼
經濟部 商工登記 API ──► 取得【負責人 + 分公司清單 + 營業項目】
        │  統編 / 名稱 join
        ▼
各部會專屬名冊 ──► 取得【執照、評鑑、特約、主祀神祇等加值欄位】
```

### 3.3 比對規則

| 規則 | 說明 |
|------|------|
| 地址標準化 | 全形轉半形、「臺→台」、移除樓層號,取「路段+號」做指紋 |
| 店名比對 | 沿用品牌正規化邏輯,另比對「招牌名 vs 登記名」(常不同,如招牌「6星集」登記「六星集企業」),需保留別名表 |
| 信心分級 | 統編直接命中=高;名稱+地址雙符合=中;僅名稱相似=低(轉人工確認) |
| 連鎖判斷升級 | 同一統編(總機構)下多個營業地址 → 直營連鎖;不同統編但同負責人 → 關係企業;皆比店名正規化可靠 |

### 3.4 反向應用:名冊先行

沒有專屬名冊的業別(美容美髮、養生館、美甲)可**反向操作**:
直接用財政部行業代號篩出全量名單 → 再以名稱+地址去 Places 補
評論數、網站、營業狀態。比 Google 關鍵字搜尋更完整。

---

## 4. 系統架構

```
┌─────────────────────────────────────────────────┐
│                  使用者(瀏覽器)                   │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │   Next.js 14 (App Router)   │  Vercel 部署
        │   - 名單儀表板 / CRM UI      │
        │   - API Routes(輕量查詢)    │
        └──────┬───────────────┬──────┘
               │               │
   ┌───────────▼────┐   ┌─────▼──────────────────┐
   │   Supabase     │   │  Python Worker          │ Railway 部署
   │   - PostgreSQL │◄──┤  (FastAPI + Playwright) │
   │   - Auth       │   │  - Places 採集任務       │
   │   - Storage    │   │  - 政府名冊匯入/比對     │
   │   - Realtime   │   │  - 官網爬蟲擴充          │
   └────────────────┘   │  - 連鎖歸戶批次          │
                        └─────┬──────────────────┘
                              │
        ┌─────────┬───────────┼───────────┬─────────┐
        ▼         ▼           ▼           ▼         ▼
   Google     財政部       經濟部      各部會     店家官網
   Places     稅籍登記     商工登記    專屬名冊   /粉專
  (基本資料) (統編/行業)  (負責人)   (執照等)  (Email/LINE/社群)
```

### 技術選型

| 層 | 技術 | 理由 |
|----|------|------|
| 前端 | Next.js 14 + Tailwind + shadcn/ui | 與 PackMRP、社群管理系統同棧,元件可複用 |
| 資料庫 | Supabase (PostgreSQL + RLS) | 既有帳號體系,Realtime 可做任務進度條 |
| 採集 Worker | Python + FastAPI + Playwright | 官網爬蟲需要瀏覽器渲染 |
| 名冊匯入 | Python 批次(CSV/API → Supabase) | 稅籍資料集量大,用 COPY 批次匯入 |
| 任務佇列 | Supabase 資料表輪詢 或 Railway cron | 起步用輪詢即可,量大再上 Redis |
| 部署 | Vercel(前端)+ Railway(Worker) | 既有部署慣例 |

---

## 5. 資料管線(Pipeline)

```
[1.採集] → [2.去重] → [3.名冊比對] → [4.連鎖歸戶] → [5.擴充] → [6.評分] → [7.CRM]
```

| 階段 | 動作 | 觸發方式 |
|------|------|----------|
| 1. 採集 | Places Text Search(關鍵字×城市)**或** 政府名冊行業代號篩選 | 使用者建立「採集任務」 |
| 2. 去重 | (店名+地址) 指紋比對,跨關鍵字合併 | 採集完成自動 |
| 3. 名冊比對 | 依第 3 節策略串接稅籍→商工→專屬名冊,寫入統編/負責人/行業代號 | 自動,低信心轉人工 |
| 4. 連鎖歸戶 | 統編/負責人歸戶優先,品牌名正規化為輔 | 比對完成自動 |
| 5. 擴充 | 官網爬蟲抓 Email/LINE/FB/IG | 自動排程 或 手動逐筆 |
| 6. 評分 | 分店數×權重 + 評論數 + 有LINE/官網/執照加分 | 擴充完成自動 |
| 7. CRM | 窗口補登、聯繫紀錄、狀態流轉 | 人工操作 |

### 擴充階段細節(官網爬蟲)

1. 取 `website` 欄位,Playwright 開首頁 + 「聯絡我們」「關於我們」頁
2. 正則掃描:
   - Email:`[\w.+-]+@[\w-]+\.[\w.]+`(排除圖片/css)
   - LINE:`line.me/R/ti/p/`、`lin.ee/`、`@[\w]+` 搭配 LINE 字樣
   - FB / IG:`facebook.com/...`、`instagram.com/...`
3. 若無官網但有 FB 粉專 → 爬粉專「關於」區塊(反爬較強,失敗標記轉人工)
4. 每筆記錄 `source_url` 與 `fetched_at`(個資法舉證用)

---

## 6. 資料庫 Schema(Supabase)

```sql
-- 品牌(連鎖歸戶後的母體,開發對象)
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- 顯示品牌名(招牌名)
  registered_name text,            -- 登記名稱(常與招牌名不同)
  brand_key text unique,           -- 正規化指紋
  industry text,                   -- 對應採集關鍵字
  industry_code text,              -- 財政部行業代號
  store_count int default 1,
  is_chain boolean default false,
  chain_type text,                 -- direct(同統編)/affiliate(同負責人)/name(僅店名)
  tax_id text,                     -- 統一編號
  owner_name text,                 -- 負責人(商工登記)
  capital bigint,                  -- 資本額
  license_info jsonb,              -- 專屬名冊加值欄位(執照/評鑑/主祀神祇等)
  priority_score numeric,
  pitch text,                      -- 建議切入點
  status text default 'new',       -- new/contacted/quoting/sampling/closed_won/closed_lost
  created_at timestamptz default now()
);

-- 分店(Places 抓回的原始單位)
create table stores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  place_id text unique,
  name text not null,
  address text,
  address_key text,                -- 標準化地址指紋(比對用)
  city text,
  phone text,
  website text,
  rating numeric,
  review_count int,
  gmaps_url text,
  raw jsonb,
  created_at timestamptz default now()
);

-- 政府名冊原始資料(匯入後待比對)
create table gov_records (
  id uuid primary key default gen_random_uuid(),
  source text,                     -- fia_tax(稅籍)/gcis(商工)/moi_temple(寺廟)/
                                   -- mohw_ltc(長照)/nhi(健保特約)/tourism(旅宿/溫泉/露營)/
                                   -- moa_pet(寵物業)/moi_funeral(殯葬)
  tax_id text,
  name text,
  address text,
  address_key text,
  industry_code text,
  owner_name text,
  extra jsonb,                     -- 各名冊特有欄位
  matched_brand_id uuid references brands(id),
  match_confidence text,           -- high/medium/low/manual
  imported_at timestamptz default now()
);
create index on gov_records (tax_id);
create index on gov_records (address_key);

-- 聯絡管道(自動擴充結果,一品牌多筆)
create table brand_channels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  channel text,                    -- email / line / facebook / instagram / phone
  value text,
  source_url text,                 -- 抓取來源頁(舉證)
  fetched_at timestamptz,
  verified boolean default false
);

-- 聯絡窗口(人工補登,個資欄位)
create table contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  name text,
  title text,                      -- 職稱:店長/採購/總部行政
  role text,                       -- decision_maker / influencer / gatekeeper
  mobile text,
  email text,
  line_id text,
  note text,
  source text,                     -- 來源:電訪/LINE/BNI引薦/展會
  created_at timestamptz default now()
);

-- 聯繫紀錄
create table outreach_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  contact_id uuid references contacts(id),
  log_type text default 'develop',  -- develop(開發)/care(維護)/complaint(客訴)
  channel text,                    -- phone / line / email / visit
  summary text,
  next_action text,
  next_action_date date,
  created_at timestamptz default now()
);

-- 商機(業務開發進度,一品牌可多筆,如不同產品線)
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  product_line text,               -- 足浴包OEM/香氛/寵物線/禮盒
  stage text default 'new',        -- new/contacted/sampling/quoting/negotiating/won/lost
  stage_entered_at timestamptz default now(),  -- 停滯警示用
  est_monthly_qty int,
  est_annual_value bigint,
  probability int,                 -- 0-100
  expected_close date,
  owner text,
  lost_reason text,
  created_at timestamptz default now()
);

-- 客情維護設定(成交客戶)
create table care_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) unique,
  tier text,                       -- A / B / C
  visit_cycle_days int,            -- A=30 / B=90 / C=180
  reorder_cycle_days int,          -- 預估用量週期(回購提醒)
  last_order_date date,
  last_contact_date date,
  health text generated always as ( -- 也可改用 view 計算
    case when last_contact_date is null then 'red' else 'auto' end
  ) stored,
  note text
);

-- 客情任務(三節送禮/拜訪/回購提醒,自動產生+人工新增)
create table care_tasks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  task_type text,                  -- visit/reorder/festival/birthday/anniversary
  title text,                      -- 例:中秋送禮、預估補貨日
  due_date date,
  done boolean default false,
  done_note text,                  -- 例:去年送禮內容,避免重複
  created_at timestamptz default now()
);

-- 採集/比對任務
create table scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  keywords text[],
  cities text[],
  job_type text,                   -- places / registry_import / match / enrich
  status text default 'pending',
  progress int default 0,
  result_count int,
  error text,
  created_at timestamptz default now()
);
```

---

## 7. 功能模組

### 7.1 採集任務管理
- 自訂關鍵字(任意產業)+ 城市勾選,預估請求數與費用即時顯示
- **名冊先行模式**:選行業代號 → 從稅籍資料篩全量 → 反查 Places 補資料
- 任務進度條(Supabase Realtime 訂閱 `scrape_jobs.progress`)
- 歷史任務可重跑(增量更新,不重複建檔)

### 7.2 名單總覽
- 表格:品牌 / 類別 / 分店數 / 統編 / 聯絡管道圖示(📧 💬 📘 📷)/ 狀態
- 篩選:產業、行業代號、城市、是否連鎖、連鎖型態、分數、有無 Email/LINE、開發狀態
- 點擊展開:分店清單 + 聯絡管道 + 政府名冊比對結果

### 7.3 品牌詳情頁(開發工作檯)
- 左:基本資料、統編/負責人/執照資訊、分店地圖、自動抓到的管道(一鍵標記「已驗證/無效」)
- 中:**聯絡窗口卡片**(姓名/職稱/手機/Email/LINE,人工新增編輯)
- 右:聯繫紀錄時間軸 + 下次跟進日期
- 建議切入點(依產業自動帶入,可編輯)

### 7.4 比對中心
- 低信心比對佇列:名稱相似但地址不符的候選配對,人工確認/拒絕
- 招牌名↔登記名別名表維護
- 各名冊匯入狀態與最後更新時間

### 7.5 擴充中心
- 「待擴充」佇列:有官網但尚未爬的品牌,一鍵批次執行
- 失敗清單(無官網/粉專反爬):標記後轉人工查找

### 7.6 儀表板
- 漏斗:新名單 → 已聯繫 → 報價中 → 打樣中 → 成交
- 本週跟進提醒清單
- 各產業名單數量與資料完整度(統編比對率、Email/LINE 覆蓋率)

### 7.7 匯出
- Excel 匯出(沿用三工作表格式)
- 篩選後匯出(例:只匯出「有LINE的連鎖養生館」)

### 7.8 業務開發進度表(Pipeline)
- **看板視圖(桌機)**:依階段分欄拖拉 — 新名單 → 已聯繫 → 樣品寄出 → 報價中 → 議約 → 成交 / 流失
- **列表視圖(手機)**:依階段分組的卡片列表,點開快速更新階段
- 每筆商機欄位:預估月用量、預估年營收、成交機率(%)、預計成交日、負責人、流失原因
- 加權預測:Σ(預估年營收 × 機率)= 開發中商機總值,顯示於儀表板
- **停滯警示**:停留同一階段超過 N 天自動標紅(樣品寄出 14 天未跟進、報價 30 天未回)
- 週報匯出:本週推進/新增/流失清單,可直接貼 BNI 小組報告

### 7.9 客情維護模組(成交後)
- **客戶分級**:A(月訂量大/連鎖總部)/ B(穩定回購)/ C(零星),各級綁定拜訪週期(A 每月、B 每季、C 半年)
- **回購提醒**:依「上次出貨日 + 預估用量週期」推算補貨日,提前 7 天進入跟進清單 — 足浴包是耗材,這是最重要的營收引擎
- **三節提醒**:端午/中秋/春節前 3 週自動產生送禮任務清單(可附 HeroHerb 自家禮盒建議),含去年送禮紀錄避免重複
- **客情健康度**:距上次互動天數 × 分級權重,超標變黃/紅,儀表板顯示「最近被冷落的 A 級客戶」
- 重要日期:窗口生日、門市週年慶、新分店開幕(新分店=加購機會)
- 互動紀錄沿用 outreach_logs,加上 `log_type`(開發/維護/客訴)區分

---

## 8. 前端設計規範(桌機 × 手機)

### 8.1 設計原則
電腦是「資料工作檯」,手機是「外出開發工具」,同一資料、兩套操作邏輯:

| 面向 | 桌機 | 手機 |
|------|------|------|
| 導航 | 左側 Sidebar | 底部 Tab Bar(名單/跟進/進度/我的) |
| 名單 | TanStack Table 全欄位 | 卡片列表(品牌+分店數+狀態+管道圖示) |
| 篩選 | 頂部 Filter Bar | 底部抽屜(vaul Drawer)全螢幕點選 |
| 品牌詳情 | 三欄(資料/窗口/紀錄) | Tabs 切換 |
| 進度表 | 看板拖拉 | 分組列表 + 快速換階段 |
| 搜尋 | ⌘K 命令面板(cmdk) | 頂部搜尋框 |

### 8.2 手機端關鍵功能(外出情境)
- 電話/LINE deep link 一鍵撥出、加好友(`tel:`、`lin.ee`)
- **30 秒快速記錄**:大按鈕選結果(有興趣/再約/拒絕)+ 跟進日期 + 語音轉文字備註
- PWA:可加到主畫面、名單離線快取,收訊差也能查
- 「附近開發對象」:定位列出 3 公里內名單品牌,跑 BNI/送貨順路拜訪
- 今日跟進清單置頂:回購提醒 + 停滯商機 + 三節任務

### 8.3 後台管理(桌機優先)
採集任務、比對中心、名冊匯入屬於坐辦公室的操作,不做手機優化,
小螢幕顯示「請使用電腦操作」提示即可,節省開發量。

### 8.4 元件選型
shadcn/ui + TanStack Table(表格/卡片切換)+ Recharts(漏斗/趨勢)
+ vaul(手機抽屜)+ cmdk(桌機快速搜尋)+ dnd-kit(看板拖拉)

---

## 9. API 設計

### Next.js Route Handlers(查詢/CRM 操作)
```
GET  /api/brands?industry=&city=&is_chain=&status=&industry_code=
GET  /api/brands/:id            # 含 stores, channels, contacts, logs, gov_records
POST /api/contacts              # 新增窗口
POST /api/outreach              # 新增聯繫紀錄
POST /api/opportunities         # 新增商機
PATCH /api/opportunities/:id    # 更新階段/金額/機率
GET  /api/care/today            # 今日跟進:回購+三節+拜訪+停滯警示
POST /api/care/tasks            # 新增/完成客情任務
POST /api/match/confirm         # 人工確認比對 {gov_record_id, brand_id}
GET  /api/dashboard/funnel
GET  /api/export?filters=...
```

### Python Worker(FastAPI,僅內部呼叫)
```
POST /jobs/places               # {keywords, cities} → Places 採集
POST /jobs/registry/import     # {source} → 匯入政府名冊(稅籍/寺廟/長照...)
POST /jobs/match                # {brand_ids?} → 統編/地址比對
POST /jobs/enrich               # {brand_ids} → 官網爬蟲擴充
GET  /jobs/:id/status
```

---

## 10. 各業別官方資料來源對照表

政府名冊優勢:完整、含負責人/執照;Places 優勢:評論數、網站、營業狀態。

### 10.1 萬用底層(所有業別適用)

| 資料 | 機關 | 內容 | 取得方式 |
|------|------|------|----------|
| 全國營業(稅籍)登記資料集 | 財政部 | 統編、名稱、地址、資本額、**行業代號**、設立日期、是否用發票;含小行號/工作室 | data.gov.tw 整批下載,每月更新 |
| 商工登記公示資料 | 經濟部 | 負責人、資本額、營業項目、**分公司清單** | API(需 token,有限流) |

### 10.2 各業別專屬名冊

| 業別 | 機關 | 資料來源 | 加值欄位 |
|------|------|----------|----------|
| 禮儀公司 | 內政部 | 全國殯葬資訊入口網 | 合法業者認證 |
| 宮廟/寺廟 | 內政部 | 全國宗教資訊網 | **主祀神祇**、登記別、負責人 |
| 產後護理之家 | 衛福部 | 醫事機構查詢系統 | 開放資料、護理執照 |
| 長照/日照/護理之家 | 衛福部 | 長照特約機構名單 | **特約服務項目** |
| 中醫診所 | 衛福部/健保署 | 醫事機構查詢 + 健保特約名單 | 健保特約=規模訊號 |
| 旅館/民宿 | 觀光署 | 台灣旅宿網 | CSV 下載、合法登記 |
| 溫泉旅館 | 觀光署 | **溫泉標章**核發名單 | 過濾裝飾性湯屋 |
| 合法露營場 | 觀光署 | 露營場專區名單 | 合法性 |
| 寵物美容/旅館 | 農業部 | 寵物業管理資訊網 | **特定寵物業許可證**、負責人 |
| 美髮美容/養生館/美甲 | 無專屬名冊 | 稅籍行業代號篩選 + Places | — |
| 彌月/企業禮品 | 無專屬名冊 | 稅籍行業代號 + BNI 引薦 | — |

---

## 11. 開發階段建議

| 階段 | 範圍 | 產出 |
|------|------|------|
| Phase 1 | 現有腳本包成 FastAPI Worker + Supabase 寫入 | 採集任務可從 API 觸發 |
| Phase 2 | Next.js 名單總覽 + 篩選 + Excel 匯出 | 取代手動跑腳本 |
| Phase 3 | 稅籍資料集匯入 + 統編比對 + 商工登記串接 | 統編/負責人/行業代號補齊 |
| Phase 4 | 各部會專屬名冊匯入(寺廟/長照/旅宿/寵物優先) | 加值欄位 + 名冊先行模式 |
| Phase 5 | 官網爬蟲擴充(Email/LINE/社群) | 聯絡管道自動補齊 |
| Phase 6 | CRM:窗口、聯繫紀錄、**商機進度表(看板)** | 開發管理 |
| Phase 6.5 | **客情維護**:分級、回購提醒、三節任務、健康度 | 成交後營收引擎 |
| Phase 7(選配) | LINE Notify 跟進提醒、BNI 引薦來源標記 | 流程自動化 |

---

## 12. 風險與注意事項

1. **窗口資料無法全自動**:系統價值在「自動抓到管道(LINE/Email)→ 人工接觸 → 回填窗口」的閉環,不要期待爬蟲直接給採購姓名手機。
2. **招牌名 ≠ 登記名**:比對最大難點,需維護別名表並設計人工確認流程,低信心配對不要自動寫入。
3. **粉專反爬**:FB/IG 登入牆愈來愈嚴,設計上以官網為主、粉專為輔。
4. **個資法**:商業公開資訊與政府公示資料用於 B2B 開發屬合理範圍;窗口個人手機/Email 屬個資,限內部業務用途,保留來源紀錄,不外流。
5. **Google Places 費用**:Text Search 約 $32/千次,介面顯示預估費用;名冊先行模式可大幅減少 Places 請求量。
6. **政府 API 限流**:商工登記 API 有速率限制,Worker 需加退避重試;稅籍資料集改用整批下載匯入,不打 API。
7. **資料時效**:稅籍每月更新,各名冊更新頻率不一,`gov_records.imported_at` 需顯示於介面避免用到過期資料。
