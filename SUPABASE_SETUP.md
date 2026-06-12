# Supabase 設置指南

## 步驟 1：建立 Supabase 專案

1. 訪問 [supabase.com](https://supabase.com)
2. 使用 GitHub 或 Email 登入
3. 建立新專案：
   - 專案名稱：`heroherb-sales-channel`
   - 地區：選擇最近的位置（推薦 `ap-southeast-1` for Taiwan）
   - 密碼：記住這個密碼（復原時需要）
4. 等待專案初始化完成

## 步驟 2：取得 API 密鑰

1. 在 Supabase Dashboard 中：
   - 進入 **Settings** → **API**
   - 複製 **Project URL** 和 **anon public key**
   - 複製 **service_role key**（用於伺服器端操作）

2. 更新 `.env.local` 文件：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> ⚠️ **重要**：永遠不要將 `SUPABASE_SERVICE_ROLE_KEY` 提交到 Git！
> 已在 `.gitignore` 中排除 `.env.local`

## 步驟 3：建立資料庫 Schema

### 方案 A：使用 Supabase SQL Editor（推薦）

1. 在 Supabase Dashboard 中：
   - 進入 **SQL Editor**
   - 點擊 **New Query**
   - 複製並貼上 `supabase/migrations/001_init_schema.sql` 的全部內容
   - 點擊 **Run**

### 方案 B：使用 Supabase CLI

```bash
# 安裝 Supabase CLI
npm install -g supabase

# 登入
supabase login

# 連結到專案
supabase link --project-ref your_project_ref

# 執行 migration
supabase migration up
```

## 步驟 4：驗證設置

檢查 Supabase Dashboard 中的 **Table Editor**，確認以下表已建立：

- ✅ `brands`
- ✅ `stores`
- ✅ `brand_channels`
- ✅ `contacts`
- ✅ `outreach_logs`
- ✅ `opportunities`
- ✅ `care_plans`
- ✅ `care_tasks`
- ✅ `scrape_jobs`
- ✅ `gov_records`

## 步驟 5：本地開發測試

```bash
# 重新啟動開發服務器以載入環境變數
npm run dev

# 訪問應用
# http://localhost:3000
```

## 步驟 6：測試 API

### 使用 cURL 測試

```bash
# 查詢品牌
curl "http://localhost:3000/api/brands"

# 新增品牌
curl -X POST http://localhost:3000/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "name": "測試品牌",
    "industry": "養生館",
    "store_count": 1
  }'

# 查詢商機
curl "http://localhost:3000/api/opportunities"
```

## 常見問題

### Q: API 返回 401 錯誤
**A:** 檢查 `.env.local` 中的密鑰是否正確。確保 `NEXT_PUBLIC_SUPABASE_URL` 和密鑰已正確設置。

### Q: 資料庫表未建立
**A:** 確認 SQL migrations 已在 Supabase SQL Editor 中成功執行。查看執行結果中是否有錯誤。

### Q: 「行級安全」錯誤
**A:** 確認 RLS 策略已正確設置。對於開發，可以暫時關閉 RLS：
```sql
ALTER TABLE brands DISABLE ROW LEVEL SECURITY;
```

## 生產環境設置

部署到 Vercel 時：

1. 在 Vercel Dashboard 中設置環境變數：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. 確保 Supabase 備份已啟用：
   - Supabase Dashboard → **Backups**

## 下一步

- [ ] 實現前端 API 整合（更新頁面調用真實 API）
- [ ] 新增認證（Supabase Auth）
- [ ] 實現實時更新（Supabase Realtime）
- [ ] 設置 Edge Functions（複雜計算）
- [ ] 備份和恢復策略

## 參考資源

- [Supabase 文檔](https://supabase.com/docs)
- [Supabase JavaScript 客戶端](https://supabase.com/docs/reference/javascript)
- [行級安全 (RLS)](https://supabase.com/docs/guides/auth/row-level-security)
