# HeroHerb 銷售通路開發系統

一個現代化的 B2B 銷售名單採集、比對與 CRM 管理系統，支援多渠道整合、智能數據比對與業務進度追蹤。

## 功能模組

- **儀表板** - 實時銷售進度概覽、關鍵指標展示
- **名單總覽** - 商家名單搜尋、篩選與分類管理
- **品牌詳情** - 連鎖品牌與關係企業層級管理
- **商機看板** - 業務開發管道可視化、成交機率追蹤
- **採集比對** - Google Places 與政府名冊自動化比對
- **今日跟進** - 每日任務管理與進度追蹤

## 技術棧

- **前端框架**: Next.js 15 + React 19 + TypeScript
- **樣式**: Tailwind CSS
- **後端**: Next.js API Routes
- **資料庫**: Supabase (PostgreSQL)
- **部署**: Vercel
- **API 整合**: Google Places API, 財政部/經濟部公開資料

## 快速開始

### 安裝依賴

```bash
npm install
```

### 環境設定

複製 `.env.local.example` 為 `.env.local` 並填入以下變數：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google API
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=your_google_places_api_key
```

### 開發環境

```bash
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 查看應用

### 生產構建

```bash
npm run build
npm run start
```

## 部署到 Vercel

### 前置條件

- GitHub 帳號並已推送此 repo
- Vercel 帳號 (免費註冊: https://vercel.com)

### 部署步驟

1. 前往 [Vercel 儀表板](https://vercel.com/dashboard)
2. 點擊「新增專案」(New Project)
3. 選擇此 GitHub repository
4. 配置環境變數（複製 `.env.local` 的內容）
5. 部署

### 自動部署

每次 push 到 main 分支時，Vercel 會自動部署。

## 資料架構

### 核心表格

- `leads` - 個別商家名單
- `brands` - 連鎖品牌信息
- `opportunities` - 商機與開發進度
- `contacts` - 聯繫人信息
- `follow_ups` - 跟進記錄
- `data_matches` - 採集比對結果

## API 路由

- `POST /api/leads` - 新增名單
- `GET /api/leads` - 查詢名單
- `POST /api/matching` - 觸發數據比對
- `POST /api/followups` - 記錄跟進

## 開發指南

### 文件結構

```
app/
├── page.tsx           # 儀表板
├── leads/            # 名單管理
├── brands/           # 品牌管理
├── opportunities/    # 商機管理
├── matching/         # 數據比對
├── followups/        # 跟進管理
└── api/              # API 路由

components/
├── Navigation.tsx    # 導覽欄
├── Card.tsx         # 卡片組件
└── StatCard.tsx     # 統計卡片

lib/
├── supabase.ts      # 資料庫客戶端
└── api.ts           # API 工具
```

## 常見問題

### 如何新增名單？

在「名單總覽」點擊「新增名單」按鈕，填入商家信息並上傳。

### 如何進行數據比對？

在「採集比對」頁面上傳 CSV/Excel 名單，系統自動與 Google Places 和政府名冊比對。

### 支援哪些資料格式？

目前支援 CSV 和 Excel 格式，包含 13 個標準欄位。

## 貢獻指南

1. Fork 此 repository
2. 建立 feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit 變更 (`git commit -m 'Add some AmazingFeature'`)
4. Push 到 branch (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 授權

MIT License - 詳見 LICENSE 檔案

## 聯繫方式

如有問題，請聯絡 [xboomz@gmail.com](mailto:xboomz@gmail.com)
