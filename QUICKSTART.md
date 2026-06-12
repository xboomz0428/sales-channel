# 快速啟動指南

## 本地開發

### 1. 安裝依賴

```bash
cd "C:\Users\Username\sales-channel"
npm install
```

### 2. 配置環境變數

複製 `.env.local.example` 為 `.env.local`：

```bash
cp .env.local.example .env.local
```

編輯 `.env.local`，填入以下信息：

```env
# Supabase（暫時可保持示例值）
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=example-key

# Google Places API（暫時可保持示例值）
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=example-key
```

> 如需完整功能，請按照 DEPLOYMENT.md 獲取真實的 API 密鑰

### 3. 啟動開發服務器

```bash
npm run dev
```

開啟瀏覽器訪問 [http://localhost:3000](http://localhost:3000)

### 4. 開始開發

- 編輯 `app/` 目錄中的文件
- 編輯 `components/` 目錄中的組件
- 開發服務器會自動刷新（Hot Reload）

---

## 項目結構

```
sales-channel/
├── app/                    # Next.js App Router
│   ├── page.tsx           # 儀表板
│   ├── leads/             # 名單管理
│   ├── brands/            # 品牌管理
│   ├── opportunities/     # 商機管理
│   ├── matching/          # 數據比對
│   └── followups/         # 跟進管理
├── components/            # React 組件
│   ├── Navigation.tsx      # 導航欄
│   ├── Card.tsx           # 通用卡片
│   └── StatCard.tsx       # 統計卡片
├── public/                # 靜態資源
├── package.json           # 依賴配置
├── tsconfig.json          # TypeScript 配置
└── tailwind.config.ts     # Tailwind CSS 配置
```

---

## 主要功能預覽

### 儀表板 (`/`)
- 實時統計數據
- 最近新增名單
- 待處理任務

### 名單總覽 (`/leads`)
- 搜尋和篩選商家
- 按產業、地區分類
- 快速查看聯繫方式

### 品牌詳情 (`/brands`)
- 連鎖品牌卡片視圖
- 分店數和營運位置
- 開發狀態追蹤

### 商機看板 (`/opportunities`)
- 商機總額和平均機率
- 成功率進度條
- 下一步行動提醒

### 採集比對 (`/matching`)
- 批量上傳名單
- Google & 政府名冊比對
- 數據完整度評分

### 今日跟進 (`/followups`)
- 每日任務清單
- 聯繫方式和時間
- 完成狀態追蹤

---

## 常用命令

```bash
# 開發模式
npm run dev

# 生產構建
npm run build

# 運行生產構建
npm run start

# 檢查代碼質量
npm run lint

# TypeScript 檢查
npx tsc --noEmit
```

---

## 添加新頁面

1. 在 `app/` 中建立新目錄，例如 `app/reports/`
2. 創建 `page.tsx` 文件
3. 編寫 React 組件

示例：

```typescript
// app/reports/page.tsx
export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">報告</h1>
      {/* 你的內容 */}
    </div>
  );
}
```

4. 自動添加到導航菜單（修改 `components/Navigation.tsx`）

---

## 修改樣式

本項目使用 Tailwind CSS，使用 Utility Class 修改樣式：

```typescript
// 修改顏色
<div className="bg-blue-600 text-white">

// 修改大小
<h1 className="text-3xl font-bold">

// 響應式設計
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
```

---

## 整合 Supabase

在你的組件中使用 Supabase：

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// 查詢數據
const { data, error } = await supabase
  .from('leads')
  .select('*');
```

---

## 部署

### 部署到 Vercel（推薦）

1. 推送到 GitHub
2. 在 Vercel 中導入 repository
3. 配置環境變數
4. 自動部署

詳見 `DEPLOYMENT.md`

### 其他部署選項

- Netlify: `netlify deploy`
- Railway: Railway CLI
- Digital Ocean: Docker 容器
- AWS: Amplify 或 EC2

---

## 故障排除

### 問題：Port 3000 已被占用

```bash
# 使用其他 port
npm run dev -- -p 3001
```

### 問題：依賴版本衝突

```bash
# 清理並重新安裝
rm -r node_modules package-lock.json
npm install
```

### 問題：TypeScript 錯誤

```bash
# 重新生成類型
npx next telemetry disable
npm run build
```

### 問題：環境變數未加載

```bash
# 確認 .env.local 文件存在並重啟開發服務器
```

---

## 資源連結

- [Next.js 文件](https://nextjs.org/docs)
- [React 文件](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com/docs)
- [Vercel](https://vercel.com/docs)

---

## 下一步

1. ✅ 在本地運行 `npm run dev`
2. ✅ 瀏覽各個頁面
3. ✅ 根據需要修改頁面和組件
4. ✅ 配置 Supabase 和 API Key
5. ✅ 推送到 GitHub 並部署到 Vercel

需要幫助？聯絡: xboomz@gmail.com
