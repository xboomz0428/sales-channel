# HeroHerb B2B 名單系統 — Claude 設計需求包(Design Brief)

> 用法:設計畫面時,把本檔案連同 `heroherb-lead-system-spec.md` 一起給 Claude,
> 然後從第 6 節挑一個「畫面指令」貼上,即可產出可互動的 HTML/React 原型。
> 一次只做一個畫面,迭代滿意後再做下一個。

---

## 1. 產品一句話

HeroHerb(好漢草)的 B2B 開發工具:採集連鎖養生館、宮廟、長照等通路名單,
追蹤 OEM 商機進度,並維護成交後的客情與回購。

## 2. 使用者與情境

| 角色 | 裝置 | 情境 |
|------|------|------|
| 創辦人 Wei,46 歲(主要使用者) | 桌機 | 早上看儀表板、跑採集任務、確認比對、出貨前查名單 |
| 同上 | 手機 | 外出拜訪前查品牌資料、現場一鍵撥號/加LINE、談完 30 秒記錄 |
| 兼職營運助理 | 桌機 | 擴充中心人工查找、低信心比對確認、匯出名單 |

## 3. 設計調性

- **關鍵詞**:療癒、清爽、草本溫潤、無壓力的工作感
- **風格**:大量留白、低資訊密度(寧可多捲動,不要擠)、大圓角、
  柔和陰影、霧面色塊;禁用高飽和色、粗黑框線、密集表格線
- **氣質參考**:Headspace 的柔和 × 無印良品的質樸 × Notion 的留白
- 警示與停滯提醒也要「溫柔提醒」而非「警報」:用陶土色軟底 Badge,
  不用鮮紅、不用閃爍

## 4. 設計 Tokens(療癒系)

```css
/* 色彩 — 低飽和、霧面、草本 */
--primary:    #6B8F71;  /* 霧松綠(主按鈕/重點,柔和不沉重) */
--primary-50: #EEF3EE;  /* 淡草綠(選中/hover 底) */
--sage:       #A8BCA1;  /* 鼠尾草綠(次要元素/圖示) */
--accent:     #D9B68C;  /* 燕麥金(三節任務/星級,取代艾金棕) */
--danger:     #C98A6B;  /* 陶土色(停滯/流失,柔化的警示) */
--bg:         #FBFAF7;  /* 奶油白(頁面背景) */
--surface:    #FFFFFF;  /* 卡片 */
--surface-2:  #F4F1EA;  /* 區塊底(燕麥色) */
--text:       #3D4A3E;  /* 墨綠灰(主文字,比純黑柔和) */
--text-muted: #6E7A6D;  /* 霧綠灰(次要文字;加深確保對比度 ≥4.5:1) */
--border:     #ECE8DF;  /* 極淡邊線,能不用就不用 */

/* 字級 — 使用者 46 歲,可讀性優先,寧大勿小 */
--font-base:  16px;     /* 全站基準,手機內文 16–17px */
--font-table: 15px;     /* 表格/卡片內文下限 */
--font-badge: 13px;     /* Badge/輔助字下限,全站不得小於 13px */
--font-h2:    20px;     /* 區塊標題 */
--font-h1:    24px;     /* 頁面標題 */
line-height: 1.6;       /* 行高放寬 */
數字重點(金額/分數/天數)可放大至 18–22px medium;
所有字級用 rem,支援系統字級放大不破版

/* 觸控 — 點擊目標 ≥44×44px(按鈕/勾選/Tab) */

/* 形狀 — 圓潤 */
--radius: 16px;          /* 卡片 */
--radius-sm: 10px;       /* 按鈕/Badge */
--shadow: 0 2px 12px rgba(61,74,62,.06);  /* 柔和大範圍 */

/* 空間 — 呼吸感 */
卡片內距 ≥ 20px;區塊間距 ≥ 24px;表格列高 ≥ 56px

/* 字體 */
font-family: "Noto Sans TC", system-ui, sans-serif;
標題用 medium(500)不用 bold;數字欄位 tabular-nums;
```

狀態色標(全系統一致,皆為「淡底+深字」軟色 Badge):
| 狀態 | 底色 / 字色 |
|------|------------|
| 新名單 new | #F0EEE8 / #8A8678 |
| 已聯繫 contacted | #E3ECF2 / #5B7C99 |
| 樣品 sampling | #EAE5F0 / #7B6E99 |
| 報價 quoting | #F5EDDD / #A6824A |
| 議約 negotiating | #E6EFE6 / #5E7F64 |
| 成交 won | #DCE9DC / #4A6B50 |
| 流失/停滯 | #F3E4DC / #A66A4F |

## 5. 版型規則(摘要,完整見 spec 第 8 節)

- 桌機 ≥1024px:左側 Sidebar(名單/進度/客情/比對/擴充/任務/儀表板)
- 手機 <768px:底部 Tab Bar(名單・跟進・進度・我的),頂部搜尋
- 表格→手機自動轉卡片;篩選→手機用底部抽屜
- 元件庫:shadcn/ui 風格(Button, Card, Badge, Tabs, Drawer, Table)

## 6. 畫面指令(逐一貼給 Claude)

### 畫面 A:名單總覽(優先做)
```
請依 design brief 的 tokens 與版型規則,設計「名單總覽」頁,做成單檔
React 原型(手機+桌機 RWD):
- 桌機:表格欄位=品牌/類別/分店數/城市/聯絡管道圖示(📧💬📘📷)/
  優先分數/狀態 Badge;頂部 filter bar(產業、城市、是否連鎖、狀態)
- 手機:卡片列表 + 底部抽屜篩選 + 底部 Tab Bar
- 用第 7 節的 mock data 渲染,狀態色依第 4 節色標
- 點擊列/卡片時先用 console.log 代替跳轉
```

### 畫面 B:品牌詳情(開發工作檯)
```
設計「品牌詳情」頁:
- 桌機三欄:左=基本資料(統編/負責人/分店地圖佔位)+聯絡管道(可標記
  已驗證);中=窗口卡片(新增/編輯);右=聯繫紀錄時間軸+下次跟進
- 手機:Tabs(資料/窗口/紀錄),頂部固定「撥號」「LINE」兩顆大按鈕
  (tel: 與 lin.ee deep link)
- 含「30秒快速記錄」底部抽屜:三顆大按鈕(有興趣/再約/拒絕)+日期+備註
```

### 畫面 C:商機進度看板
```
設計「業務開發進度表」:
- 桌機:七欄看板(new→contacted→sampling→quoting→negotiating→won→lost),
  卡片顯示品牌/產品線/預估年營收/機率,可拖拉(dnd-kit 或簡化為按鈕移動)
- 停留 sampling>14天 或 quoting>30天 的卡片加朱紅警示角標
- 頂部顯示加權商機總值 Σ(年營收×機率)
- 手機:依階段分組列表,卡片右滑或按鈕快速換階段
```

### 畫面 D:今日跟進(手機首頁)
```
設計手機優先的「今日跟進」頁:
- 區塊依序:回購提醒(剩N天)/停滯商機/三節送禮任務/拜訪到期
- 每張卡片有一鍵完成勾選與撥號/LINE按鈕
- 頂部問候列顯示日期與今日任務數
```

### 畫面 E:儀表板
```
設計「儀表板」:漏斗圖(新名單→成交)、各產業名單數長條圖、
資料完整度(統編比對率/LINE覆蓋率)環形圖、被冷落的A級客戶清單。
圖表用 Recharts 風格,桌機 2×2 網格、手機直向堆疊。
```

### 畫面 F:採集任務 + 比對中心(後台,桌機 only)
```
設計後台兩頁(桌機 only,手機顯示「請用電腦操作」):
1. 採集任務:關鍵字 tag 輸入+城市勾選+預估請求數/費用即時計算+
   任務列表(進度條,Realtime 樣式)
2. 比對中心:低信心配對佇列,左右並排「Places 資料 vs 政府名冊資料」
   差異高亮,確認/拒絕按鈕
```

## 7. Mock Data(渲染用)

```json
{
  "brands": [
    {"id":1,"name":"6星集足體養生會館","industry":"養生會館","stores":9,
     "cities":"北/中/南","channels":["line","fb","ig","email"],"score":92,
     "status":"quoting","tax_id":"16830000","owner":"江○○",
     "est_annual":1800000,"probability":60,"stage_days":12},
    {"id":2,"name":"悅禾莊園SPA","industry":"養生會館","stores":12,
     "cities":"北/中/南","channels":["line","fb","ig"],"score":89,
     "status":"sampling","est_annual":2400000,"probability":40,"stage_days":18},
    {"id":3,"name":"小林越式洗髮","industry":"越式洗髮","stores":5,
     "cities":"新北","channels":["fb"],"score":61,"status":"contacted"},
    {"id":4,"name":"大甲鎮瀾宮","industry":"宮廟","stores":1,
     "cities":"台中","channels":["fb","line"],"score":95,"status":"new",
     "extra":"主祀:天上聖母"},
    {"id":5,"name":"青松健康(長照)","industry":"長照","stores":23,
     "cities":"中部","channels":["email","fb"],"score":88,"status":"won",
     "tier":"A","reorder_in_days":6},
    {"id":6,"name":"龍巖人本","industry":"禮儀","stores":40,
     "cities":"全台","channels":["email"],"score":85,"status":"lost",
     "lost_reason":"已有供應商"}
  ],
  "care_today": [
    {"brand":"青松健康","type":"reorder","title":"預估補貨日剩 6 天"},
    {"brand":"6星集","type":"festival","title":"端午送禮(去年:足浴禮盒×3)"},
    {"brand":"滋和堂","type":"visit","title":"A級季拜訪到期"}
  ]
}
```

## 8. 產出順序建議

A 名單總覽 → D 今日跟進(手機)→ B 品牌詳情 → C 進度看板 → E 儀表板 → F 後台

每個畫面驗收清單:
- [ ] 桌機/手機兩種寬度都檢查過
- [ ] 狀態色與 tokens 一致
- [ ] 用 mock data,不要 lorem ipsum
- [ ] 中文字體 Noto Sans TC、數字 tabular-nums
- [ ] 療癒感檢核:留白足夠(卡片內距≥20px)、無高飽和色、
      無粗框線、警示為陶土軟色而非鮮紅
- [ ] 可讀性檢核:內文≥16px、任何文字≥13px、行高1.6、
      次要文字對比度≥4.5:1、觸控目標≥44px、長按手勢一律有按鈕替代
